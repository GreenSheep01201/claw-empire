import type { UiLanguage } from "../../i18n";
import type { RoomTheme } from "./model";

type SupportedLocale = UiLanguage;

const LOCALE_TEXT = {
  ceoOffice: {
    ko: "CEO 오피스",
    en: "CEO OFFICE",
    ja: "CEOオフィス",
    zh: "CEO办公室",
    fr: "BUREAU DU CEO",
  },
  collabTable: {
    ko: "6인 협업 테이블",
    en: "6P COLLAB TABLE",
    ja: "6人コラボテーブル",
    zh: "6人协作桌",
    fr: "TABLE DE RÉUNION (6)",
  },
  statsEmployees: { ko: "직원", en: "Staff", ja: "スタッフ", zh: "员工", fr: "Effectif" },
  statsWorking: { ko: "작업중", en: "Working", ja: "作業中", zh: "处理中", fr: "Au travail" },
  statsProgress: { ko: "진행", en: "In Progress", ja: "進行", zh: "进行中", fr: "En cours" },
  statsDone: { ko: "완료", en: "Done", ja: "完了", zh: "已完成", fr: "Terminées" },
  hint: {
    ko: "WASD/방향키/가상패드: CEO 이동  |  Enter: 상호작용",
    en: "WASD/Arrow/Virtual Pad: CEO Move  |  Enter: Interact",
    ja: "WASD/矢印キー/仮想パッド: CEO移動  |  Enter: 操作",
    zh: "WASD/方向键/虚拟手柄: CEO移动  |  Enter: 交互",
    fr: "ZQSD/Flèches : déplacer le CEO  |  Entrée : interagir",
  },
  mobileEnter: {
    ko: "Enter",
    en: "Enter",
    ja: "Enter",
    zh: "Enter",
    fr: "Entrer",
  },
  noAssignedAgent: {
    ko: "배정된 직원 없음",
    en: "No assigned staff",
    ja: "担当スタッフなし",
    zh: "暂无分配员工",
    fr: "Aucun agent affecté",
  },
  breakRoom: {
    ko: "☕ 휴게실",
    en: "☕ Break Room",
    ja: "☕ 休憩室",
    zh: "☕ 休息室",
    fr: "☕ Salle de pause",
  },
  role: {
    team_leader: { ko: "팀장", en: "Lead", ja: "リーダー", zh: "组长", fr: "Resp." },
    senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "资深", fr: "Senior" },
    junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级", fr: "Junior" },
    intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习", fr: "Stagiaire" },
    part_time: { ko: "알바", en: "Part-time", ja: "アルバイト", zh: "兼职", fr: "Temps partiel" },
  },
  partTime: {
    ko: "알바",
    en: "Part-time",
    ja: "アルバイト",
    zh: "兼职",
    fr: "Temps partiel",
  },
  collabBadge: {
    ko: "🤝 협업",
    en: "🤝 Collaboration",
    ja: "🤝 協業",
    zh: "🤝 协作",
    fr: "🤝 Collaboration",
  },
  meetingBadgeKickoff: {
    ko: "📣 회의",
    en: "📣 Meeting",
    ja: "📣 会議",
    zh: "📣 会议",
    fr: "📣 Réunion",
  },
  meetingBadgeReviewing: {
    ko: "🔎 검토중",
    en: "🔎 Reviewing",
    ja: "🔎 検討中",
    zh: "🔎 评审中",
    fr: "🔎 En revue",
  },
  meetingBadgeApproved: {
    ko: "✅ 승인",
    en: "✅ Approval",
    ja: "✅ 承認",
    zh: "✅ 审批",
    fr: "✅ Validé",
  },
  meetingBadgeHold: {
    ko: "⚠ 보류",
    en: "⚠ Hold",
    ja: "⚠ 保留",
    zh: "⚠ 暂缓",
    fr: "⚠ En pause",
  },
  kickoffLines: {
    ko: ["유관부서 영향도 확인중", "리스크/의존성 공유중", "일정/우선순위 조율중", "담당 경계 정의중"],
    en: [
      "Checking cross-team impact",
      "Sharing risks/dependencies",
      "Aligning schedule/priorities",
      "Defining ownership boundaries",
    ],
    ja: ["関連部署への影響を確認中", "リスク/依存関係を共有中", "日程/優先度を調整中", "担当境界を定義中"],
    zh: ["正在确认跨团队影响", "正在共享风险/依赖关系", "正在协调排期/优先级", "正在定义职责边界"],
    fr: [
      "Vérification de l'impact entre pôles",
      "Partage des risques et dépendances",
      "Alignement du planning et des priorités",
      "Répartition des responsabilités",
    ],
  },
  reviewLines: {
    ko: ["보완사항 반영 확인중", "최종안 Approved 검토중", "수정 아이디어 공유중", "결과물 교차 검토중"],
    en: [
      "Verifying follow-up updates",
      "Reviewing final approval draft",
      "Sharing revision ideas",
      "Cross-checking deliverables",
    ],
    ja: ["補完事項の反映を確認中", "最終承認案を確認中", "修正アイデアを共有中", "成果物を相互レビュー中"],
    zh: ["正在确认补充项是否反映", "正在审阅最终审批方案", "正在共享修改思路", "正在交叉评审交付物"],
    fr: [
      "Vérification des corrections",
      "Relecture de la version finale",
      "Partage des pistes de correction",
      "Relecture croisée des livrables",
    ],
  },
  meetingTableHint: {
    ko: "📝 회의 중: 테이블 클릭해 회의록 보기",
    en: "📝 Meeting live: click table for minutes",
    ja: "📝 会議中: テーブルをクリックして会議録を見る",
    zh: "📝 会议进行中：点击桌子查看纪要",
    fr: "📝 Réunion en cours : cliquer sur la table pour le compte rendu",
  },
  cliUsageTitle: {
    ko: "CLI 사용량",
    en: "CLI Usage",
    ja: "CLI使用量",
    zh: "CLI 使用量",
    fr: "Utilisation des outils IA",
  },
  cliConnected: {
    ko: "연결됨",
    en: "connected",
    ja: "接続中",
    zh: "已连接",
    fr: "connecté",
  },
  cliRefreshTitle: {
    ko: "사용량 새로고침",
    en: "Refresh usage data",
    ja: "使用量を更新",
    zh: "刷新用量数据",
    fr: "Actualiser l'utilisation",
  },
  cliNotSignedIn: {
    ko: "로그인되지 않음",
    en: "not signed in",
    ja: "未サインイン",
    zh: "未登录",
    fr: "non connecté",
  },
  cliNoApi: {
    ko: "사용량 API 없음",
    en: "no usage API",
    ja: "使用量APIなし",
    zh: "无用量 API",
    fr: "pas d'API d'usage",
  },
  cliUnavailable: {
    ko: "사용 불가",
    en: "unavailable",
    ja: "利用不可",
    zh: "不可用",
    fr: "indisponible",
  },
  cliLoading: {
    ko: "불러오는 중...",
    en: "loading...",
    ja: "読み込み中...",
    zh: "加载中...",
    fr: "chargement…",
  },
  cliResets: {
    ko: "리셋까지",
    en: "resets",
    ja: "リセットまで",
    zh: "重置剩余",
    fr: "réinit.",
  },
  cliNoData: {
    ko: "데이터 없음",
    en: "no data",
    ja: "データなし",
    zh: "无数据",
    fr: "aucune donnée",
  },
  soon: {
    ko: "곧",
    en: "soon",
    ja: "まもなく",
    zh: "即将",
    fr: "bientôt",
  },
};

type LocaleMap<T> = { ko: T; en: T } & Partial<Record<SupportedLocale, T>>;

function pickLocale<T>(locale: SupportedLocale, map: LocaleMap<T>): T {
  return map[locale] ?? map.en;
}

/** Default room palette per department (overridable via custom room themes). */
const DEPT_THEME: Record<string, RoomTheme> = {
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
};

export { type SupportedLocale, LOCALE_TEXT, pickLocale, DEPT_THEME };
