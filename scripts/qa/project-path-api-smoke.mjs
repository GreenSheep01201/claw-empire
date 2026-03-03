#!/usr/bin/env node

import os from "node:os";
import path from "node:path";

const baseUrl = String(process.env.QA_API_BASE_URL ?? "http://127.0.0.1:8790").replace(/\/+$/, "");
const qaApiAuthToken = String(process.env.QA_API_AUTH_TOKEN ?? process.env.API_AUTH_TOKEN ?? "").trim();
let sessionCookie = "";
let csrfToken = "";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const summary = {
  base_url: baseUrl,
  run_id: runId,
  using_auth_token: Boolean(qaApiAuthToken),
  using_session_cookie: false,
  checks: {},
  created_project_id: null,
  candidate_path: null,
  duplicate_conflict_detected: false,
};

function endpoint(p) {
  return `${baseUrl}${p.startsWith("/") ? p : `/${p}`}`;
}

function extractCookiePair(setCookieHeader) {
  if (typeof setCookieHeader !== "string" || !setCookieHeader.trim()) return "";
  const first = setCookieHeader.split(";")[0]?.trim();
  return first || "";
}

async function bootstrapSession() {
  const headers = {};
  if (qaApiAuthToken) headers.authorization = `Bearer ${qaApiAuthToken}`;
  const res = await fetch(endpoint("/api/auth/session"), { method: "GET", headers });
  const json = await res.json().catch(() => null);
  const nextCookie = extractCookiePair(res.headers.get("set-cookie"));
  if (nextCookie) {
    sessionCookie = nextCookie;
    summary.using_session_cookie = true;
  }
  if (json && typeof json.csrf_token === "string" && json.csrf_token.trim()) {
    csrfToken = json.csrf_token.trim();
  }
  return { status: res.status, ok: res.ok, json };
}

async function requestJson(method, p, body) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (qaApiAuthToken) headers.authorization = `Bearer ${qaApiAuthToken}`;
  if (sessionCookie) headers.cookie = sessionCookie;
  if (!qaApiAuthToken && body && csrfToken) headers["x-csrf-token"] = csrfToken;
  const res = await fetch(endpoint(p), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401 && !qaApiAuthToken && p !== "/api/health") {
    throw new Error("Received 401 unauthorized. Set QA_API_AUTH_TOKEN (or API_AUTH_TOKEN) and retry.");
  }
  return { status: res.status, ok: res.ok, json };
}

function assertOrThrow(condition, message) {
  if (!condition) throw new Error(message);
}

async function findCreatablePath(seedPath) {
  const queue = [seedPath];
  const seen = new Set();
  const allowedRoots = new Set();

  while (queue.length > 0) {
    const root = queue.shift();
    if (!root) continue;
    if (seen.has(root)) continue;
    seen.add(root);

    const candidate = path.join(root, `climpire-qa-path-${runId}`);
    const check = await requestJson("GET", `/api/projects/path-check?path=${encodeURIComponent(candidate)}`);

    if (check.status === 403 && check.json && Array.isArray(check.json.allowed_roots)) {
      for (const allowedRoot of check.json.allowed_roots) {
        if (typeof allowedRoot === "string" && allowedRoot.trim()) {
          allowedRoots.add(allowedRoot);
        }
      }
      for (const allowedRoot of allowedRoots) {
        if (!seen.has(allowedRoot)) queue.push(allowedRoot);
      }
      continue;
    }

    if (!check.ok || !check.json) continue;
    if (check.json.error) continue;
    if (check.json.can_create || check.json.exists) {
      return {
        path:
          typeof check.json.normalized_path === "string" && check.json.normalized_path
            ? check.json.normalized_path
            : candidate,
        allowedRoots: [...allowedRoots],
      };
    }
  }

  throw new Error("No creatable project path found for smoke test.");
}

async function run() {
  const auth = await bootstrapSession();
  assertOrThrow(auth.ok && sessionCookie, `auth-session bootstrap failed (${auth.status})`);
  summary.checks.auth_session = {
    ok: true,
    status: auth.status,
    using_bearer: Boolean(qaApiAuthToken),
    csrf_ready: Boolean(csrfToken),
  };

  const health = await requestJson("GET", "/api/health");
  assertOrThrow(health.ok, `health check failed (${health.status})`);
  summary.checks.health = "ok";

  const suggestions = await requestJson("GET", "/api/projects/path-suggestions?limit=5");
  assertOrThrow(suggestions.ok && suggestions.json?.ok === true, `path-suggestions failed (${suggestions.status})`);
  assertOrThrow(Array.isArray(suggestions.json?.paths), "path-suggestions payload is invalid");
  summary.checks.path_suggestions = {
    ok: true,
    count: suggestions.json.paths.length,
  };

  const browse = await requestJson("GET", "/api/projects/path-browse");
  assertOrThrow(browse.ok && browse.json?.ok === true, `path-browse failed (${browse.status})`);
  assertOrThrow(
    typeof browse.json?.current_path === "string" && browse.json.current_path.length > 0,
    "path-browse current_path is invalid",
  );
  summary.checks.path_browse = {
    ok: true,
    current_path: browse.json.current_path,
    entry_count: Array.isArray(browse.json.entries) ? browse.json.entries.length : 0,
  };

  const preferredRoots = [process.env.QA_PROJECT_ROOT, browse.json.current_path, os.tmpdir()].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  let picked = null;
  for (const root of preferredRoots) {
    try {
      picked = await findCreatablePath(root);
      if (picked?.path) break;
    } catch {
      // try next root
    }
  }
  assertOrThrow(Boolean(picked?.path), "failed to resolve a creatable project path");
  summary.candidate_path = picked.path;
  summary.checks.path_check = {
    ok: true,
    candidate_path: picked.path,
    allowed_roots: picked.allowedRoots ?? [],
  };

  const createPayload = {
    name: `QA Path Smoke ${runId}`,
    project_path: picked.path,
    core_goal: "Smoke test for project path route behavior",
    create_path_if_missing: true,
  };

  const created = await requestJson("POST", "/api/projects", createPayload);
  assertOrThrow(created.ok && created.json?.project?.id, `project create failed (${created.status})`);
  summary.created_project_id = created.json.project.id;
  summary.checks.create = {
    ok: true,
    project_id: created.json.project.id,
  };

  const duplicate = await requestJson("POST", "/api/projects", {
    ...createPayload,
    name: `${createPayload.name} Duplicate`,
  });
  assertOrThrow(duplicate.status === 409, `duplicate create should return 409, got ${duplicate.status}`);
  assertOrThrow(
    duplicate.json?.error === "project_path_conflict",
    `expected project_path_conflict, got ${String(duplicate.json?.error)}`,
  );
  summary.duplicate_conflict_detected = true;
  summary.checks.duplicate_conflict = "ok";

  const remove = await requestJson("DELETE", `/api/projects/${created.json.project.id}`);
  assertOrThrow(remove.ok, `cleanup delete failed (${remove.status})`);
  summary.checks.cleanup = "ok";
  summary.created_project_id = null;

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

run().catch(async (err) => {
  if (summary.created_project_id) {
    try {
      await requestJson("DELETE", `/api/projects/${summary.created_project_id}`);
      summary.checks.cleanup = "best-effort-ok";
      summary.created_project_id = null;
    } catch {
      summary.checks.cleanup = "best-effort-failed";
    }
  }
  summary.error = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = 1;
});
