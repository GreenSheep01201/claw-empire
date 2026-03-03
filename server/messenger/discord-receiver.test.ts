import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMessengerTokenKey } from "./token-hint.ts";

const ORIGINAL_ENV = { ...process.env };

function createTestDb(options?: { messengerChannels?: unknown; cursor?: Record<string, string> }): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-discord-receiver-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    if (options && Object.prototype.hasOwnProperty.call(options, "messengerChannels")) {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run("messengerChannels", JSON.stringify(options.messengerChannels ?? {}));
    }
    if (options?.cursor && Object.keys(options.cursor).length > 0) {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run("discordReceiverCursor", JSON.stringify(options.cursor));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

async function importReceiverModule(env: Record<string, string | undefined>) {
  vi.resetModules();

  process.env = {
    ...ORIGINAL_ENV,
    DB_PATH: env.DB_PATH,
    INBOX_WEBHOOK_SECRET: env.INBOX_WEBHOOK_SECRET,
  };

  return import("./discord-receiver.ts");
}

describe("discord receiver", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("허용된 Discord 채널 메시지를 /api/inbox로 포워딩하고 커서를 저장한다", async () => {
    const routeKey = `${buildMessengerTokenKey("discord", "dc-token")}:123`;
    const dbPath = createTestDb({
      messengerChannels: {
        discord: {
          token: "dc-token",
          sessions: [{ id: "dc-1", name: "Ops", targetId: "channel:123", enabled: true }],
        },
      },
      cursor: {
        [routeKey]: "100",
      },
    });
    const db = new DatabaseSync(dbPath);

    try {
      const receiver = await importReceiverModule({
        DB_PATH: dbPath,
        INBOX_WEBHOOK_SECRET: "inbox-secret",
      });
      const status: import("./discord-receiver.ts").DiscordReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        routeCount: 0,
        nextCursorCount: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastMessageId: null,
        lastError: null,
      };

      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("discord.com/api/v10/channels/123/messages")) {
          expect(url).toContain("after=100");
          return new Response(
            JSON.stringify([
              {
                id: "101",
                content: "hello from discord",
                author: { id: "u-1", username: "dororong", bot: false },
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/inbox")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          expect(body.source).toBe("discord");
          expect(body.chat).toBe("channel:123");
          expect(body.text).toBe("hello from discord");
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      });

      await receiver.pollDiscordReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(status.enabled).toBe(true);
      expect(status.lastMessageId).toBe("101");
      expect(status.lastError).toBeNull();
      expect(typeof status.lastForwardAt).toBe("number");

      const row = db.prepare("SELECT value FROM settings WHERE key = 'discordReceiverCursor'").get() as
        | { value: string }
        | undefined;
      const parsed = JSON.parse(row?.value || "{}") as Record<string, string>;
      expect(parsed[routeKey]).toBe("101");
    } finally {
      db.close();
    }
  });

  it("봇 메시지는 무시하고 커서만 갱신한다", async () => {
    const routeKey = `${buildMessengerTokenKey("discord", "dc-token")}:123`;
    const dbPath = createTestDb({
      messengerChannels: {
        discord: {
          token: "dc-token",
          sessions: [{ id: "dc-1", name: "Ops", targetId: "123", enabled: true }],
        },
      },
      cursor: {
        [routeKey]: "200",
      },
    });
    const db = new DatabaseSync(dbPath);

    try {
      const receiver = await importReceiverModule({
        DB_PATH: dbPath,
        INBOX_WEBHOOK_SECRET: "inbox-secret",
      });
      const status: import("./discord-receiver.ts").DiscordReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        routeCount: 0,
        nextCursorCount: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastMessageId: null,
        lastError: null,
      };

      const fetchMock = vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("discord.com/api/v10/channels/123/messages")) {
          return new Response(
            JSON.stringify([
              {
                id: "201",
                content: "bot echo",
                author: { id: "bot-1", username: "my-bot", bot: true },
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      });

      await receiver.pollDiscordReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(status.lastForwardAt).toBeNull();
      expect(status.lastMessageId).toBe("201");

      const row = db.prepare("SELECT value FROM settings WHERE key = 'discordReceiverCursor'").get() as
        | { value: string }
        | undefined;
      const parsed = JSON.parse(row?.value || "{}") as Record<string, string>;
      expect(parsed[routeKey]).toBe("201");
    } finally {
      db.close();
    }
  });

  it("토큰이 여러 개인 경우 source 힌트로 분리 포워딩한다", async () => {
    const tokenAKey = buildMessengerTokenKey("discord", "token-a");
    const tokenBKey = buildMessengerTokenKey("discord", "token-b");
    const dbPath = createTestDb({
      messengerChannels: {
        discord: {
          sessions: [
            { id: "dc-a", name: "A", targetId: "123", enabled: true, token: "token-a" },
            { id: "dc-b", name: "B", targetId: "123", enabled: true, token: "token-b" },
          ],
        },
      },
      cursor: {
        [`${tokenAKey}:123`]: "10",
        [`${tokenBKey}:123`]: "20",
      },
    });
    const db = new DatabaseSync(dbPath);

    try {
      const receiver = await importReceiverModule({
        DB_PATH: dbPath,
        INBOX_WEBHOOK_SECRET: "inbox-secret",
      });
      const status: import("./discord-receiver.ts").DiscordReceiverStatus = {
        running: true,
        configured: false,
        enabled: false,
        routeCount: 0,
        nextCursorCount: 0,
        lastPollAt: null,
        lastForwardAt: null,
        lastMessageId: null,
        lastError: null,
      };

      const inboxSources: string[] = [];
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("discord.com/api/v10/channels/123/messages")) {
          const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
          if (auth === "Bot token-a") {
            return new Response(
              JSON.stringify([{ id: "11", content: "from-a", author: { id: "u-a", username: "alpha", bot: false } }]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (auth === "Bot token-b") {
            return new Response(
              JSON.stringify([{ id: "21", content: "from-b", author: { id: "u-b", username: "beta", bot: false } }]),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }
        if (url.includes("/api/inbox")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          inboxSources.push(String(body.source ?? ""));
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      });

      await receiver.pollDiscordReceiverOnce({
        db,
        status,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(inboxSources.length).toBe(2);
      expect(inboxSources[0]).toMatch(/^discord#[0-9a-f]+$/);
      expect(inboxSources[1]).toMatch(/^discord#[0-9a-f]+$/);
      expect(inboxSources[0]).not.toBe(inboxSources[1]);
    } finally {
      db.close();
    }
  });
});
