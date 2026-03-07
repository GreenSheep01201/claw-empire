import type { RoomTheme } from "../types";

export type View = "office" | "agents" | "dashboard" | "tasks" | "skills" | "settings" | "components";
export type TaskPanelTab = "terminal" | "minutes";
export type RuntimeOs = "windows" | "mac" | "linux" | "unknown";

export interface OAuthCallbackResult {
  provider: string | null;
  error: string | null;
}

export type RoomThemeMap = Record<string, RoomTheme>;

export type ProjectMetaPayload = {
  project_id?: string;
  project_path?: string;
  project_context?: string;
};

export type CliSubAgentEvent =
  | { kind: "spawn"; id: string; task: string | null }
  | { kind: "done"; id: string }
  | { kind: "bind_thread"; threadId: string; subAgentId: string }
  | { kind: "close_thread"; threadId: string };
