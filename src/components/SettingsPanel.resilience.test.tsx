import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../api/core";
import { DEFAULT_SETTINGS, type CompanySettings } from "../types";
import SettingsPanel from "./SettingsPanel";

const apiMocks = vi.hoisted(() => ({
  getOAuthStatusMock: vi.fn(),
  getOAuthModelsMock: vi.fn(),
  getCliModelsMock: vi.fn(),
}));

vi.mock("../api", () => ({
  getOAuthStatus: apiMocks.getOAuthStatusMock,
  getOAuthModels: apiMocks.getOAuthModelsMock,
  getCliModels: apiMocks.getCliModelsMock,
  startGitHubDeviceFlow: vi.fn(),
  pollGitHubDevice: vi.fn(),
  disconnectOAuth: vi.fn(),
  refreshOAuthToken: vi.fn(),
  activateOAuthAccount: vi.fn(),
  updateOAuthAccount: vi.fn(),
  deleteOAuthAccount: vi.fn(),
  getOAuthStartUrl: vi.fn(() => "/api/oauth/start?provider=github-copilot"),
}));

vi.mock("./settings/SettingsTabNav", () => ({
  default: function SettingsTabNavMock({
    setTab,
  }: {
    setTab: (next: "general" | "cli" | "oauth" | "api" | "gateway") => void;
  }) {
    return (
      <div>
        <button onClick={() => setTab("general")}>tab-general</button>
        <button onClick={() => setTab("cli")}>tab-cli</button>
        <button onClick={() => setTab("oauth")}>tab-oauth</button>
      </div>
    );
  },
}));

vi.mock("./settings/GeneralSettingsTab", () => ({
  default: () => <div>general-tab</div>,
}));

vi.mock("./settings/CliSettingsTab", () => ({
  default: function CliSettingsTabMock(props: { loadError?: { message?: string } | null; onRefresh: () => void }) {
    return (
      <div>
        <button onClick={props.onRefresh}>cli-refresh</button>
        <div data-testid="cli-load-error">{props.loadError?.message ?? ""}</div>
      </div>
    );
  },
}));

vi.mock("./settings/OAuthSettingsTab", () => ({
  default: function OAuthSettingsTabMock(props: { statusError?: { message?: string } | null }) {
    return <div data-testid="oauth-load-error">{props.statusError?.message ?? ""}</div>;
  },
}));

vi.mock("./settings/ApiSettingsTab", () => ({
  default: () => <div>api-tab</div>,
}));

vi.mock("./settings/GatewaySettingsTab", () => ({
  default: () => <div>gateway-tab</div>,
}));

vi.mock("./settings/useApiProvidersState", () => ({
  useApiProvidersState: () => ({}),
}));

function renderPanel(overrides?: Partial<ComponentProps<typeof SettingsPanel>>) {
  const baseSettings: CompanySettings = { ...DEFAULT_SETTINGS, language: "en" };
  return render(
    <SettingsPanel
      settings={baseSettings}
      cliStatus={null}
      onSave={vi.fn()}
      onRefreshCli={vi.fn()}
      oauthResult={null}
      onOauthResultClear={vi.fn()}
      {...overrides}
    />,
  );
}

describe("SettingsPanel resilience", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows oauth section error instead of crashing", async () => {
    apiMocks.getOAuthModelsMock.mockResolvedValue({});
    apiMocks.getOAuthStatusMock.mockRejectedValueOnce(
      new ApiRequestError("oauth down", {
        status: 500,
        code: "oauth_status_unavailable",
        url: "/api/oauth/status",
      }),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "tab-oauth" }));

    await waitFor(() => {
      expect(screen.getByTestId("oauth-load-error")).toHaveTextContent("OAuth status");
    });
  });

  it("shows cli section error with actionable message", async () => {
    const refreshError = new ApiRequestError("cli down", {
      status: 500,
      code: "cli_detection_failed",
      url: "/api/cli-status",
    });

    apiMocks.getCliModelsMock.mockResolvedValue({});
    const onRefreshCli = vi.fn().mockRejectedValue(refreshError);
    renderPanel({ onRefreshCli });

    fireEvent.click(screen.getByRole("button", { name: "tab-cli" }));

    await waitFor(() => {
      expect(screen.getByTestId("cli-load-error")).toHaveTextContent("CLI detection degraded");
    });
  });
});
