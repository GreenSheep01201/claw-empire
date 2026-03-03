import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function createTestDb(options?: { messengerChannels?: unknown }): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-messenger-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    if (options && Object.prototype.hasOwnProperty.call(options, "messengerChannels")) {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run("messengerChannels", JSON.stringify(options.messengerChannels ?? {}));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

async function importGatewayModule(env: Record<string, string | undefined>) {
  vi.resetModules();

  process.env = {
    ...ORIGINAL_ENV,
    DB_PATH: env.DB_PATH,
    OPENCLAW_CONFIG: env.OPENCLAW_CONFIG,
  };

  return import("./client.ts");
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("gateway client", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("notifyTaskStatus는 설정된 채널 세션으로 직접 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [{ id: "tg-1", name: "Telegram", targetId: "-100123", enabled: true }],
        },
        discord: {
          token: "discord-token",
          sessions: [{ id: "dc-1", name: "Discord", targetId: "987654", enabled: true }],
        },
        slack: {
          token: "xoxb-test",
          sessions: [{ id: "sl-1", name: "Slack", targetId: "C123", enabled: true }],
        },
        whatsapp: {
          token: "wa-access-token|1234567890",
          sessions: [{ id: "wa-1", name: "WhatsApp", targetId: "+821012345678", enabled: true }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    gateway.notifyTaskStatus("task-1", "테스트 작업", "in_progress", "ko");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const calls = fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;

    const telegramCall = calls.find(([url]) => url.includes("api.telegram.org"));
    expect(telegramCall?.[0]).toBe("https://api.telegram.org/bottg-token/sendMessage");
    expect(telegramCall?.[1]?.method).toBe("POST");

    const discordCall = calls.find(([url]) => url.includes("discord.com/api/v10/channels"));
    expect(discordCall?.[0]).toBe("https://discord.com/api/v10/channels/987654/messages");
    expect((discordCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bot discord-token");

    const slackCall = calls.find(([url]) => url.includes("slack.com/api/chat.postMessage"));
    expect(slackCall?.[0]).toBe("https://slack.com/api/chat.postMessage");
    expect((slackCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bearer xoxb-test");

    const whatsappCall = calls.find(([url]) => url.includes("graph.facebook.com"));
    expect(whatsappCall?.[0]).toBe("https://graph.facebook.com/v22.0/1234567890/messages");
    expect((whatsappCall?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bearer wa-access-token");
  });

  it("notifyTaskStatus는 agent 바인딩 세션으로는 전송하지 않는다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [
            { id: "agent-chat", name: "Agent Chat", targetId: "-100111", enabled: true, agentId: "agent-1" },
            { id: "broadcast", name: "Broadcast", targetId: "-100222", enabled: true },
          ],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    gateway.notifyTaskStatus("task-2", "agent task", "in_progress", "en");
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-token/sendMessage");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as { chat_id?: string };
    expect(body.chat_id).toBe("-100222");
  });

  it("settings.messengerChannels 값이 있으면 확장 채널 세션을 런타임 목록으로 구성한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-db-token",
          sessions: [
            { id: "ops", name: "Ops Alert", targetId: "-100999", enabled: true },
            { id: "silent", name: "Silent", targetId: "-100000", enabled: false },
          ],
        },
        whatsapp: {
          token: "wa-token",
          sessions: [{ id: "wa-main", name: "WA Main", targetId: "wa-123", enabled: true }],
        },
        googlechat: {
          token: "gc-token",
          sessions: [{ id: "gchat-1", name: "GChat", targetId: "spaces/AAA", enabled: true }],
        },
      },
    });

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const sessions = gateway.listMessengerSessions();
    expect(sessions).toEqual([
      {
        sessionKey: "telegram:ops",
        channel: "telegram",
        targetId: "-100999",
        enabled: true,
        displayName: "Ops Alert",
      },
      {
        sessionKey: "telegram:silent",
        channel: "telegram",
        targetId: "-100000",
        enabled: false,
        displayName: "Silent",
      },
      {
        sessionKey: "whatsapp:wa-main",
        channel: "whatsapp",
        targetId: "wa-123",
        enabled: true,
        displayName: "WA Main",
      },
      {
        sessionKey: "googlechat:gchat-1",
        channel: "googlechat",
        targetId: "spaces/AAA",
        enabled: true,
        displayName: "GChat",
      },
    ]);
  });

  it("sendMessengerMessage는 지정 채널/대상으로 직접 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        discord: {
          token: "discord-db-token",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "discord",
      targetId: "123456",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://discord.com/api/v10/channels/123456/messages");
  });

  it("listDiscordChannelsByToken은 Bot 토큰으로 길드 채널 목록을 자동 조회한다", async () => {
    const dbPath = createTestDb();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/users/@me/guilds")) {
        return new Response(
          JSON.stringify([
            { id: "g2", name: "Beta Team" },
            { id: "g1", name: "Alpha Team" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/guilds/g1/channels")) {
        return new Response(
          JSON.stringify([
            { id: "c2", name: "general", type: 0 },
            { id: "c3", name: "voice", type: 2 },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/guilds/g2/channels")) {
        return new Response(JSON.stringify([{ id: "c1", name: "announcements", type: 5 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not_found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    const channels = await gateway.listDiscordChannelsByToken("Bot test-token");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)?.authorization).toBe("Bot test-token");
    expect(channels).toEqual([
      {
        id: "c2",
        name: "general",
        guildId: "g1",
        guildName: "Alpha Team",
        type: 0,
      },
      {
        id: "c1",
        name: "announcements",
        guildId: "g2",
        guildName: "Beta Team",
        type: 5,
      },
    ]);
  });

  it("listDiscordChannelsByToken은 인증 실패 시 에러를 반환한다", async () => {
    const dbPath = createTestDb();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"401: Unauthorized"}', { status: 401 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await expect(gateway.listDiscordChannelsByToken("invalid-token")).rejects.toThrow("discord api failed (401)");
  });

  it("sendMessengerMessage는 대상 세션의 전용 토큰을 우선 사용한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [
            { id: "ops-1", name: "Ops-1", targetId: "-100111", enabled: true, token: "tg-session-token" },
            { id: "ops-2", name: "Ops-2", targetId: "-100222", enabled: true },
          ],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "telegram",
      targetId: "-100111",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendMessengerSessionMessage는 세션 전용 토큰을 사용한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100333", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerSessionMessage("telegram:ops", "hello session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendMessage");
  });

  it("sendMessengerMessage는 WhatsApp Cloud API로 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        whatsapp: {
          token: "wa-db-token|1234509876",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "whatsapp",
      targetId: "+821099988877",
      text: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v22.0/1234509876/messages");
  });

  it("sendMessengerMessage는 Google Chat 웹훅 URL로 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        googlechat: {
          token: "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=test-key&token=test-token",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "googlechat",
      targetId: "spaces/AAAA",
      text: "hello googlechat",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=test-key&token=test-token",
    );
  });

  it("sendMessengerMessage는 Signal RPC로 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        signal: {
          token: "http://127.0.0.1:8080|account=+821055566677",
          sessions: [],
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { timestamp: 123 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerMessage({
      channel: "signal",
      targetId: "+821012345678",
      text: "hello signal",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8080/api/v1/rpc");
  });

  it("sendMessengerTyping은 Telegram typing 액션을 보낸다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-token",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "telegram",
      targetId: "-100777",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-token/sendChatAction");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      chat_id?: string;
      action?: string;
    };
    expect(body.chat_id).toBe("-100777");
    expect(body.action).toBe("typing");
  });

  it("sendMessengerTyping은 대상 세션 토큰을 우선 사용한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100999", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "telegram",
      targetId: "-100999",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendChatAction");
  });

  it("sendMessengerSessionTyping은 sessionKey 기준으로 typing을 전송한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        telegram: {
          token: "tg-channel-token",
          sessions: [{ id: "ops", name: "Ops", targetId: "-100999", enabled: true, token: "tg-session-token" }],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerSessionTyping("telegram:ops");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.telegram.org/bottg-session-token/sendChatAction");
  });

  it("sendMessengerTyping은 비타이핑 채널에서는 no-op이다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        whatsapp: {
          token: "wa-token",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "whatsapp",
      targetId: "wa-chat",
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("sendMessengerTyping은 Signal sendTyping RPC를 호출한다", async () => {
    const dbPath = createTestDb({
      messengerChannels: {
        signal: {
          token: "http://127.0.0.1:8080|account=+821011122233",
          sessions: [],
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await gateway.sendMessengerTyping({
      channel: "signal",
      targetId: "+821012300000",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8080/api/v1/rpc");
  });

  it("gatewayHttpInvoke는 제거되었음을 명시적으로 반환한다", async () => {
    const dbPath = createTestDb();
    const gateway = await importGatewayModule({
      DB_PATH: dbPath,
      OPENCLAW_CONFIG: undefined,
    });

    await expect(gateway.gatewayHttpInvoke({ tool: "message" })).rejects.toThrow(
      "openclaw gateway integration has been removed",
    );
  });
});
