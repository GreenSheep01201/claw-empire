import type { Agent, Task } from "../../types";
import type { LangText } from "../../i18n";

export interface TerminalPanelProps {
  taskId: string;
  task: Task | undefined;
  agent: Agent | undefined;
  agents: Agent[];
  initialTab?: "terminal" | "minutes";
  onClose: () => void;
}

export type StatusBadgeTone = "accent" | "neutral";

export const STATUS_BADGES: Record<string, { label: LangText; tone: StatusBadgeTone }> = {
  in_progress: {
    label: { ko: "진행중", en: "Running", fr: "En cours", ja: "実行中", zh: "运行中" },
    tone: "accent",
  },
  review: {
    label: { ko: "검토", en: "Review", fr: "En revue", ja: "レビュー", zh: "审核" },
    tone: "neutral",
  },
  done: {
    label: { ko: "완료", en: "Done", fr: "Terminée", ja: "完了", zh: "完成" },
    tone: "accent",
  },
  inbox: {
    label: { ko: "수신함", en: "Inbox", fr: "À trier", ja: "受信箱", zh: "收件箱" },
    tone: "neutral",
  },
  planned: {
    label: { ko: "예정", en: "Planned", fr: "Planifiée", ja: "予定", zh: "计划" },
    tone: "neutral",
  },
  cancelled: {
    label: { ko: "취소", en: "Cancelled", fr: "Annulée", ja: "キャンセル", zh: "已取消" },
    tone: "neutral",
  },
};

export interface TaskLogEntry {
  id: number;
  kind: string;
  message: string;
  created_at: number;
}

export const TERMINAL_TAIL_LINES = 2000;
export const TERMINAL_TASK_LOG_LIMIT = 300;
export const INTERVENTION_PROMPT_MAX_LENGTH = 4000;
