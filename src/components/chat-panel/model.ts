import type { LangText } from "../../i18n";

export interface StreamingMessage {
  message_id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar: string;
  content: string;
}

export type ChatMode = "chat" | "task" | "announcement" | "report";

export type ProjectMetaPayload = {
  project_id?: string;
  project_path?: string;
  project_context?: string;
};

export type PendingSendAction =
  | { kind: "directive"; content: string }
  | { kind: "announcement"; content: string }
  | { kind: "task"; content: string; receiverId: string }
  | { kind: "report"; content: string; receiverId: string }
  | { kind: "chat"; content: string; receiverId: string }
  | { kind: "broadcast"; content: string };

export const STATUS_COLORS: Record<string, string> = {
  idle: "bg-[var(--th-text-secondary)]",
  working: "bg-[var(--qg-accent)]",
  break: "bg-[var(--th-text-muted)]",
  offline: "bg-[var(--th-border-strong)]",
};

export const STATUS_LABELS: Record<string, LangText> = {
  idle: { ko: "대기중", en: "Idle", ja: "待機中", zh: "待机中", fr: "Disponible" },
  working: { ko: "작업중", en: "Working", ja: "作業中", zh: "工作中", fr: "Au travail" },
  break: { ko: "휴식", en: "Break", ja: "休憩中", zh: "休息中", fr: "En pause" },
  offline: { ko: "오프라인", en: "Offline", ja: "オフライン", zh: "离线", fr: "Hors ligne" },
};

export const ROLE_LABELS: Record<string, LangText> = {
  team_leader: { ko: "팀장", en: "Team Leader", ja: "チームリーダー", zh: "组长", fr: "Chef de pôle" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级", fr: "Confirmé" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级", fr: "Junior" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生", fr: "Stagiaire" },
};

export function isPromiseLike(value: unknown): value is Promise<void> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}
