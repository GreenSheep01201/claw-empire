import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

import { DEFAULT_DB_PATH } from "../config/runtime.ts";
import { decryptMessengerTokenForRuntime } from "../messenger/token-crypto.ts";
import {
  MESSENGER_CHANNELS,
  NATIVE_MESSENGER_CHANNELS,
  isNativeMessengerChannel,
  type MessengerChannel,
} from "../messenger/channels.ts";

const WAKE_DEBOUNCE_DEFAULT_MS = 12_000;
const SETTINGS_CACHE_TTL_MS = 3_000;
const MESSENGER_SETTINGS_KEY = "messengerChannels";
const SIGNAL_RPC_TIMEOUT_MS = 10_000;
const DISCORD_CHANNEL_LIST_GUILD_LIMIT = 100;
const DISCORD_TEXT_CHANNEL_TYPES = new Set<number>([0, 5, 10, 11, 12]);

const execFileAsync = promisify(execFile);

const wakeDebounce = new Map<string, number>();
let cachedMessengerConfig: { loadedAt: number; value: MessengerRuntimeConfig } | null = null;

type GatewayLang = "ko" | "en" | "ja" | "zh";
export type { MessengerChannel };

type PersistedSession = {
  id?: string;
  name?: string;
  targetId?: string;
  enabled?: boolean;
  token?: string;
  agentId?: string;
};

type PersistedChannelConfig = {
  token?: string;
  sessions?: PersistedSession[];
};

type PersistedMessengerChannels = Partial<Record<MessengerChannel, PersistedChannelConfig>>;

type MessengerSession = {
  id: string;
  name: string;
  targetId: string;
  enabled: boolean;
  token?: string;
  agentId?: string;
};

type MessengerChannelConfig = {
  token: string;
  sessions: MessengerSession[];
};

type MessengerRuntimeConfig = Record<MessengerChannel, MessengerChannelConfig>;

export type MessengerRuntimeSession = {
  sessionKey: string;
  channel: MessengerChannel;
  targetId: string;
  enabled: boolean;
  displayName: string;
};

export type DiscordDiscoverableChannel = {
  id: string;
  name: string;
  guildId: string;
  guildName: string;
  type: number;
};

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

function isDiscordTextChannelType(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && DISCORD_TEXT_CHANNEL_TYPES.has(value);
}

async function fetchDiscordJson(token: string, apiPath: string): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10${apiPath}`, {
    headers: {
      authorization: `Bot ${token}`,
    },
  });
  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`discord api failed (${response.status})${bodyText ? `: ${bodyText}` : ""}`);
  }
  if (!bodyText.trim()) {
    return null;
  }
  return JSON.parse(bodyText) as unknown;
}

function normalizeSession(
  session: PersistedSession,
  channel: MessengerChannel,
  index: number,
): MessengerSession | null {
  const targetId = normalizeText(session.targetId);
  if (!targetId) {
    return null;
  }
  const rawId = normalizeText(session.id);
  const id = rawId || `${channel}-${index + 1}`;
  const name = normalizeText(session.name) || `${channel.toUpperCase()} ${index + 1}`;
  const token = normalizeText(session.token);
  return {
    id,
    name,
    targetId,
    enabled: session.enabled !== false,
    token: token ? decryptMessengerTokenForRuntime(channel, token) : undefined,
    agentId: normalizeText(session.agentId) || undefined,
  };
}

function buildEmptyConfig(): MessengerRuntimeConfig {
  return MESSENGER_CHANNELS.reduce((acc, channel) => {
    acc[channel] = { token: "", sessions: [] };
    return acc;
  }, {} as MessengerRuntimeConfig);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readPersistedMessengerChannels(): PersistedMessengerChannels | null {
  const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(MESSENGER_SETTINGS_KEY) as
      | { value?: unknown }
      | undefined;
    const raw = typeof row?.value === "string" ? row.value.trim() : "";
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as PersistedMessengerChannels;
  } catch (err) {
    console.warn(`[Claw-Empire] failed to load messenger channels settings: ${String(err)}`);
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

function mergeChannelConfig(
  channel: MessengerChannel,
  base: MessengerChannelConfig,
  persistedChannels: PersistedMessengerChannels | null,
): MessengerChannelConfig {
  const persisted = persistedChannels?.[channel];
  if (!persisted || typeof persisted !== "object") {
    return base;
  }

  const nextToken = hasOwn(persisted, "token") ? decryptMessengerTokenForRuntime(channel, persisted.token) : base.token;

  let nextSessions = base.sessions;
  if (hasOwn(persisted, "sessions") && Array.isArray(persisted.sessions)) {
    nextSessions = persisted.sessions
      .map((session, index) => normalizeSession(session ?? {}, channel, index))
      .filter((session): session is MessengerSession => Boolean(session));
  }

  return {
    token: nextToken,
    sessions: nextSessions,
  };
}

function loadMessengerConfig(): MessengerRuntimeConfig {
  const now = Date.now();
  if (cachedMessengerConfig && now - cachedMessengerConfig.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedMessengerConfig.value;
  }

  const persistedChannels = readPersistedMessengerChannels();
  const defaults = buildEmptyConfig();
  const merged = MESSENGER_CHANNELS.reduce((acc, channel) => {
    acc[channel] = mergeChannelConfig(channel, defaults[channel], persistedChannels);
    return acc;
  }, {} as MessengerRuntimeConfig);

  cachedMessengerConfig = { loadedAt: now, value: merged };
  return merged;
}

function shouldSendWake(key: string, debounceMs: number): boolean {
  const now = Date.now();
  const last = wakeDebounce.get(key);
  if (last && now - last < debounceMs) {
    return false;
  }

  wakeDebounce.set(key, now);
  if (wakeDebounce.size > 2000) {
    for (const [candidateKey, ts] of wakeDebounce) {
      if (now - ts > debounceMs * 4) {
        wakeDebounce.delete(candidateKey);
      }
    }
  }

  return true;
}

function splitPipeParts(raw: string): string[] {
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function removeChannelPrefix(channel: MessengerChannel, value: string): string {
  const lower = value.toLowerCase();
  const prefixes: string[] = [`${channel}:`, "channel:", "chat:"];
  if (channel === "googlechat") {
    prefixes.push("googlechat:", "google-chat:", "google_chat:", "gchat:");
  }
  if (channel === "imessage") {
    prefixes.push("imessage:", "i-message:", "i_message:");
  }
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      return value.slice(prefix.length).trim();
    }
  }
  return value.trim();
}

function normalizeSignalBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}`.replace(/\/+$/, "");
}

function parseWhatsAppTransport(
  tokenRaw: string,
  targetRaw: string,
): {
  accessToken: string;
  phoneNumberId: string;
  recipient: string;
} {
  let accessToken = normalizeText(tokenRaw);
  const target = removeChannelPrefix("whatsapp", targetRaw);
  const targetMatch = target.match(/^(\d+)\s*[:|/]\s*(.+)$/);
  let phoneNumberId = targetMatch?.[1]?.trim() ?? "";
  const recipient = (targetMatch?.[2] ?? target).trim();

  const tokenParts = splitPipeParts(accessToken);
  if (!phoneNumberId && tokenParts.length >= 2) {
    const first = tokenParts[0];
    const last = tokenParts[tokenParts.length - 1];
    if (/^\d+$/.test(first)) {
      phoneNumberId = first;
      accessToken = tokenParts.slice(1).join("|");
    } else if (/^\d+$/.test(last)) {
      phoneNumberId = last;
      accessToken = tokenParts.slice(0, -1).join("|");
    }
  }

  if (!accessToken) {
    throw new Error("whatsapp token missing");
  }
  if (!phoneNumberId) {
    throw new Error(
      "whatsapp phone_number_id missing (targetId: `<phone_number_id>:<recipient>` or include numeric id in token)",
    );
  }
  if (!recipient) {
    throw new Error("whatsapp recipient missing");
  }

  return { accessToken, phoneNumberId, recipient };
}

function parseGoogleChatTransport(tokenRaw: string, targetRaw: string): { url: string } {
  const token = normalizeText(tokenRaw);
  const target = removeChannelPrefix("googlechat", targetRaw).replace(/^\/+/, "");
  if (!token) {
    throw new Error("googlechat token missing");
  }

  if (/^https?:\/\//i.test(token)) {
    return { url: token };
  }

  const tokenParts = splitPipeParts(token);
  if (tokenParts.length >= 2 && target) {
    const apiKey = tokenParts[0];
    const webhookToken = tokenParts.slice(1).join("|");
    if (!apiKey || !webhookToken) {
      throw new Error("googlechat token format invalid");
    }
    return {
      url: `https://chat.googleapis.com/v1/${target}/messages?key=${encodeURIComponent(
        apiKey,
      )}&token=${encodeURIComponent(webhookToken)}`,
    };
  }

  throw new Error("googlechat token must be webhook URL or `key|token` (with targetId `spaces/...`)");
}

function parseSignalTransport(tokenRaw: string): { baseUrl: string; account?: string } {
  const token = normalizeText(tokenRaw);
  if (!token) {
    throw new Error("signal token missing");
  }
  const tokenParts = splitPipeParts(token);
  const baseUrl = normalizeSignalBaseUrl(tokenParts[0] ?? token);
  if (!baseUrl) {
    throw new Error("signal base URL missing");
  }
  let account: string | undefined;
  for (const part of tokenParts.slice(1)) {
    const normalized = part.trim();
    if (!normalized) continue;
    if (/^(account|acct|accountid)\s*=/i.test(normalized)) {
      account = normalized.replace(/^(account|acct|accountid)\s*=\s*/i, "").trim() || account;
      continue;
    }
    if (!account && !normalized.includes("=")) {
      account = normalized;
    }
  }
  return { baseUrl, account };
}

function parseSignalTarget(targetRaw: string): { recipient?: string[]; groupId?: string; username?: string[] } {
  let value = removeChannelPrefix("signal", targetRaw);
  if (!value) {
    throw new Error("signal target missing");
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("group:")) {
    value = value.slice("group:".length).trim();
    if (!value) throw new Error("signal group id missing");
    return { groupId: value };
  }
  if (lower.startsWith("username:")) {
    value = value.slice("username:".length).trim();
    if (!value) throw new Error("signal username missing");
    return { username: [value] };
  }
  if (lower.startsWith("u:")) {
    value = value.slice("u:".length).trim();
    if (!value) throw new Error("signal username missing");
    return { username: [value] };
  }
  return { recipient: [value] };
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const payload = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.description || `telegram send failed (${r.status})`);
  }
}

async function sendTelegramTyping(token: string, chatId: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });

  const payload = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.description || `telegram typing failed (${r.status})`);
  }
}

async function sendDiscordMessage(token: string, channelId: string, text: string): Promise<void> {
  const r = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bot ${token}`,
    },
    body: JSON.stringify({ content: text }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`discord send failed (${r.status})${detail ? `: ${detail}` : ""}`);
  }
}

async function sendDiscordTyping(token: string, channelId: string): Promise<void> {
  const r = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/typing`, {
    method: "POST",
    headers: {
      authorization: `Bot ${token}`,
    },
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`discord typing failed (${r.status})${detail ? `: ${detail}` : ""}`);
  }
}

async function sendSlackMessage(token: string, channelId: string, text: string): Promise<void> {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });

  const payload = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error || `slack send failed (${r.status})`);
  }
}

async function sendWhatsAppMessage(token: string, targetId: string, text: string): Promise<void> {
  const { accessToken, phoneNumberId, recipient } = parseWhatsAppTransport(token, targetId);
  const r = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        body: text,
        preview_url: false,
      },
    }),
  });

  const payload = (await r.json().catch(() => null)) as {
    error?: { message?: string } | null;
    messages?: Array<{ id?: string }>;
  } | null;
  if (!r.ok || payload?.error) {
    const message = payload?.error?.message;
    throw new Error(message || `whatsapp send failed (${r.status})`);
  }
}

async function sendGoogleChatMessage(token: string, targetId: string, text: string): Promise<void> {
  const { url } = parseGoogleChatTransport(token, targetId);
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`googlechat send failed (${r.status})${detail ? `: ${detail}` : ""}`);
  }
}

async function signalRpcRequest(params: {
  baseUrl: string;
  method: "send" | "sendTyping";
  payload: Record<string, unknown>;
}): Promise<void> {
  const r = await fetch(`${params.baseUrl}/api/v1/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: params.method,
      params: params.payload,
    }),
    signal: AbortSignal.timeout(SIGNAL_RPC_TIMEOUT_MS),
  });
  if (r.status === 201) {
    return;
  }
  const responseText = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(`signal rpc failed (${r.status})${responseText ? `: ${responseText}` : ""}`);
  }
  if (!responseText.trim()) {
    return;
  }
  const payload = JSON.parse(responseText) as {
    error?: { code?: number; message?: string };
  };
  if (payload?.error) {
    throw new Error(`signal rpc ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "unknown error"}`);
  }
}

async function sendSignalMessage(token: string, targetId: string, text: string): Promise<void> {
  const transport = parseSignalTransport(token);
  const target = parseSignalTarget(targetId);
  const payload: Record<string, unknown> = { ...target, message: text };
  if (transport.account) {
    payload.account = transport.account;
  }
  await signalRpcRequest({
    baseUrl: transport.baseUrl,
    method: "send",
    payload,
  });
}

async function sendSignalTyping(token: string, targetId: string): Promise<void> {
  const transport = parseSignalTransport(token);
  const target = parseSignalTarget(targetId);
  const payload: Record<string, unknown> = { ...target };
  if (transport.account) {
    payload.account = transport.account;
  }
  await signalRpcRequest({
    baseUrl: transport.baseUrl,
    method: "sendTyping",
    payload,
  });
}

async function sendIMessageMessage(targetId: string, text: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("imessage transport requires macOS");
  }
  const normalizedTarget = removeChannelPrefix("imessage", targetId);
  if (!normalizedTarget) {
    throw new Error("imessage target missing");
  }
  const script = [
    "on run argv",
    "set targetHandle to item 1 of argv",
    "set targetMessage to item 2 of argv",
    'tell application "Messages"',
    "set targetService to 1st service whose service type = iMessage",
    "set targetBuddy to buddy targetHandle of targetService",
    "send targetMessage to targetBuddy",
    "end tell",
    "end run",
  ].join("\n");
  await execFileAsync("osascript", ["-e", script, normalizedTarget, text], {
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
}

async function sendByChannel(channel: MessengerChannel, token: string, targetId: string, text: string): Promise<void> {
  if (!isNativeMessengerChannel(channel)) {
    throw new Error(`channel transport not implemented: ${channel}`);
  }
  const normalizedToken = normalizeText(token);
  if (!normalizedToken && channel !== "imessage") {
    throw new Error(`${channel} token missing`);
  }
  const normalizedTarget = normalizeText(targetId);
  if (!normalizedTarget) {
    throw new Error(`${channel} target missing`);
  }

  if (channel === "telegram") {
    await sendTelegramMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "discord") {
    await sendDiscordMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "slack") {
    await sendSlackMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "whatsapp") {
    await sendWhatsAppMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "googlechat") {
    await sendGoogleChatMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "signal") {
    await sendSignalMessage(normalizedToken, normalizedTarget, text);
    return;
  }
  if (channel === "imessage") {
    await sendIMessageMessage(normalizedTarget, text);
    return;
  }
  throw new Error(`channel transport not implemented: ${channel}`);
}

async function sendTypingByChannel(channel: MessengerChannel, token: string, targetId: string): Promise<void> {
  if (!isNativeMessengerChannel(channel)) {
    return;
  }
  if (!token) {
    throw new Error(`${channel} token missing`);
  }
  const normalizedTarget = normalizeText(targetId);
  if (!normalizedTarget) {
    throw new Error(`${channel} target missing`);
  }

  if (channel === "telegram") {
    await sendTelegramTyping(token, normalizedTarget);
    return;
  }
  if (channel === "discord") {
    await sendDiscordTyping(token, normalizedTarget);
    return;
  }
  if (channel === "signal") {
    await sendSignalTyping(token, normalizedTarget);
    return;
  }
  // Slack bot API has no native typing indicator endpoint.
}

function normalizeComparableTarget(channel: MessengerChannel, targetId: string): string {
  return removeChannelPrefix(channel, normalizeText(targetId));
}

function resolveSessionTokenForTarget(
  channel: MessengerChannel,
  channelConfig: MessengerChannelConfig,
  targetId: string,
): string {
  const target = normalizeComparableTarget(channel, targetId);
  if (!target) return channelConfig.token;
  for (const session of channelConfig.sessions) {
    if (!session.enabled) continue;
    const sessionTarget = normalizeComparableTarget(channel, session.targetId);
    if (sessionTarget !== target) continue;
    const sessionToken = normalizeText(session.token);
    if (sessionToken) return sessionToken;
  }
  return channelConfig.token;
}

function resolveSessionFromKey(
  config: MessengerRuntimeConfig,
  sessionKey: string,
): { channel: MessengerChannel; session: MessengerSession } | null {
  const [channelRaw, ...rest] = sessionKey.split(":");
  const sessionId = rest.join(":").trim();
  if (!channelRaw || !sessionId) return null;
  const channel = normalizeText(channelRaw).toLowerCase() as MessengerChannel;
  if (!MESSENGER_CHANNELS.includes(channel)) return null;
  const channelConfig = config[channel];
  if (!channelConfig) return null;
  const session = channelConfig.sessions.find((entry) => normalizeText(entry.id) === sessionId);
  if (!session) return null;
  return { channel, session };
}

export async function listDiscordChannelsByToken(tokenRaw: string): Promise<DiscordDiscoverableChannel[]> {
  const token = normalizeDiscordToken(tokenRaw);
  if (!token) {
    throw new Error("discord token missing");
  }

  const guildPayload = await fetchDiscordJson(token, "/users/@me/guilds?limit=200");
  const guilds = Array.isArray(guildPayload) ? guildPayload : [];
  const collected: DiscordDiscoverableChannel[] = [];

  for (let index = 0; index < guilds.length && index < DISCORD_CHANNEL_LIST_GUILD_LIMIT; index += 1) {
    const guild = guilds[index] as { id?: unknown; name?: unknown };
    const guildId = normalizeText(guild.id);
    if (!guildId) continue;
    const guildName = normalizeText(guild.name) || `Guild ${index + 1}`;

    let channelPayload: unknown;
    try {
      channelPayload = await fetchDiscordJson(token, `/guilds/${encodeURIComponent(guildId)}/channels`);
    } catch {
      continue;
    }
    if (!Array.isArray(channelPayload)) {
      continue;
    }

    for (const entry of channelPayload) {
      const channel = entry as { id?: unknown; name?: unknown; type?: unknown };
      const channelType = typeof channel.type === "number" ? channel.type : Number(channel.type);
      if (!isDiscordTextChannelType(channelType)) {
        continue;
      }
      const channelId = normalizeText(channel.id);
      if (!channelId) {
        continue;
      }
      const channelName = normalizeText(channel.name) || `channel-${channelId}`;
      collected.push({
        id: channelId,
        name: channelName,
        guildId,
        guildName,
        type: channelType,
      });
    }
  }

  const deduped = new Map<string, DiscordDiscoverableChannel>();
  for (const row of collected) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const guildCompare = a.guildName.localeCompare(b.guildName, undefined, { sensitivity: "base" });
    if (guildCompare !== 0) return guildCompare;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function listMessengerSessions(): MessengerRuntimeSession[] {
  const config = loadMessengerConfig();
  const sessions: MessengerRuntimeSession[] = [];

  for (const channel of MESSENGER_CHANNELS) {
    const channelConfig = config[channel];
    for (const session of channelConfig.sessions) {
      const sessionKey = `${channel}:${session.id}`;
      sessions.push({
        sessionKey,
        channel,
        targetId: session.targetId,
        enabled: session.enabled,
        displayName: session.name,
      });
    }
  }

  return sessions;
}

export async function sendMessengerMessage(params: {
  channel: MessengerChannel;
  targetId: string;
  text: string;
}): Promise<void> {
  const text = normalizeText(params.text);
  if (!text) {
    throw new Error("message text required");
  }

  const config = loadMessengerConfig();
  const channelConfig = config[params.channel];
  if (!channelConfig) {
    throw new Error(`unsupported channel: ${params.channel}`);
  }

  const token = resolveSessionTokenForTarget(params.channel, channelConfig, params.targetId);
  await sendByChannel(params.channel, token, params.targetId, text);
}

export async function sendMessengerTyping(params: { channel: MessengerChannel; targetId: string }): Promise<void> {
  const config = loadMessengerConfig();
  const channelConfig = config[params.channel];
  if (!channelConfig) {
    throw new Error(`unsupported channel: ${params.channel}`);
  }
  if (
    !isNativeMessengerChannel(params.channel) ||
    params.channel === "slack" ||
    params.channel === "whatsapp" ||
    params.channel === "googlechat" ||
    params.channel === "imessage"
  ) {
    return;
  }
  const token = resolveSessionTokenForTarget(params.channel, channelConfig, params.targetId);
  await sendTypingByChannel(params.channel, token, params.targetId);
}

export async function sendMessengerSessionTyping(sessionKey: string): Promise<void> {
  const normalizedKey = normalizeText(sessionKey);
  if (!normalizedKey) {
    throw new Error("sessionKey required");
  }

  const config = loadMessengerConfig();
  const resolved = resolveSessionFromKey(config, normalizedKey);
  if (!resolved) {
    throw new Error("session not found");
  }
  if (!resolved.session.enabled) {
    throw new Error("session disabled");
  }
  if (
    !isNativeMessengerChannel(resolved.channel) ||
    resolved.channel === "slack" ||
    resolved.channel === "whatsapp" ||
    resolved.channel === "googlechat" ||
    resolved.channel === "imessage"
  ) {
    return;
  }

  const token = normalizeText(resolved.session.token) || config[resolved.channel].token;
  await sendTypingByChannel(resolved.channel, token, resolved.session.targetId);
}

export async function sendMessengerSessionMessage(sessionKey: string, text: string): Promise<void> {
  const normalizedKey = normalizeText(sessionKey);
  if (!normalizedKey) {
    throw new Error("sessionKey required");
  }
  const payload = normalizeText(text);
  if (!payload) {
    throw new Error("message text required");
  }

  const config = loadMessengerConfig();
  const resolved = resolveSessionFromKey(config, normalizedKey);
  if (!resolved) {
    throw new Error("session not found");
  }

  const token = normalizeText(resolved.session.token) || config[resolved.channel].token;
  await sendByChannel(resolved.channel, token, resolved.session.targetId, payload);
}

async function sendMessengerWake(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const config = loadMessengerConfig();
  const targets: Array<{ channel: MessengerChannel; targetId: string; token: string }> = [];
  for (const channel of NATIVE_MESSENGER_CHANNELS) {
    const channelToken = config[channel]?.token;
    for (const session of config[channel].sessions) {
      if (!session.enabled) continue;
      if (session.agentId) continue;
      const token = normalizeText(session.token) || channelToken;
      if (channel !== "imessage" && !token) continue;
      targets.push({ channel, targetId: session.targetId, token });
    }
  }

  if (targets.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      await sendByChannel(target.channel, target.token, target.targetId, trimmed);
    }),
  );

  const failures: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result?.status === "fulfilled") {
      continue;
    }
    const target = targets[i];
    failures.push(`${target.channel}:${target.targetId} => ${String(result?.reason ?? "unknown error")}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }
}

function queueWake(params: { key: string; text: string; debounceMs?: number }) {
  const debounceMs = params.debounceMs ?? WAKE_DEBOUNCE_DEFAULT_MS;
  if (!shouldSendWake(params.key, debounceMs)) {
    return;
  }

  void sendMessengerWake(params.text).catch((err) => {
    console.warn(`[Claw-Empire] messenger notification failed (${params.key}): ${String(err)}`);
  });
}

function detectGatewayLang(text: string): GatewayLang {
  const ko = text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g)?.length ?? 0;
  const ja = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g)?.length ?? 0;
  const zh = text.match(/[\u4E00-\u9FFF]/g)?.length ?? 0;
  const total = text.replace(/\s/g, "").length || 1;
  if (ko / total > 0.15) return "ko";
  if (ja / total > 0.15) return "ja";
  if (zh / total > 0.3) return "zh";
  return "en";
}

function normalizeGatewayLang(lang: string | null | undefined, title: string): GatewayLang {
  if (lang === "ko" || lang === "en" || lang === "ja" || lang === "zh") return lang;
  if (title.trim()) return detectGatewayLang(title);
  return "en";
}

function resolveStatusLabel(status: string, lang: GatewayLang): string {
  if (status === "in_progress") {
    if (lang === "en") return "Started";
    if (lang === "ja") return "開始";
    if (lang === "zh") return "开始";
    return "진행 시작";
  }
  if (status === "review") {
    if (lang === "en") return "In Review";
    if (lang === "ja") return "レビュー中";
    if (lang === "zh") return "审核中";
    return "검토 중";
  }
  if (status === "done") {
    if (lang === "en") return "Completed";
    if (lang === "ja") return "完了";
    if (lang === "zh") return "完成";
    return "완료";
  }
  return status;
}

export function notifyTaskStatus(taskId: string, title: string, status: string, lang?: string): void {
  const resolvedLang = normalizeGatewayLang(lang, title);
  const emoji =
    status === "in_progress"
      ? "\u{1F680}"
      : status === "review"
        ? "\u{1F50D}"
        : status === "done"
          ? "\u2705"
          : "\u{1F4CB}";
  const label = resolveStatusLabel(status, resolvedLang);
  queueWake({
    key: `task:${taskId}:${status}`,
    text: `${emoji} [${label}] ${title}`,
    debounceMs: 5_000,
  });
}

export async function gatewayHttpInvoke(_req: {
  tool: string;
  action?: string;
  args?: Record<string, any>;
}): Promise<any> {
  throw new Error("openclaw gateway integration has been removed; use direct messenger transports");
}
