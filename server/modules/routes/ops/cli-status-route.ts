import type { Express, Request, Response } from "express";

import { logRouteError, resolveRouteRequestId } from "../shared/route-error.ts";

type CliToolDef = {
  name: string;
  authHint: string;
};

type CliToolStatus = {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  authHint: string;
  errorCode?: string;
  errorHint?: string;
};

type CliStatusData = Record<string, CliToolStatus>;

type RegisterCliStatusRouteArgs = {
  app: Express;
  cliStatusTtlMs: number;
  cliTools: CliToolDef[];
  getCachedCliStatus: () => { data: CliStatusData; loadedAt: number } | null;
  setCachedCliStatus: (next: { data: CliStatusData; loadedAt: number } | null) => void;
  detectAllCli: () => Promise<CliStatusData>;
};

const CLI_DETECTION_HINT =
  "CLI detection degraded. Check local CLI binaries, shell PATH, and provider auth files. You can still open Settings and retry.";

function buildFallbackProviders(args: {
  cliTools: CliToolDef[];
  cached: { data: CliStatusData; loadedAt: number } | null;
}): CliStatusData {
  const fallback: CliStatusData = {};
  for (const tool of args.cliTools) {
    fallback[tool.name] = {
      installed: false,
      version: null,
      authenticated: false,
      authHint: tool.authHint,
      errorCode: "cli_detection_failed",
      errorHint: CLI_DETECTION_HINT,
    };
  }

  if (!args.cached?.data) return fallback;
  for (const [provider, status] of Object.entries(args.cached.data)) {
    fallback[provider] = {
      ...fallback[provider],
      ...status,
      errorCode: fallback[provider]?.errorCode ?? "cli_detection_failed",
      errorHint: fallback[provider]?.errorHint ?? CLI_DETECTION_HINT,
    };
  }
  return fallback;
}

function sendDegradedCliStatus(
  req: Request,
  res: Response,
  args: { cliTools: CliToolDef[]; err: unknown; cached: { data: CliStatusData; loadedAt: number } | null },
): void {
  const requestId = resolveRouteRequestId(req);
  logRouteError({
    requestId,
    route: "/api/cli-status",
    errorCode: "cli_detection_failed",
    hint: CLI_DETECTION_HINT,
    err: args.err,
  });

  const providers = buildFallbackProviders({ cliTools: args.cliTools, cached: args.cached });
  res.status(200).json({
    providers,
    degraded: true,
    error: {
      errorCode: "cli_detection_failed",
      requestId,
      hint: CLI_DETECTION_HINT,
    },
  });
}

export function registerCliStatusRoute(args: RegisterCliStatusRouteArgs): void {
  const { app, cliStatusTtlMs, cliTools, getCachedCliStatus, setCachedCliStatus, detectAllCli } = args;

  app.get("/api/cli-status", async (req, res) => {
    const refresh = req.query.refresh === "1";
    const now = Date.now();
    const cached = getCachedCliStatus();

    if (!refresh && cached && now - cached.loadedAt < cliStatusTtlMs) {
      return res.json({ providers: cached.data });
    }

    try {
      const providers = await detectAllCli();
      setCachedCliStatus({ data: providers, loadedAt: Date.now() });
      return res.json({ providers });
    } catch (err) {
      sendDegradedCliStatus(req, res, { cliTools, err, cached });
      return;
    }
  });
}
