import type { SkillHistoryProvider, SkillLearningHistoryEntry } from "../../api";
import type { Agent, AgentRole } from "../../types";

export const PROVIDER_ORDER: SkillHistoryProvider[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "kimi",
  "copilot",
  "antigravity",
  "api",
];

export const HISTORY_PREVIEW_COUNT = 3;

const ROLE_ORDER: Record<AgentRole, number> = {
  team_leader: 0,
  senior: 1,
  junior: 2,
  intern: 3,
};

export function providerLabel(provider: SkillHistoryProvider): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  if (provider === "opencode") return "OpenCode";
  if (provider === "kimi") return "Kimi Code";
  if (provider === "copilot") return "GitHub Copilot";
  if (provider === "antigravity") return "Antigravity";
  return "API Provider";
}

type Translate = (text: { ko: string; en: string; ja?: string; zh?: string; fr?: string }) => string;

const fallbackTranslate: Translate = (text) => text.en;

export function statusLabel(status: SkillLearningHistoryEntry["status"], t: Translate = fallbackTranslate): string {
  if (status === "queued") return t({ ko: "대기중", en: "Queued", ja: "待機中", zh: "排队中", fr: "En attente" });
  if (status === "running") return t({ ko: "학습중", en: "Running", ja: "学習中", zh: "学习中", fr: "En cours" });
  if (status === "succeeded") return t({ ko: "완료", en: "Succeeded", ja: "完了", zh: "完成", fr: "Apprise" });
  return t({ ko: "실패", en: "Failed", ja: "失敗", zh: "失败", fr: "Échec" });
}

/** Badge qg : vert = acquis, pointillé = en attente / en cours, contour = échec. */
export function statusClass(status: SkillLearningHistoryEntry["status"]): string {
  if (status === "succeeded") return "qg-badge qg-badge--accent";
  return "qg-badge";
}

export function statusIsPending(status: SkillLearningHistoryEntry["status"]): boolean {
  return status === "running" || status === "queued";
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(timestamp: number | null | undefined, localeTag = "en"): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "-";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const formatter = new Intl.RelativeTimeFormat(localeTag, { numeric: "auto", style: "short" });
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (diffSec >= seconds || unit === "second") {
      return formatter.format(-Math.floor(diffSec / seconds), unit);
    }
  }
  return "-";
}

export function normalizeSkillLabel(row: { repo: string; skill_id: string; skill_label: string }): string {
  if (row.skill_label && row.skill_label.trim()) return row.skill_label;
  if (row.skill_id && row.skill_id.trim()) return `${row.repo}#${row.skill_id}`;
  return row.repo;
}

export function learningRowKey(row: { provider: SkillHistoryProvider; repo: string; skill_id: string }): string {
  return `${row.provider}:${row.repo}:${row.skill_id}`;
}

export function pickRepresentativeForProvider(agents: Agent[], provider: SkillHistoryProvider): Agent | null {
  const candidates = agents.filter((agent) => agent.cli_provider === provider);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const roleGap = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleGap !== 0) return roleGap;
    if (b.stats_xp !== a.stats_xp) return b.stats_xp - a.stats_xp;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}
