import type { DatabaseSync } from "node:sqlite";
import { INBOX_WEBHOOK_SECRET, OAUTH_BASE_HOST, PORT } from "../config/runtime.ts";
import { buildMessengerSourceWithTokenHint, buildMessengerTokenKey } from "./token-hint.ts";
import { decryptMessengerTokenForRuntime } from "./token-crypto.ts";

const MESSENGER_SETTINGS_KEY = "messengerChannels";
const DISCORD_RECEIVER_CURSOR_KEY = "discordReceiverCursor";
const DISCORD_ACTIVE_DELAY_MS = 2_500;
const DISCORD_IDLE_DELAY_MS = 6_000;
const DISCORD_FETCH_LIMIT = 50;

type PersistedSession = {
  targetId?: unknown;
  enabled?: unknown;
  token?: unknown;
};

type PersistedDiscordChannel = {
  token?: unknown;
  sessions?: unknown;
};

type PersistedMessengerChannels = {
  discord?: PersistedDiscordChannel;
};

type DiscordUser = {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  discriminator?: unknown;
  bot?: unknown;
};

type DiscordMessage = {
  id?: unknown;
  content?: unknown;
  author?: DiscordUser;
};

type DiscordRoute = {
  routeKey: string;
  token: string;
  source: string;
  channelId: string;
};

type DiscordReceiverConfig = {
  hasToken: boolean;
  hasSession: boolean;
  routes: DiscordRoute[];
};

export type DiscordReceiverStatus = {
  running: boolean;
  configured: boolean;
  enabled: boolean;
  routeCount: number;
  nextCursorCount: number;
  lastPollAt: number | null;
  lastForwardAt: number | null;
  lastMessageId: string | null;
  lastError: string | null;
};

export type StartDiscordReceiverOptions = {
  db: DatabaseSync;
  fetchImpl?: typeof fetch;
};

type ReceiverHandle = {
  stop: () => void;
  getStatus: () => DiscordReceiverStatus;
};

const initialStatus = (): DiscordReceiverStatus => ({
  running: false,
  configured: false,
  enabled: false,
  routeCount: 0,
  nextCursorCount: 0,
  lastPollAt: null,
  lastForwardAt: null,
  lastMessageId: null,
  lastError: null,
});

let receiverHandle: ReceiverHandle | null = null;
const runtimeCursorByStatus = new WeakMap<DiscordReceiverStatus, Map<string, string>>();

function cloneStatus(status: DiscordReceiverStatus): DiscordReceiverStatus {
  return { ...status };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDiscordToken(value: unknown): string {
  const token = normalizeText(value);
  if (!token) return "";
  if (/^bot\s+/i.test(token)) {
    return token.replace(/^bot\s+/i, "").trim();
  }
  return token;
}

function normalizeDiscordChannelId(value: unknown): string {
  let target = normalizeText(value);
  if (!target) return "";
  const lower = target.toLowerCase();
  const prefixes = ["discord:", "channel:", "chat:"];
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      target = target.slice(prefix.length).trim();
      break;
    }
  }
  const mentionMatch = target.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  return target;
}

function readMessengerChannels(db: DatabaseSync): PersistedMessengerChannels | null {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(MESSENGER_SETTINGS_KEY) as
      | { value?: unknown }
      | undefined;
    const raw = normalizeText(row?.value);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as PersistedMessengerChannels;
  } catch {
    return null;
  }
}

function resolveDiscordConfig(db: DatabaseSync): DiscordReceiverConfig {
  let channelToken = "";
  let hasSession = false;
  const tokenToChannels = new Map<string, Set<string>>();

  const messengerChannels = readMessengerChannels(db);
  const discord = messengerChannels?.discord;
  if (!discord || typeof discord !== "object") {
    return { hasToken: false, hasSession: false, routes: [] };
  }

  if (Object.prototype.hasOwnProperty.call(discord, "token")) {
    channelToken = normalizeDiscordToken(decryptMessengerTokenForRuntime("discord", discord.token));
  }

  if (Object.prototype.hasOwnProperty.call(discord, "sessions") && Array.isArray(discord.sessions)) {
    for (const rawSession of discord.sessions) {
      const session = (rawSession ?? {}) as PersistedSession;
      if (session.enabled === false) continue;
      const channelId = normalizeDiscordChannelId(session.targetId);
      if (!channelId) continue;
      hasSession = true;
      const sessionToken = normalizeDiscordToken(decryptMessengerTokenForRuntime("discord", session.token));
      const effectiveToken = sessionToken || channelToken;
      if (!effectiveToken) continue;
      const channels = tokenToChannels.get(effectiveToken) ?? new Set<string>();
      channels.add(channelId);
      tokenToChannels.set(effectiveToken, channels);
    }
  }

  const tokens = [...tokenToChannels.keys()];
  const includeSourceHint = tokens.length > 1;
  const routes: DiscordRoute[] = [];

  for (const token of tokens) {
    const tokenKey = buildMessengerTokenKey("discord", token);
    const source = includeSourceHint ? buildMessengerSourceWithTokenHint("discord", tokenKey) : "discord";
    for (const channelId of tokenToChannels.get(token) ?? new Set<string>()) {
      routes.push({
        routeKey: `${tokenKey}:${channelId}`,
        token,
        source,
        channelId,
      });
    }
  }

  return {
    hasToken: Boolean(channelToken) || tokens.length > 0,
    hasSession,
    routes,
  };
}

function readCursorMap(db: DatabaseSync): Record<string, string> {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(DISCORD_RECEIVER_CURSOR_KEY) as
      | { value?: unknown }
      | undefined;
    const raw = normalizeText(row?.value);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeText(value);
      if (!normalized) continue;
      next[key] = normalized;
    }
    return next;
  } catch {
    return {};
  }
}

function writeCursorMap(db: DatabaseSync, cursorMap: Record<string, string>): void {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(cursorMap)) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) continue;
    normalized[key] = normalizedValue;
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(DISCORD_RECEIVER_CURSOR_KEY, JSON.stringify(normalized));
}

function compareSnowflake(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left > right) return 1;
    if (left < right) return -1;
    return 0;
  } catch {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }
}

function pickMaxSnowflake(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return compareSnowflake(candidate, current) > 0 ? candidate : current;
}

function buildAuthorName(author: DiscordUser | undefined): string {
  if (!author || typeof author !== "object") {
    return "discord";
  }
  const displayName = normalizeText(author.global_name) || normalizeText(author.username) || normalizeText(author.id);
  const discriminator = normalizeText(author.discriminator);
  if (displayName && discriminator && discriminator !== "0") {
    return `${displayName}#${discriminator}`;
  }
  return displayName || "discord";
}

async function fetchDiscordMessages(params: {
  token: string;
  channelId: string;
  after?: string;
  limit?: number;
  fetchImpl: typeof fetch;
}): Promise<DiscordMessage[]> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.min(Math.max(params.limit ?? DISCORD_FETCH_LIMIT, 1), 100)));
  const after = normalizeText(params.after);
  if (after) {
    query.set("after", after);
  }
  const response = await params.fetchImpl(
    `https://discord.com/api/v10/channels/${encodeURIComponent(params.channelId)}/messages?${query.toString()}`,
    {
      headers: {
        authorization: `Bot ${params.token}`,
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { message?: string; code?: number }
    | DiscordMessage[]
    | null;
  if (!response.ok) {
    const detail = !Array.isArray(payload) ? normalizeText(payload?.message) : "";
    throw new Error(`discord read failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return Array.isArray(payload) ? payload : [];
}

async function forwardDiscordMessage(params: {
  route: DiscordRoute;
  message: DiscordMessage;
  fetchImpl: typeof fetch;
}): Promise<"forwarded" | "skipped"> {
  const { route, message, fetchImpl } = params;
  const messageId = normalizeText(message.id);
  if (!messageId) return "skipped";

  const author = message.author;
  if (author && author.bot === true) {
    return "skipped";
  }

  const text = normalizeText(message.content);
  if (!text) {
    return "skipped";
  }

  const inboxRes = await fetchImpl(`http://${OAUTH_BASE_HOST}:${PORT}/api/inbox`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inbox-secret": INBOX_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      source: route.source,
      message_id: messageId,
      author: buildAuthorName(author),
      chat: `channel:${route.channelId}`,
      text,
    }),
  });

  if (!inboxRes.ok) {
    const detail = await inboxRes.text().catch(() => "");
    throw new Error(`discord inbox forward failed (${inboxRes.status})${detail ? `: ${detail}` : ""}`);
  }

  return "forwarded";
}

export async function pollDiscordReceiverOnce(options: {
  db: DatabaseSync;
  status: DiscordReceiverStatus;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { db, status } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  status.lastPollAt = Date.now();

  const config = resolveDiscordConfig(db);
  status.routeCount = config.routes.length;
  status.configured = config.routes.length > 0;
  status.enabled = false;
  status.nextCursorCount = 0;

  if (!config.hasToken) {
    status.lastError = "discord token missing";
    return;
  }
  if (!config.hasSession || config.routes.length === 0) {
    status.lastError = "discord sessions missing";
    return;
  }
  if (!INBOX_WEBHOOK_SECRET) {
    status.lastError = "INBOX_WEBHOOK_SECRET missing";
    return;
  }

  status.enabled = true;
  const persistedCursors = readCursorMap(db);
  const inMemoryCursors = runtimeCursorByStatus.get(status) ?? new Map<string, string>();
  runtimeCursorByStatus.set(status, inMemoryCursors);

  let changed = false;
  let highestMessageId = status.lastMessageId;
  let forwardedAny = false;

  for (const route of config.routes) {
    const persistedCursor = normalizeText(persistedCursors[route.routeKey]);
    const memoryCursor = normalizeText(inMemoryCursors.get(route.routeKey));
    let cursor = persistedCursor || memoryCursor;

    if (!cursor) {
      const latest = await fetchDiscordMessages({
        token: route.token,
        channelId: route.channelId,
        limit: 1,
        fetchImpl,
      });
      const latestId = normalizeText(latest[0]?.id);
      if (latestId) {
        cursor = latestId;
        persistedCursors[route.routeKey] = latestId;
        inMemoryCursors.set(route.routeKey, latestId);
        highestMessageId = pickMaxSnowflake(highestMessageId, latestId);
        changed = true;
      }
      continue;
    }

    const messages = await fetchDiscordMessages({
      token: route.token,
      channelId: route.channelId,
      after: cursor,
      limit: DISCORD_FETCH_LIMIT,
      fetchImpl,
    });
    if (messages.length === 0) {
      inMemoryCursors.set(route.routeKey, cursor);
      continue;
    }

    const sorted = [...messages].sort((a, b) => compareSnowflake(normalizeText(a.id), normalizeText(b.id)));
    let routeMaxMessageId = cursor;
    for (const message of sorted) {
      const messageId = normalizeText(message.id);
      if (!messageId) continue;
      if (compareSnowflake(messageId, routeMaxMessageId) > 0) {
        routeMaxMessageId = messageId;
      }
      const result = await forwardDiscordMessage({ route, message, fetchImpl });
      if (result === "forwarded") {
        forwardedAny = true;
      }
      highestMessageId = pickMaxSnowflake(highestMessageId, messageId);
    }

    if (routeMaxMessageId && compareSnowflake(routeMaxMessageId, cursor) > 0) {
      persistedCursors[route.routeKey] = routeMaxMessageId;
      inMemoryCursors.set(route.routeKey, routeMaxMessageId);
      changed = true;
    }
  }

  if (changed) {
    writeCursorMap(db, persistedCursors);
  }

  status.nextCursorCount = Object.keys(persistedCursors).length;
  status.lastMessageId = highestMessageId;
  if (forwardedAny) {
    status.lastForwardAt = Date.now();
  }
  status.lastError = null;
}

export function startDiscordReceiver(options: StartDiscordReceiverOptions): ReceiverHandle {
  if (receiverHandle) {
    return receiverHandle;
  }

  const { db } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const status = initialStatus();
  status.running = true;

  let stopped = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        void tick();
      },
      Math.max(250, delayMs),
    );
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await pollDiscordReceiverOnce({ db, status, fetchImpl });
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Claw-Empire] discord receiver error: ${status.lastError}`);
    } finally {
      busy = false;
      schedule(status.enabled ? DISCORD_ACTIVE_DELAY_MS : DISCORD_IDLE_DELAY_MS);
    }
  };

  schedule(1_500);

  receiverHandle = {
    stop() {
      stopped = true;
      status.running = false;
      status.enabled = false;
      runtimeCursorByStatus.delete(status);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      receiverHandle = null;
    },
    getStatus() {
      return cloneStatus(status);
    },
  };

  return receiverHandle;
}

export function getDiscordReceiverStatus(): DiscordReceiverStatus {
  if (!receiverHandle) {
    return initialStatus();
  }
  return receiverHandle.getStatus();
}
