import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GatewaySettingsTab from "./GatewaySettingsTab";

const apiMocks = vi.hoisted(() => ({
  getAgents: vi.fn(),
  getWorkflowPacks: vi.fn(),
  getMessengerRuntimeSessions: vi.fn(),
  getTelegramReceiverStatus: vi.fn(),
  getDiscordReceiverStatus: vi.fn(),
  sendMessengerRuntimeMessage: vi.fn(),
  listDiscordChannelsByToken: vi.fn(),
}));

vi.mock("../../api", () => ({
  getAgents: apiMocks.getAgents,
  getWorkflowPacks: apiMocks.getWorkflowPacks,
  getMessengerRuntimeSessions: apiMocks.getMessengerRuntimeSessions,
  getTelegramReceiverStatus: apiMocks.getTelegramReceiverStatus,
  getDiscordReceiverStatus: apiMocks.getDiscordReceiverStatus,
  sendMessengerRuntimeMessage: apiMocks.sendMessengerRuntimeMessage,
  listDiscordChannelsByToken: apiMocks.listDiscordChannelsByToken,
}));

vi.mock("../AgentAvatar", () => ({
  default: () => null,
  useSpriteMap: () => new Map(),
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

function createFormWithMessengerChannels(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    messengerChannels: {
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [],
      },
      ...overrides,
    },
  };
}

describe("GatewaySettingsTab characterization", () => {
  beforeEach(() => {
    apiMocks.getAgents.mockReset();
    apiMocks.getWorkflowPacks.mockReset();
    apiMocks.getMessengerRuntimeSessions.mockReset();
    apiMocks.getTelegramReceiverStatus.mockReset();
    apiMocks.getDiscordReceiverStatus.mockReset();
    apiMocks.sendMessengerRuntimeMessage.mockReset();

    apiMocks.getAgents.mockResolvedValue([]);
    apiMocks.getWorkflowPacks.mockResolvedValue({ packs: [] });
    apiMocks.getMessengerRuntimeSessions.mockResolvedValue([]);
    apiMocks.getTelegramReceiverStatus.mockResolvedValue({
      running: false,
      configured: false,
      receiveEnabled: false,
      enabled: false,
      allowedChatCount: 0,
      nextOffset: 0,
      lastPollAt: null,
      lastForwardAt: null,
      lastUpdateId: null,
      lastError: null,
    });
    apiMocks.getDiscordReceiverStatus.mockResolvedValue({
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
    apiMocks.sendMessengerRuntimeMessage.mockResolvedValue({ ok: true });
    apiMocks.listDiscordChannelsByToken.mockResolvedValue([]);
  });

  it("filters sessions without targetId and keeps only valid chat rows", async () => {
    const form = createFormWithMessengerChannels({
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [
          { id: "empty", name: "Empty Chat", targetId: "", enabled: true, token: "t1", workflowPackKey: "development" },
          {
            id: "valid",
            name: "Valid Chat",
            targetId: "-100123456",
            enabled: true,
            token: "t2",
            workflowPackKey: "development",
          },
        ],
      },
    });

    render(<GatewaySettingsTab t={t} form={form as any} setForm={vi.fn()} persistSettings={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText("Empty Chat")).not.toBeInTheDocument();
      expect(screen.getByText("Valid Chat")).toBeInTheDocument();
    });

    const validOption = screen.getByRole("option", { name: /Telegram · Valid Chat/i });
    expect(validOption).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Empty Chat/i })).not.toBeInTheDocument();
  });

  it("sends runtime message with selected sessionKey and clears input on success", async () => {
    const user = userEvent.setup();
    const form = createFormWithMessengerChannels({
      telegram: {
        token: "telegram-token",
        receiveEnabled: true,
        sessions: [
          {
            id: "ops",
            name: "Ops",
            targetId: "-100123456",
            enabled: true,
            token: "t-ops",
            workflowPackKey: "development",
          },
        ],
      },
    });

    render(<GatewaySettingsTab t={t} form={form as any} setForm={vi.fn()} persistSettings={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Type a test message...");
    await user.type(textarea, "  hello from test  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(apiMocks.sendMessengerRuntimeMessage).toHaveBeenCalledWith({
        sessionKey: "telegram:ops",
        text: "hello from test",
      });
    });

    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("Message sent")).toBeInTheDocument();
  });

  it("loads Discord channels automatically when token is entered in chat editor", async () => {
    const user = userEvent.setup();
    apiMocks.listDiscordChannelsByToken.mockResolvedValue([
      {
        id: "1234567890",
        name: "ops-alert",
        guildId: "guild-1",
        guildName: "Design Guild",
        type: 0,
      },
    ]);

    render(
      <GatewaySettingsTab
        t={t}
        form={createFormWithMessengerChannels() as any}
        setForm={vi.fn()}
        persistSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Add Chat/i }));

    const [messengerSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(messengerSelect, "discord");

    const tokenInput = screen.getByPlaceholderText("Enter Discord token");
    await user.type(tokenInput, "discord-test-token");

    await waitFor(() => {
      expect(apiMocks.listDiscordChannelsByToken).toHaveBeenCalledWith("discord-test-token");
    });

    await waitFor(() => {
      expect(screen.getByText("Loaded 1 channels automatically.")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Design Guild \/ #ops-alert \(1234567890\)/i })).toBeInTheDocument();
    });
  });
});
