import type { LangText, UiLanguage } from "../../i18n";
import type { TaskStatus, TaskType } from "../../types";

export type Locale = UiLanguage;
export type TFunction = (messages: LangText) => string;

const TASK_CREATE_DRAFTS_STORAGE_KEY = "climpire.taskCreateDrafts";

export const HIDEABLE_STATUSES = ["done", "pending", "cancelled"] as const;
export type HideableStatus = (typeof HIDEABLE_STATUSES)[number];

export type CreateTaskDraft = {
  id: string;
  title: string;
  description: string;
  departmentId: string;
  taskType: TaskType;
  priority: number;
  assignAgentId: string;
  projectId: string;
  projectQuery: string;
  createNewProjectMode: boolean;
  newProjectPath: string;
  updatedAt: number;
};

export type MissingPathPrompt = {
  normalizedPath: string;
  canCreate: boolean;
  nearestExistingParent: string | null;
};

export type FormFeedback = {
  tone: "error" | "info";
  message: string;
};

export type ManualPathEntry = {
  name: string;
  path: string;
};

export function isHideableStatus(status: TaskStatus): status is HideableStatus {
  return (HIDEABLE_STATUSES as readonly TaskStatus[]).includes(status);
}

export function createDraftId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeTaskType(value: unknown): TaskType {
  if (
    value === "general" ||
    value === "development" ||
    value === "design" ||
    value === "analysis" ||
    value === "presentation" ||
    value === "documentation"
  ) {
    return value;
  }
  return "general";
}

export function loadCreateTaskDrafts(): CreateTaskDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TASK_CREATE_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => typeof row === "object" && row !== null)
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: typeof r.id === "string" && r.id ? r.id : createDraftId(),
          title: typeof r.title === "string" ? r.title : "",
          description: typeof r.description === "string" ? r.description : "",
          departmentId: typeof r.departmentId === "string" ? r.departmentId : "",
          taskType: normalizeTaskType(r.taskType),
          priority: typeof r.priority === "number" ? Math.min(Math.max(Math.trunc(r.priority), 1), 5) : 3,
          assignAgentId: typeof r.assignAgentId === "string" ? r.assignAgentId : "",
          projectId: typeof r.projectId === "string" ? r.projectId : "",
          projectQuery: typeof r.projectQuery === "string" ? r.projectQuery : "",
          createNewProjectMode: Boolean(r.createNewProjectMode),
          newProjectPath: typeof r.newProjectPath === "string" ? r.newProjectPath : "",
          updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
        } satisfies CreateTaskDraft;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveCreateTaskDrafts(drafts: CreateTaskDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TASK_CREATE_DRAFTS_STORAGE_KEY, JSON.stringify(drafts.slice(0, 20)));
}

export const COLUMNS: {
  status: TaskStatus;
  icon: string;
  headerBg: string;
  borderColor: string;
  dotColor: string;
}[] = [
  {
    status: "inbox",
    icon: "📥",
    headerBg: "bg-slate-800",
    borderColor: "border-slate-600",
    dotColor: "bg-slate-400",
  },
  {
    status: "planned",
    icon: "📋",
    headerBg: "bg-blue-900",
    borderColor: "border-blue-700",
    dotColor: "bg-blue-400",
  },
  {
    status: "collaborating",
    icon: "🤝",
    headerBg: "bg-indigo-900",
    borderColor: "border-indigo-700",
    dotColor: "bg-indigo-400",
  },
  {
    status: "in_progress",
    icon: "⚡",
    headerBg: "bg-amber-900",
    borderColor: "border-amber-700",
    dotColor: "bg-amber-400",
  },
  {
    status: "review",
    icon: "🔍",
    headerBg: "bg-purple-900",
    borderColor: "border-purple-700",
    dotColor: "bg-purple-400",
  },
  {
    status: "done",
    icon: "✅",
    headerBg: "bg-green-900",
    borderColor: "border-green-700",
    dotColor: "bg-green-400",
  },
  {
    status: "pending",
    icon: "⏸️",
    headerBg: "bg-orange-900",
    borderColor: "border-orange-700",
    dotColor: "bg-orange-400",
  },
  {
    status: "cancelled",
    icon: "🚫",
    headerBg: "bg-red-900",
    borderColor: "border-red-700",
    dotColor: "bg-red-400",
  },
];

export const STATUS_OPTIONS: TaskStatus[] = [
  "inbox",
  "planned",
  "collaborating",
  "in_progress",
  "review",
  "done",
  "pending",
  "cancelled",
];

export const TASK_TYPE_OPTIONS: { value: TaskType; color: string }[] = [
  { value: "general", color: "bg-slate-700 text-slate-300" },
  { value: "development", color: "bg-cyan-900 text-cyan-300" },
  { value: "design", color: "bg-pink-900 text-pink-300" },
  { value: "analysis", color: "bg-indigo-900 text-indigo-300" },
  { value: "presentation", color: "bg-orange-900 text-orange-300" },
  { value: "documentation", color: "bg-teal-900 text-teal-300" },
];

export function taskStatusLabel(status: TaskStatus, t: TFunction) {
  switch (status) {
    case "inbox":
      return t({ ko: "수신함", en: "Inbox", ja: "受信箱", zh: "收件箱", fr: "Boîte de réception" });
    case "planned":
      return t({ ko: "계획됨", en: "Planned", ja: "計画済み", zh: "已计划", fr: "Planifiée" });
    case "in_progress":
      return t({ ko: "진행 중", en: "In Progress", ja: "進行中", zh: "进行中", fr: "En cours" });
    case "review":
      return t({ ko: "검토", en: "Review", ja: "レビュー", zh: "审核", fr: "En revue" });
    case "done":
      return t({ ko: "완료", en: "Done", ja: "完了", zh: "完成", fr: "Terminée" });
    case "pending":
      return t({ ko: "보류", en: "Pending", ja: "保留", zh: "待处理", fr: "En attente" });
    case "cancelled":
      return t({ ko: "취소", en: "Cancelled", ja: "キャンセル", zh: "已取消", fr: "Annulée" });
    default:
      return status;
  }
}

export function taskTypeLabel(type: TaskType, t: TFunction) {
  switch (type) {
    case "general":
      return t({ ko: "일반", en: "General", ja: "一般", zh: "通用", fr: "Général" });
    case "development":
      return t({ ko: "개발", en: "Development", ja: "開発", zh: "开发", fr: "Développement" });
    case "design":
      return t({ ko: "디자인", en: "Design", ja: "デザイン", zh: "设计", fr: "Design" });
    case "analysis":
      return t({ ko: "분석", en: "Analysis", ja: "分析", zh: "分析", fr: "Analyse" });
    case "presentation":
      return t({ ko: "발표", en: "Presentation", ja: "プレゼン", zh: "演示", fr: "Présentation" });
    case "documentation":
      return t({ ko: "문서화", en: "Documentation", ja: "文書化", zh: "文档", fr: "Documentation" });
    default:
      return type;
  }
}

export function getTaskTypeBadge(type: TaskType, t: TFunction) {
  const option = TASK_TYPE_OPTIONS.find((entry) => entry.value === type) ?? TASK_TYPE_OPTIONS[0];
  return { ...option, label: taskTypeLabel(option.value, t) };
}

export function priorityIcon(priority: number) {
  if (priority >= 4) return "🔴";
  if (priority >= 2) return "🟡";
  return "🟢";
}

export function priorityLabel(priority: number, t: TFunction) {
  if (priority >= 4) return t({ ko: "높음", en: "High", ja: "高", zh: "高", fr: "Haute" });
  if (priority >= 2) return t({ ko: "중간", en: "Medium", ja: "中", zh: "中", fr: "Moyenne" });
  return t({ ko: "낮음", en: "Low", ja: "低", zh: "低", fr: "Basse" });
}

export function timeAgo(ts: number, localeTag: string): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  const relativeTimeFormat = new Intl.RelativeTimeFormat(localeTag, { numeric: "auto" });
  if (diffSec < 60) return relativeTimeFormat.format(-diffSec, "second");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return relativeTimeFormat.format(-diffMin, "minute");
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return relativeTimeFormat.format(-diffHour, "hour");
  return relativeTimeFormat.format(-Math.floor(diffHour / 24), "day");
}
