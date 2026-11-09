import { Circle, Orbit, Plug, Rocket } from "lucide-react";
import type { SkillEntry, SkillHistoryProvider, SkillLearnJob, SkillLearnProvider } from "../../api";
import type { LangText, UiLanguage } from "../../i18n";
import type { Agent, AgentRole } from "../../types";

export interface CategorizedSkill extends SkillEntry {
  category: string;
  installsDisplay: string;
}

export type Locale = UiLanguage;
export type TFunction = (messages: LangText) => string;

export function categorize(name: string, repo: string): string {
  const n = name.toLowerCase();
  const r = repo.toLowerCase();
  if (
    n.includes("design") ||
    n.includes("ui") ||
    n.includes("ux") ||
    n.includes("brand") ||
    n.includes("canvas") ||
    n.includes("theme") ||
    n.includes("interface") ||
    n.includes("visual") ||
    n.includes("interaction")
  )
    return "Design";
  if (
    n.includes("marketing") ||
    n.includes("seo") ||
    n.includes("copywriting") ||
    n.includes("content") ||
    n.includes("social") ||
    n.includes("pricing") ||
    n.includes("launch") ||
    n.includes("analytics") ||
    n.includes("cro") ||
    n.includes("ads") ||
    n.includes("email-sequence") ||
    n.includes("referral") ||
    n.includes("competitor") ||
    n.includes("onboarding") ||
    n.includes("signup") ||
    n.includes("paywall") ||
    n.includes("popup") ||
    n.includes("ab-test") ||
    n.includes("free-tool") ||
    n.includes("backlink") ||
    r.includes("marketingskills")
  )
    return "Marketing";
  if (
    n.includes("test") ||
    n.includes("debug") ||
    n.includes("audit") ||
    n.includes("review") ||
    n.includes("verification") ||
    n.includes("e2e")
  )
    return "Testing & QA";
  if (
    n.includes("react") ||
    n.includes("vue") ||
    n.includes("next") ||
    n.includes("expo") ||
    n.includes("flutter") ||
    n.includes("swift") ||
    n.includes("angular") ||
    n.includes("tailwind") ||
    n.includes("shadcn") ||
    n.includes("nuxt") ||
    n.includes("vite") ||
    n.includes("native") ||
    n.includes("responsive") ||
    n.includes("component") ||
    n.includes("frontend") ||
    n.includes("remotion") ||
    n.includes("slidev") ||
    n.includes("stitch")
  )
    return "Frontend";
  if (
    n.includes("api") ||
    n.includes("backend") ||
    n.includes("node") ||
    n.includes("fastapi") ||
    n.includes("nest") ||
    n.includes("laravel") ||
    n.includes("python") ||
    n.includes("golang") ||
    n.includes("async") ||
    n.includes("sql") ||
    n.includes("postgres") ||
    n.includes("supabase") ||
    n.includes("convex") ||
    n.includes("stripe") ||
    n.includes("auth") ||
    n.includes("microservices") ||
    n.includes("error-handling")
  )
    return "Backend";
  if (
    n.includes("docker") ||
    n.includes("github-actions") ||
    n.includes("cicd") ||
    n.includes("deploy") ||
    n.includes("monorepo") ||
    n.includes("turborepo") ||
    n.includes("pnpm") ||
    n.includes("uv-package") ||
    n.includes("git") ||
    n.includes("release") ||
    n.includes("worktree")
  )
    return "DevOps";
  if (
    n.includes("agent") ||
    n.includes("mcp") ||
    n.includes("prompt") ||
    n.includes("langchain") ||
    n.includes("rag") ||
    n.includes("ai-sdk") ||
    n.includes("browser-use") ||
    n.includes("skill-creator") ||
    n.includes("find-skills") ||
    n.includes("remembering") ||
    n.includes("subagent") ||
    n.includes("dispatching") ||
    n.includes("planning") ||
    n.includes("executing") ||
    n.includes("writing-plans") ||
    n.includes("brainstorming") ||
    n.includes("using-superpowers") ||
    n.includes("finishing") ||
    n.includes("requesting") ||
    n.includes("receiving") ||
    n.includes("agentation") ||
    n.includes("clawdirect") ||
    n.includes("instaclaw") ||
    n.includes("nblm") ||
    n.includes("context7")
  )
    return "AI & Agent";
  if (
    n.includes("pdf") ||
    n.includes("pptx") ||
    n.includes("docx") ||
    n.includes("xlsx") ||
    n.includes("doc-coauthor") ||
    n.includes("internal-comms") ||
    n.includes("slack") ||
    n.includes("writing") ||
    n.includes("copy-editing") ||
    n.includes("humanizer") ||
    n.includes("obsidian") ||
    n.includes("baoyu") ||
    n.includes("firecrawl") ||
    n.includes("web-artifacts") ||
    n.includes("comic") ||
    n.includes("image") ||
    n.includes("infographic") ||
    n.includes("url-to-markdown")
  )
    return "Productivity";
  if (n.includes("security") || n.includes("accessibility")) return "Security";
  if (
    n.includes("typescript") ||
    n.includes("javascript") ||
    n.includes("architecture") ||
    n.includes("state-management") ||
    n.includes("modern-javascript")
  )
    return "Architecture";
  return "Other";
}

export function formatInstalls(n: number, localeTag: string): string {
  return new Intl.NumberFormat(localeTag, {
    notation: n >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export const CATEGORIES = [
  "All",
  "Frontend",
  "Backend",
  "Design",
  "AI & Agent",
  "Marketing",
  "Testing & QA",
  "DevOps",
  "Productivity",
  "Architecture",
  "Security",
  "Other",
];

export const CATEGORY_ICONS: Record<string, string> = {
  All: "📚",
  Frontend: "🎨",
  Backend: "🔧",
  Design: "✨",
  "AI & Agent": "🤖",
  Marketing: "📈",
  "Testing & QA": "🧪",
  DevOps: "🚀",
  Productivity: "📝",
  Architecture: "🏗️",
  Security: "🔒",
  Other: "📦",
};

export function categoryLabel(category: string, t: TFunction) {
  switch (category) {
    case "All":
      return t({ ko: "전체", en: "All", ja: "すべて", zh: "全部", fr: "Tous" });
    case "Frontend":
      return t({ ko: "프론트엔드", en: "Frontend", ja: "フロントエンド", zh: "前端", fr: "Interface web" });
    case "Backend":
      return t({ ko: "백엔드", en: "Backend", ja: "バックエンド", zh: "后端", fr: "Serveur" });
    case "Design":
      return t({ ko: "디자인", en: "Design", ja: "デザイン", zh: "设计", fr: "Design" });
    case "AI & Agent":
      return t({ ko: "AI & 에이전트", en: "AI & Agent", ja: "AI & エージェント", zh: "AI 与代理", fr: "IA et agents" });
    case "Marketing":
      return t({ ko: "마케팅", en: "Marketing", ja: "マーケティング", zh: "营销", fr: "Marketing" });
    case "Testing & QA":
      return t({ ko: "테스트 & QA", en: "Testing & QA", ja: "テスト & QA", zh: "测试与 QA", fr: "Tests et qualité" });
    case "DevOps":
      return t({ ko: "데브옵스", en: "DevOps", ja: "DevOps", zh: "DevOps", fr: "Mise en ligne" });
    case "Productivity":
      return t({ ko: "생산성", en: "Productivity", ja: "生産性", zh: "效率", fr: "Productivité" });
    case "Architecture":
      return t({ ko: "아키텍처", en: "Architecture", ja: "アーキテクチャ", zh: "架构", fr: "Architecture" });
    case "Security":
      return t({ ko: "보안", en: "Security", ja: "セキュリティ", zh: "安全", fr: "Sécurité" });
    case "Other":
      return t({ ko: "기타", en: "Other", ja: "その他", zh: "其他", fr: "Autres" });
    default:
      return category;
  }
}

/** Classement : le podium (1–3) ressort en vert, le reste reste neutre. */
export function getRankBadge(rank: number): string {
  return rank <= 3 ? "qg-badge qg-badge--accent" : "qg-badge";
}

export function formatFirstSeen(value: string, localeTag: string): string {
  if (!value) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function localizeAuditStatus(status: string, t: TFunction): string {
  const normalized = status.toLowerCase();
  if (normalized === "pass") return t({ ko: "통과", en: "Pass", ja: "合格", zh: "通过", fr: "Validé" });
  if (normalized === "warn") return t({ ko: "경고", en: "Warn", ja: "警告", zh: "警告", fr: "Attention" });
  if (normalized === "pending") return t({ ko: "대기", en: "Pending", ja: "保留", zh: "待处理", fr: "En attente" });
  if (normalized === "fail") return t({ ko: "실패", en: "Fail", ja: "失敗", zh: "失败", fr: "Échec" });
  return status;
}

export const LEARN_PROVIDER_ORDER: SkillLearnProvider[] = ["claude", "codex", "gemini", "opencode", "kimi"];
export const LEARNED_PROVIDER_ORDER: SkillHistoryProvider[] = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "copilot",
  "antigravity",
  "api",
];

export type UnlearnEffect = "pot" | "hammer";

const ROLE_ORDER: Record<AgentRole, number> = {
  team_leader: 0,
  senior: 1,
  junior: 2,
  intern: 3,
};

export function roleLabel(role: AgentRole, t: TFunction): string {
  if (role === "team_leader")
    return t({ ko: "팀장", en: "Team Lead", ja: "チームリード", zh: "团队负责人", fr: "Responsable" });
  if (role === "senior") return t({ ko: "시니어", en: "Senior", ja: "シニア", zh: "资深", fr: "Senior" });
  if (role === "junior") return t({ ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级", fr: "Junior" });
  return t({ ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生", fr: "Stagiaire" });
}

export function providerLabel(provider: SkillLearnProvider): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  if (provider === "kimi") return "Kimi Code";
  return "OpenCode";
}

export function learnedProviderLabel(provider: SkillHistoryProvider): string {
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex CLI";
  if (provider === "gemini") return "Gemini CLI";
  if (provider === "opencode") return "OpenCode";
  if (provider === "kimi") return "Kimi Code";
  if (provider === "copilot") return "GitHub Copilot";
  if (provider === "antigravity") return "Antigravity";
  return "API Provider";
}

function CliClaudeLogo({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <path
        fill="#D97757"
        d="m124.011 241.251 49.164-27.585.826-2.396-.826-1.333h-2.396l-8.217-.506-28.09-.759-24.363-1.012-23.603-1.266-5.938-1.265L75 197.79l.574-3.661 4.994-3.358 7.153.625 15.808 1.079 23.722 1.637 17.208 1.012 25.493 2.649h4.049l.574-1.637-1.384-1.012-1.079-1.012-24.548-16.635-26.573-17.58-13.919-10.123-7.524-5.129-3.796-4.808-1.637-10.494 6.833-7.525 9.178.624 2.345.625 9.296 7.153 19.858 15.37 25.931 19.098 3.796 3.155 1.519-1.08.185-.759-1.704-2.851-14.104-25.493-15.049-25.931-6.698-10.747-1.772-6.445c-.624-2.649-1.08-4.876-1.08-7.592l7.778-10.561L144.729 75l10.376 1.383 4.37 3.797 6.445 14.745 10.443 23.215 16.197 31.566 4.741 9.364 2.53 8.672.945 2.649h1.637v-1.519l1.332-17.782 2.464-21.832 2.395-28.091.827-7.912 3.914-9.482 7.778-5.129 6.074 2.902 4.994 7.153-.692 4.623-2.969 19.301-5.821 30.234-3.796 20.245h2.21l2.531-2.53 10.241-13.599 17.208-21.511 7.593-8.537 8.857-9.431 5.686-4.488h10.747l7.912 11.76-3.543 12.147-11.067 14.037-9.178 11.895-13.16 17.714-8.216 14.172.759 1.131 1.957-.186 29.727-6.327 16.062-2.901 19.166-3.29 8.672 4.049.944 4.116-3.408 8.419-20.498 5.062-24.042 4.808-35.801 8.469-.439.321.506.624 16.13 1.519 6.9.371h16.888l31.448 2.345 8.217 5.433 4.926 6.647-.827 5.061-12.653 6.445-17.074-4.049-39.85-9.482-13.666-3.408h-1.889v1.131l11.388 11.135 20.87 18.845 26.133 24.295 1.333 6.006-3.357 4.741-3.543-.506-22.962-17.277-8.858-7.777-20.06-16.888H238.5v1.771l4.623 6.765 24.413 36.696 1.265 11.253-1.771 3.661-6.327 2.21-6.951-1.265-14.29-20.06-14.745-22.591-11.895-20.246-1.451.827-7.018 75.601-3.29 3.863-7.592 2.902-6.327-4.808-3.357-7.778 3.357-15.37 4.049-20.06 3.29-15.943 2.969-19.807 1.772-6.58-.118-.439-1.451.186-14.931 20.498-22.709 30.689-17.968 19.234-4.302 1.704-7.458-3.864.692-6.9 4.167-6.141 24.869-31.634 14.999-19.605 9.684-11.32-.068-1.637h-.573l-66.052 42.887-11.759 1.519-5.062-4.741.625-7.778 2.395-2.531 19.858-13.665-.068.067z"
      />
    </svg>
  );
}

function CliCodexLogo({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.413a6.12 6.12 0 00-5.834 4.27 5.984 5.984 0 00-3.996 2.9 6.043 6.043 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.192 24a6.116 6.116 0 005.84-4.27 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.01zM13.192 22.784a4.474 4.474 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.658 18.607a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.77.77 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 20.236a4.508 4.508 0 01-6.083-1.63zM2.328 7.847A4.477 4.477 0 014.68 5.879l-.002.159v5.52a.78.78 0 00.391.676l5.84 3.37-2.02 1.166a.08.08 0 01-.073.007L3.917 13.98a4.506 4.506 0 01-1.589-6.132zM19.835 11.94l-5.844-3.37 2.02-1.166a.08.08 0 01.073-.007l4.898 2.794a4.494 4.494 0 01-.69 8.109v-5.68a.79.79 0 00-.457-.68zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L10.302 9.42V7.088a.08.08 0 01.033-.062l4.898-2.824a4.497 4.497 0 016.612 4.66v.054zM9.076 12.59l-2.02-1.164a.08.08 0 01-.038-.057V5.79A4.498 4.498 0 0114.392 3.2l-.141.08-4.778 2.758a.795.795 0 00-.392.681l-.005 5.87zm1.098-2.358L12 9.019l1.826 1.054v2.109L12 13.235l-1.826-1.054v-2.108z"
        fill="#10A37F"
      />
    </svg>
  );
}

function CliGeminiLogo({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
        fill="#6C7FF8"
      />
    </svg>
  );
}

function CliKimiLogo({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#111827" />
      <path d="M8 6h2.5v5.1L15 6h3l-4.7 5.66L18.4 18H15.3l-3.72-4.84-1.08 1.24V18H8V6z" fill="#F9FAFB" />
    </svg>
  );
}

export function cliProviderIcon(provider: SkillHistoryProvider) {
  if (provider === "claude") return <CliClaudeLogo />;
  if (provider === "codex") return <CliCodexLogo />;
  if (provider === "gemini") return <CliGeminiLogo />;
  if (provider === "kimi") return <CliKimiLogo />;
  if (provider === "opencode") return <Circle size={12} aria-hidden="true" />;
  if (provider === "copilot") return <Rocket size={12} aria-hidden="true" />;
  if (provider === "antigravity") return <Orbit size={12} aria-hidden="true" />;
  return <Plug size={12} aria-hidden="true" />;
}

export function learningStatusLabel(status: SkillLearnJob["status"] | null, t: TFunction): string {
  if (status === "queued") return t({ ko: "대기중", en: "Queued", ja: "待機中", zh: "排队中", fr: "En attente" });
  if (status === "running") return t({ ko: "학습중", en: "Running", ja: "学習中", zh: "学习中", fr: "En cours" });
  if (status === "succeeded") return t({ ko: "완료", en: "Succeeded", ja: "完了", zh: "完成", fr: "Terminé" });
  if (status === "failed") return t({ ko: "실패", en: "Failed", ja: "失敗", zh: "失败", fr: "Échec" });
  return "-";
}

export function pickRepresentativeForProvider(agents: Agent[], provider: Agent["cli_provider"]): Agent | null {
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
