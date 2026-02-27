import type { SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import {
  BUILTIN_GITHUB_CLIENT_ID,
  OAUTH_BASE_URL,
  OAUTH_ENCRYPTION_SECRET,
  OAUTH_STATE_TTL_MS,
  decryptSecret,
  encryptSecret,
  sanitizeOAuthRedirect,
} from "../../../../oauth/helpers.ts";
import type { DecryptedOAuthToken } from "../../shared/types.ts";
import { createOAuthRouteHelpers } from "./helpers.ts";
import { createOAuthStatusBuilder } from "./status.ts";
import { buildDegradedOAuthStatus } from "./status-response.ts";

export function registerOAuthRoutes(ctx: RuntimeContext): void {
  const {
    app,
    db,
    nowMs,
    firstQueryValue,
    normalizeOAuthProvider,
    ensureOAuthActiveAccount,
    getOAuthAccounts,
    getPreferredOAuthAccounts,
    refreshGoogleToken,
    getActiveOAuthAccountIds,
    setOAuthActiveAccounts,
    setActiveOAuthAccount,
    removeActiveOAuthAccount,
  } = ctx;

  const {
    handleGitHubCallback,
    handleGoogleAntigravityCallback,
    startGitHubOAuth,
    startGoogleAntigravityOAuth,
    upsertOAuthCredential,
  } = createOAuthRouteHelpers(ctx);

  const { buildOAuthStatus } = createOAuthStatusBuilder(ctx);

  app.get("/api/oauth/status", async (_req, res) => {
    try {
      const providers = await buildOAuthStatus();
      res.json({ storageReady: Boolean(OAUTH_ENCRYPTION_SECRET), providers });
    } catch (err) {
      res.status(200).json(buildDegradedOAuthStatus(_req, err));
    }
  });

  app.get("/api/oauth/start", (req, res) => {
    const provider = firstQueryValue(req.query.provider);
    const redirectTo = sanitizeOAuthRedirect(firstQueryValue(req.query.redirect_to));

    try {
      let authorizeUrl: string;
      if (provider === "github-copilot") {
        authorizeUrl = startGitHubOAuth(redirectTo, "/api/oauth/callback/github-copilot");
      } else if (provider === "antigravity") {
        authorizeUrl = startGoogleAntigravityOAuth(redirectTo, "/api/oauth/callback/antigravity");
      } else {
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }
      res.redirect(302, authorizeUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/oauth/callback/github-copilot", async (req, res) => {
    const code = firstQueryValue(req.query.code);
    const state = firstQueryValue(req.query.state);
    const error = firstQueryValue(req.query.error);

    if (error || !code || !state) {
      const redirectUrl = new URL("/", OAUTH_BASE_URL);
      redirectUrl.searchParams.set("oauth_error", error || "missing_code");
      return res.redirect(redirectUrl.toString());
    }

    try {
      const result = await handleGitHubCallback(code, state, "/api/oauth/callback/github-copilot");
      res.redirect(result.redirectTo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[OAuth] GitHub/Copilot callback error:", msg);
      const redirectUrl = new URL("/", OAUTH_BASE_URL);
      redirectUrl.searchParams.set("oauth_error", msg);
      res.redirect(redirectUrl.toString());
    }
  });

  app.get("/api/oauth/callback/antigravity", async (req, res) => {
    const code = firstQueryValue(req.query.code);
    const state = firstQueryValue(req.query.state);
    const error = firstQueryValue(req.query.error);

    if (error || !code || !state) {
      const redirectUrl = new URL("/", OAUTH_BASE_URL);
      redirectUrl.searchParams.set("oauth_error", error || "missing_code");
      return res.redirect(redirectUrl.toString());
    }

    try {
      const result = await handleGoogleAntigravityCallback(code, state, "/api/oauth/callback/antigravity");
      res.redirect(result.redirectTo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[OAuth] Antigravity callback error:", msg);
      const redirectUrl = new URL("/", OAUTH_BASE_URL);
      redirectUrl.searchParams.set("oauth_error", msg);
      res.redirect(redirectUrl.toString());
    }
  });

  app.post("/api/oauth/github-copilot/device-start", async (_req, res) => {
    if (!OAUTH_ENCRYPTION_SECRET) {
      return res.status(400).json({ error: "missing_OAUTH_ENCRYPTION_SECRET" });
    }

    const customClientId = (
      db.prepare("SELECT value FROM settings WHERE key = 'github_oauth_client_id'").get() as
        | { value: string }
        | undefined
    )?.value
      ?.replace(/^"|"$/g, "")
      .trim();
    const clientId = customClientId || process.env.OAUTH_GITHUB_CLIENT_ID || BUILTIN_GITHUB_CLIENT_ID;
    try {
      const resp = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, scope: "read:user user:email repo" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        return res.status(502).json({ error: "github_device_code_failed", status: resp.status });
      }

      const json = (await resp.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      };
      if (!json.device_code || !json.user_code) {
        return res.status(502).json({ error: "github_device_code_invalid" });
      }

      const stateId = randomUUID();
      db.prepare(
        "INSERT INTO oauth_states (id, provider, created_at, verifier_enc, redirect_to) VALUES (?, ?, ?, ?, ?)",
      ).run(stateId, "github", nowMs(), encryptSecret(json.device_code), null);

      res.json({
        stateId,
        userCode: json.user_code,
        verificationUri: json.verification_uri,
        expiresIn: json.expires_in,
        interval: json.interval,
      });
    } catch (err) {
      res.status(500).json({ error: "github_device_start_failed", message: String(err) });
    }
  });

  app.post("/api/oauth/github-copilot/device-poll", async (req, res) => {
    const stateId = (req.body as { stateId?: string })?.stateId;
    if (!stateId || typeof stateId !== "string") {
      return res.status(400).json({ error: "stateId is required" });
    }

    const row = db
      .prepare("SELECT provider, verifier_enc, redirect_to, created_at FROM oauth_states WHERE id = ? AND provider = ?")
      .get(stateId, "github") as
      | { provider: string; verifier_enc: string; redirect_to: string | null; created_at: number }
      | undefined;
    if (!row) {
      return res.status(400).json({ error: "invalid_state", status: "expired" });
    }
    if (nowMs() - row.created_at > OAUTH_STATE_TTL_MS) {
      db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
      return res.json({ status: "expired" });
    }

    let deviceCode: string;
    try {
      deviceCode = decryptSecret(row.verifier_enc);
    } catch {
      return res.status(500).json({ error: "decrypt_failed" });
    }

    const customClientId = (
      db.prepare("SELECT value FROM settings WHERE key = 'github_oauth_client_id'").get() as
        | { value: string }
        | undefined
    )?.value
      ?.replace(/^"|"$/g, "")
      .trim();
    const clientId = customClientId || process.env.OAUTH_GITHUB_CLIENT_ID || BUILTIN_GITHUB_CLIENT_ID;
    try {
      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        return res.status(502).json({ error: "github_poll_failed", status: "error" });
      }

      const json = (await resp.json()) as Record<string, unknown>;
      if ("access_token" in json && typeof json.access_token === "string") {
        db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
        const accessToken = json.access_token;

        let email: string | null = null;
        try {
          const emailsResp = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "climpire",
              Accept: "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (emailsResp.ok) {
            const emails = (await emailsResp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
            const primary = emails.find((e) => e.primary && e.verified);
            if (primary) email = primary.email;
          }
        } catch {
          // best-effort
        }

        const grantedScope = typeof json.scope === "string" && json.scope.trim() ? json.scope : null;
        upsertOAuthCredential({
          provider: "github",
          source: "web-oauth",
          email,
          scope: grantedScope,
          access_token: accessToken,
          refresh_token: null,
          expires_at: null,
        });

        return res.json({ status: "complete", email });
      }

      const error = typeof json.error === "string" ? json.error : "unknown";
      if (error === "authorization_pending") return res.json({ status: "pending" });
      if (error === "slow_down") return res.json({ status: "slow_down" });
      if (error === "expired_token") {
        db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
        return res.json({ status: "expired" });
      }
      if (error === "access_denied") {
        db.prepare("DELETE FROM oauth_states WHERE id = ?").run(stateId);
        return res.json({ status: "denied" });
      }
      return res.json({ status: "error", error });
    } catch (err) {
      return res.status(500).json({ error: "github_poll_error", message: String(err) });
    }
  });

  app.post("/api/oauth/disconnect", (req, res) => {
    const body = (req.body as { provider?: string; account_id?: string }) ?? {};
    const provider = normalizeOAuthProvider(body.provider ?? "");
    const accountId = body.account_id;
    if (!provider) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    if (accountId) {
      db.prepare("DELETE FROM oauth_accounts WHERE id = ? AND provider = ?").run(accountId, provider);
      ensureOAuthActiveAccount(provider);
      const remaining = (
        db.prepare("SELECT COUNT(*) as cnt FROM oauth_accounts WHERE provider = ?").get(provider) as { cnt: number }
      ).cnt;
      if (remaining === 0) {
        db.prepare("DELETE FROM oauth_credentials WHERE provider = ?").run(provider);
        db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
      }
    } else {
      db.prepare("DELETE FROM oauth_accounts WHERE provider = ?").run(provider);
      db.prepare("DELETE FROM oauth_active_accounts WHERE provider = ?").run(provider);
      db.prepare("DELETE FROM oauth_credentials WHERE provider = ?").run(provider);
    }

    res.json({ ok: true });
  });

  app.post("/api/oauth/refresh", async (req, res) => {
    const body = (req.body as { provider?: string; account_id?: string }) ?? {};
    const provider = normalizeOAuthProvider(body.provider ?? "");
    if (provider !== "google_antigravity") {
      return res.status(400).json({ error: `Unsupported provider for refresh: ${provider}` });
    }
    let cred: DecryptedOAuthToken | null = null;
    if (body.account_id) {
      cred =
        (getOAuthAccounts(provider, true) as DecryptedOAuthToken[]).find(
          (a: DecryptedOAuthToken) => a.id === body.account_id,
        ) ?? null;
    } else {
      cred = getPreferredOAuthAccounts(provider)[0] ?? null;
    }
    if (!cred) {
      return res.status(404).json({ error: "No credential found for google_antigravity" });
    }
    if (!cred.refreshToken) {
      return res.status(400).json({ error: "No refresh token available — re-authentication required" });
    }
    try {
      await refreshGoogleToken(cred);
      const updatedRow = db.prepare("SELECT expires_at, updated_at FROM oauth_accounts WHERE id = ?").get(cred.id) as
        | { expires_at: number | null; updated_at: number }
        | undefined;
      console.log("[oauth] Manual refresh: Antigravity token renewed");
      res.json({ ok: true, expires_at: updatedRow?.expires_at ?? null, refreshed_at: Date.now(), account_id: cred.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[oauth] Manual refresh failed for Antigravity:", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/oauth/accounts/activate", (req, res) => {
    const body =
      (req.body as {
        provider?: string;
        account_id?: string;
        mode?: "exclusive" | "add" | "remove" | "toggle";
      }) ?? {};
    const provider = normalizeOAuthProvider(body.provider ?? "");
    const mode = body.mode ?? "exclusive";
    if (!provider || !body.account_id) {
      return res.status(400).json({ error: "provider and account_id are required" });
    }
    const account = db
      .prepare("SELECT id, status FROM oauth_accounts WHERE id = ? AND provider = ?")
      .get(body.account_id, provider) as { id: string; status: "active" | "disabled" } | undefined;
    if (!account) {
      return res.status(404).json({ error: "account_not_found" });
    }
    if ((mode === "exclusive" || mode === "add" || mode === "toggle") && account.status !== "active") {
      return res.status(400).json({ error: "account_disabled" });
    }

    if (mode === "exclusive") {
      setOAuthActiveAccounts(provider, [body.account_id]);
    } else if (mode === "add") {
      setActiveOAuthAccount(provider, body.account_id);
    } else if (mode === "remove") {
      removeActiveOAuthAccount(provider, body.account_id);
    } else if (mode === "toggle") {
      const activeIds = new Set(getActiveOAuthAccountIds(provider));
      if (activeIds.has(body.account_id)) {
        removeActiveOAuthAccount(provider, body.account_id);
      } else {
        setActiveOAuthAccount(provider, body.account_id);
      }
    } else {
      return res.status(400).json({ error: "invalid_mode" });
    }

    const activeIdsAfter = getActiveOAuthAccountIds(provider);
    if (activeIdsAfter.length === 0 && (mode === "remove" || mode === "toggle")) {
      const fallback = db
        .prepare(
          "SELECT id FROM oauth_accounts WHERE provider = ? AND status = 'active' AND id != ? ORDER BY priority ASC, updated_at DESC LIMIT 1",
        )
        .get(provider, body.account_id) as { id: string } | undefined;
      if (fallback) {
        setActiveOAuthAccount(provider, fallback.id);
      } else {
        ensureOAuthActiveAccount(provider);
      }
    } else {
      ensureOAuthActiveAccount(provider);
    }

    res.json({ ok: true, activeAccountIds: getActiveOAuthAccountIds(provider) });
  });

  app.put("/api/oauth/accounts/:id", (req, res) => {
    const id = String(req.params.id);
    const body =
      (req.body as {
        label?: string | null;
        model_override?: string | null;
        priority?: number;
        status?: "active" | "disabled";
      }) ?? {};

    const existing = db.prepare("SELECT id FROM oauth_accounts WHERE id = ?").get(id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "account_not_found" });

    const updates: string[] = ["updated_at = ?"];
    const params: unknown[] = [nowMs()];
    if ("label" in body) {
      updates.push("label = ?");
      params.push(body.label ?? null);
    }
    if ("model_override" in body) {
      updates.push("model_override = ?");
      params.push(body.model_override ?? null);
    }
    if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
      updates.push("priority = ?");
      params.push(Math.max(1, Math.round(body.priority)));
    }
    if (body.status === "active" || body.status === "disabled") {
      updates.push("status = ?");
      params.push(body.status);
    }

    params.push(id);
    db.prepare(`UPDATE oauth_accounts SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
    const providerRow = db.prepare("SELECT provider FROM oauth_accounts WHERE id = ?").get(id) as { provider: string };
    ensureOAuthActiveAccount(providerRow.provider);
    res.json({ ok: true });
  });
}
