import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

type RouteErrorArgs = {
  route: string;
  errorCode: string;
  hint: string;
  err?: unknown;
  requestId?: string;
  message?: string;
};

export function resolveRouteRequestId(req: Pick<Request, "header">): string {
  const fromHeader = req.header("x-request-id")?.trim();
  if (fromHeader) return fromHeader;
  return randomUUID();
}

export function summarizeRouteError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function logRouteError(args: RouteErrorArgs): void {
  const requestId = args.requestId ?? "unknown";
  const message = args.message ?? summarizeRouteError(args.err);
  console.error(
    `[api:error] requestId=${requestId} route=${args.route} errorCode=${args.errorCode} hint=${args.hint} message=${message}`,
  );
}

export function sendRouteError(
  req: Pick<Request, "header">,
  res: Response,
  args: Omit<RouteErrorArgs, "requestId"> & { status?: number },
): Response {
  const requestId = resolveRouteRequestId(req);
  const message = args.message ?? summarizeRouteError(args.err);
  logRouteError({ ...args, requestId, message });
  return res.status(args.status ?? 500).json({
    error: args.errorCode,
    requestId,
    hint: args.hint,
    message,
  });
}
