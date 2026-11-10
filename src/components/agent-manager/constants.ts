import type { AgentRole, CliProvider } from "../../types";
import type { DeptForm, FormData } from "./types";

export const ROLES: AgentRole[] = ["team_leader", "senior", "junior", "intern"];
export const CLI_PROVIDERS: CliProvider[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "kimi",
  "copilot",
  "antigravity",
  "api",
];

export const ROLE_LABEL: Record<string, { ko: string; en: string; fr: string }> = {
  team_leader: { ko: "팀장", en: "Leader", fr: "Responsable" },
  senior: { ko: "시니어", en: "Senior", fr: "Senior" },
  junior: { ko: "주니어", en: "Junior", fr: "Junior" },
  intern: { ko: "인턴", en: "Intern", fr: "Stagiaire" },
};

/** Classes de badge (qg-badge) par rôle : seul le responsable ressort en vert. */
export const ROLE_BADGE: Record<string, string> = {
  team_leader: "qg-badge qg-badge--accent",
  senior: "qg-badge",
  junior: "qg-badge",
  intern: "qg-badge",
};

/** Petit repère coloré d'état, toujours accompagné d'un libellé (STATUS_LABEL). */
export const STATUS_DOT: Record<string, string> = {
  working: "bg-[var(--qg-accent)]",
  break: "bg-[var(--th-text-secondary)]",
  offline: "bg-transparent border border-[var(--th-text-muted)]",
  idle: "bg-[var(--th-border-strong)]",
};

export const STATUS_LABEL: Record<string, { ko: string; en: string; fr: string }> = {
  working: { ko: "근무 중", en: "Working", fr: "Au travail" },
  break: { ko: "휴식 중", en: "On break", fr: "En pause" },
  offline: { ko: "오프라인", en: "Offline", fr: "Hors ligne" },
  idle: { ko: "대기 중", en: "Idle", fr: "Disponible" },
};

export const ICON_SPRITE_POOL = Array.from({ length: 13 }, (_, i) => i + 1);

export const EMOJI_GROUPS: { label: string; labelEn: string; labelFr: string; emojis: string[] }[] = [
  {
    label: "부서/업무",
    labelEn: "Work",
    labelFr: "Travail",
    emojis: ["📊", "💻", "🎨", "🔍", "🛡️", "⚙️", "📁", "🏢", "📋", "📈", "💼", "🗂️", "📌", "🎯", "🔧", "🧪"],
  },
  {
    label: "사람/표정",
    labelEn: "People",
    labelFr: "Personnes",
    emojis: ["🤖", "👤", "👥", "😊", "😎", "🤓", "🧑‍💻", "👨‍🔬", "👩‍🎨", "🧑‍🏫", "🦸", "🦊", "🐱", "🐶", "🐻", "🐼"],
  },
  {
    label: "사물/기호",
    labelEn: "Objects",
    labelFr: "Objets",
    emojis: ["💡", "🚀", "⚡", "🔥", "💎", "🏆", "🎵", "🎮", "📱", "💾", "🖥️", "📡", "🔑", "🛠️", "📦", "🧩"],
  },
  {
    label: "자연/색상",
    labelEn: "Nature",
    labelFr: "Nature",
    emojis: ["🌟", "⭐", "🌈", "🌊", "🌸", "🍀", "🌙", "☀️", "❄️", "🔵", "🟢", "🟡", "🔴", "🟣", "🟠", "⚪"],
  },
];

export const BLANK: FormData = {
  name: "",
  name_ko: "",
  name_ja: "",
  name_zh: "",
  department_id: "",
  role: "junior",
  cli_provider: "claude",
  avatar_emoji: "🤖",
  sprite_number: null,
  personality: "",
};

export const DEPT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#f97316",
  "#ec4899",
  "#06b6d4",
  "#6b7280",
];

export const DEPT_BLANK: DeptForm = {
  id: "",
  name: "",
  name_ko: "",
  name_ja: "",
  name_zh: "",
  icon: "📁",
  color: "#3b82f6",
  description: "",
  prompt: "",
};
