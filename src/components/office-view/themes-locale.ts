import { type Graphics, type Text, TextStyle } from "pixi.js";
import type { UiLanguage } from "../../i18n";
import type { MeetingReviewDecision } from "../../types";
import type { RoomTheme } from "./model";

const OFFICE_PASTEL_LIGHT = {
  creamWhite: 0xf8f3ec,
  creamDeep: 0xebdfcf,
  softMint: 0xbfded5,
  softMintDeep: 0x8fbcb0,
  dustyRose: 0xd5a5ae,
  dustyRoseDeep: 0xb67d89,
  warmSand: 0xd6b996,
  warmWood: 0xb8906d,
  cocoa: 0x6f4d3a,
  ink: 0x2f2530,
  slate: 0x586378,
};

/* ── Dark (late-night coding session) palette ── */
const OFFICE_PASTEL_DARK = {
  creamWhite: 0x0e1020,
  creamDeep: 0x0c0e1e,
  softMint: 0x122030,
  softMintDeep: 0x0e1a28,
  dustyRose: 0x201020,
  dustyRoseDeep: 0x1a0c1a,
  warmSand: 0x1a1810,
  warmWood: 0x16130c,
  cocoa: 0x140f08,
  ink: 0xc8cee0,
  slate: 0x7888a8,
};

let OFFICE_PASTEL = OFFICE_PASTEL_LIGHT;

const DEFAULT_CEO_THEME_LIGHT: RoomTheme = {
  floor1: 0xe5d9b9,
  floor2: 0xdfd0a8,
  wall: 0x998243,
  accent: 0xa77d0c,
};
const DEFAULT_CEO_THEME_DARK: RoomTheme = {
  floor1: 0x101020,
  floor2: 0x0e0e1c,
  wall: 0x2a2450,
  accent: 0x584818,
};

const DEFAULT_BREAK_THEME_LIGHT: RoomTheme = {
  floor1: 0xf7e2b7,
  floor2: 0xf6dead,
  wall: 0xa99c83,
  accent: 0xf0c878,
};
const DEFAULT_BREAK_THEME_DARK: RoomTheme = {
  floor1: 0x141210,
  floor2: 0x10100e,
  wall: 0x302a20,
  accent: 0x4a3c18,
};

let DEFAULT_CEO_THEME = DEFAULT_CEO_THEME_LIGHT;
let DEFAULT_BREAK_THEME = DEFAULT_BREAK_THEME_LIGHT;

type SupportedLocale = UiLanguage;

const LOCALE_TEXT = {
  ceoOffice: {
    ko: "CEO 오피스",
    en: "CEO OFFICE",
    ja: "CEOオフィス",
    zh: "CEO办公室",
  },
  collabTable: {
    ko: "6인 협업 테이블",
    en: "6P COLLAB TABLE",
    ja: "6人コラボテーブル",
    zh: "6人协作桌",
  },
  statsEmployees: { ko: "직원", en: "Staff", ja: "スタッフ", zh: "员工" },
  statsWorking: { ko: "작업중", en: "Working", ja: "作業中", zh: "处理中" },
  statsProgress: { ko: "진행", en: "In Progress", ja: "進行", zh: "进行中" },
  statsDone: { ko: "완료", en: "Done", ja: "完了", zh: "已完成" },
  hint: {
    ko: "WASD/방향키/가상패드: CEO 이동  |  Enter: 상호작용",
    en: "WASD/Arrow/Virtual Pad: CEO Move  |  Enter: Interact",
    ja: "WASD/矢印キー/仮想パッド: CEO移動  |  Enter: 操作",
    zh: "WASD/方向键/虚拟手柄: CEO移动  |  Enter: 交互",
  },
  mobileEnter: {
    ko: "Enter",
    en: "Enter",
    ja: "Enter",
    zh: "Enter",
  },
  noAssignedAgent: {
    ko: "배정된 직원 없음",
    en: "No assigned staff",
    ja: "担当スタッフなし",
    zh: "暂无分配员工",
  },
  breakRoom: {
    ko: "☕ 휴게실",
    en: "☕ Break Room",
    ja: "☕ 休憩室",
    zh: "☕ 休息室",
  },
  role: {
    team_leader: { ko: "팀장", en: "Lead", ja: "リーダー", zh: "组长" },
    senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "资深" },
    junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
    intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习" },
    part_time: { ko: "알바", en: "Part-time", ja: "アルバイト", zh: "兼职" },
  },
  partTime: {
    ko: "알바",
    en: "Part-time",
    ja: "アルバイト",
    zh: "兼职",
  },
  collabBadge: {
    ko: "🤝 협업",
    en: "🤝 Collaboration",
    ja: "🤝 協業",
    zh: "🤝 协作",
  },
  meetingBadgeKickoff: {
    ko: "📣 회의",
    en: "📣 Meeting",
    ja: "📣 会議",
    zh: "📣 会议",
  },
  meetingBadgeReviewing: {
    ko: "🔎 검토중",
    en: "🔎 Reviewing",
    ja: "🔎 検討中",
    zh: "🔎 评审中",
  },
  meetingBadgeApproved: {
    ko: "✅ 승인",
    en: "✅ Approval",
    ja: "✅ 承認",
    zh: "✅ 审批",
  },
  meetingBadgeHold: {
    ko: "⚠ 보류",
    en: "⚠ Hold",
    ja: "⚠ 保留",
    zh: "⚠ 暂缓",
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
  },
  meetingTableHint: {
    ko: "📝 회의 중: 테이블 클릭해 회의록 보기",
    en: "📝 Meeting live: click table for minutes",
    ja: "📝 会議中: テーブルをクリックして会議録を見る",
    zh: "📝 会议进行中：点击桌子查看纪要",
  },
  cliUsageTitle: {
    ko: "CLI 사용량",
    en: "CLI Usage",
    ja: "CLI使用量",
    zh: "CLI 使用量",
  },
  cliConnected: {
    ko: "연결됨",
    en: "connected",
    ja: "接続中",
    zh: "已连接",
  },
  cliRefreshTitle: {
    ko: "사용량 새로고침",
    en: "Refresh usage data",
    ja: "使用量を更新",
    zh: "刷新用量数据",
  },
  cliNotSignedIn: {
    ko: "로그인되지 않음",
    en: "not signed in",
    ja: "未サインイン",
    zh: "未登录",
  },
  cliNoApi: {
    ko: "사용량 API 없음",
    en: "no usage API",
    ja: "使用量APIなし",
    zh: "无用量 API",
  },
  cliUnavailable: {
    ko: "사용 불가",
    en: "unavailable",
    ja: "利用不可",
    zh: "不可用",
  },
  cliLoading: {
    ko: "불러오는 중...",
    en: "loading...",
    ja: "読み込み中...",
    zh: "加载中...",
  },
  cliResets: {
    ko: "리셋까지",
    en: "resets",
    ja: "リセットまで",
    zh: "重置剩余",
  },
  cliNoData: {
    ko: "데이터 없음",
    en: "no data",
    ja: "データなし",
    zh: "无数据",
  },
  soon: {
    ko: "곧",
    en: "soon",
    ja: "まもなく",
    zh: "即将",
  },
};

const BREAK_CHAT_MESSAGES: LocaleMap<string[]> = {
  ko: [
    "커피 한 잔 더~",
    "오늘 점심 뭐 먹지?",
    "아 졸려...",
    "주말에 뭐 해?",
    "이번 프로젝트 힘들다ㅋ",
    "카페라떼 최고!",
    "오늘 날씨 좋다~",
    "야근 싫어ㅠ",
    "맛있는 거 먹고 싶다",
    "조금만 쉬자~",
    "ㅋㅋㅋㅋ",
    "간식 왔다!",
    "5분만 더~",
    "힘내자 파이팅!",
    "에너지 충전 중...",
    "집에 가고 싶다~",
  ],
  en: [
    "One more cup of coffee~",
    "What should we eat for lunch?",
    "So sleepy...",
    "Any weekend plans?",
    "This project is tough lol",
    "Cafe latte wins!",
    "Nice weather today~",
    "I hate overtime...",
    "Craving something tasty",
    "Let's take a short break~",
    "LOL",
    "Snacks are here!",
    "5 more minutes~",
    "Let's go, fighting!",
    "Recharging energy...",
    "I want to go home~",
  ],
  ja: [
    "コーヒーもう一杯~",
    "今日のランチ何にする?",
    "眠い...",
    "週末なにする?",
    "今回のプロジェクト大変w",
    "カフェラテ最高!",
    "今日の天気いいね~",
    "残業いやだ...",
    "おいしいもの食べたい",
    "ちょっと休もう~",
    "www",
    "おやつ来た!",
    "あと5分だけ~",
    "頑張ろう!",
    "エネルギー充電中...",
    "家に帰りたい~",
  ],
  zh: [
    "再来一杯咖啡~",
    "今天午饭吃什么?",
    "好困...",
    "周末准备做什么?",
    "这个项目有点难哈哈",
    "拿铁最棒!",
    "今天天气真好~",
    "不想加班...",
    "想吃点好吃的",
    "先休息一下吧~",
    "哈哈哈哈",
    "零食到了!",
    "再来5分钟~",
    "加油冲一波!",
    "正在补充能量...",
    "想回家了~",
  ],
};

type LocaleMap<T> = { ko: T; en: T } & Partial<Record<SupportedLocale, T>>;

function pickLocale<T>(locale: SupportedLocale, map: LocaleMap<T>): T {
  return map[locale] ?? map.en;
}

function inferReviewDecision(line?: string | null): MeetingReviewDecision {
  const cleaned = line?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "reviewing";
  if (
    /(보완|수정|보류|리스크|미흡|미완|추가.?필요|재검토|중단|불가|hold|revise|revision|changes?\s+requested|required|pending|risk|block|missing|incomplete|not\s+ready|保留|修正|风险|补充|未完成|暂缓|差し戻し)/i.test(
      cleaned,
    )
  ) {
    return "hold";
  }
  if (
    /(승인|통과|문제없|진행.?가능|배포.?가능|approve|approved|lgtm|ship\s+it|go\s+ahead|承認|批准|通过|可发布)/i.test(
      cleaned,
    )
  ) {
    return "approved";
  }
  return "reviewing";
}

function resolveMeetingDecision(
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision | null,
  line?: string,
): MeetingReviewDecision | undefined {
  if (phase !== "review") return undefined;
  return decision ?? inferReviewDecision(line);
}

function getMeetingBadgeStyle(
  locale: SupportedLocale,
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision,
): { fill: number; stroke: number; text: string } {
  if (phase !== "review") {
    return {
      fill: 0xf59e0b,
      stroke: 0x111111,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeKickoff),
    };
  }

  if (decision === "approved") {
    return {
      fill: 0x34d399,
      stroke: 0x14532d,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeApproved),
    };
  }
  if (decision === "hold") {
    return {
      fill: 0xf97316,
      stroke: 0x7c2d12,
      text: pickLocale(locale, LOCALE_TEXT.meetingBadgeHold),
    };
  }
  return {
    fill: 0x60a5fa,
    stroke: 0x1e3a8a,
    text: pickLocale(locale, LOCALE_TEXT.meetingBadgeReviewing),
  };
}

function paintMeetingBadge(
  badge: Graphics,
  badgeText: Text,
  locale: SupportedLocale,
  phase: "kickoff" | "review",
  decision?: MeetingReviewDecision,
): void {
  const style = getMeetingBadgeStyle(locale, phase, decision);
  badge.clear();
  badge.roundRect(-24, 4, 48, 13, 4).fill({ color: style.fill, alpha: 0.9 });
  badge.roundRect(-24, 4, 48, 13, 4).stroke({ width: 1, color: style.stroke, alpha: 0.45 });
  badgeText.text = style.text;
}

// Break spots: positive x = offset from room left; negative x = offset from room right
// These are calibrated to match furniture positions drawn in buildScene
const BREAK_SPOTS = [
  { x: 86, y: 72, dir: "D" }, // 왼쪽 소파 좌측 (sofa at baseX+50, width 80)
  { x: 110, y: 72, dir: "D" }, // 왼쪽 소파 중앙
  { x: 134, y: 72, dir: "D" }, // 왼쪽 소파 우측
  { x: 30, y: 58, dir: "R" }, // 커피머신 앞 (machine at baseX, y+20)
  { x: -112, y: 72, dir: "D" }, // 우측 소파 좌측 (sofa at rightX-120, width 80)
  { x: -82, y: 72, dir: "D" }, // 우측 소파 우측
  { x: -174, y: 56, dir: "L" }, // 하이테이블 왼쪽 (table at rightX-170, width 36)
  { x: -144, y: 56, dir: "R" }, // 하이테이블 오른쪽
];

const DEPT_THEME_LIGHT: Record<string, RoomTheme> = {
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
};
const DEPT_THEME_DARK: Record<string, RoomTheme> = {
  dev: { floor1: 0x0c1620, floor2: 0x0a121c, wall: 0x1e3050, accent: 0x285890 },
  design: { floor1: 0x120c20, floor2: 0x100a1e, wall: 0x2c1c50, accent: 0x482888 },
  planning: { floor1: 0x18140c, floor2: 0x16120a, wall: 0x3a2c1c, accent: 0x785828 },
  operations: { floor1: 0x0c1a18, floor2: 0x0a1614, wall: 0x1c4030, accent: 0x287848 },
  qa: { floor1: 0x1a0c10, floor2: 0x180a0e, wall: 0x401c1c, accent: 0x782828 },
  devsecops: { floor1: 0x18100c, floor2: 0x160e0a, wall: 0x3a241c, accent: 0x783828 },
};
let DEPT_THEME = DEPT_THEME_LIGHT;

function applyOfficeThemeMode(isDark: boolean): void {
  OFFICE_PASTEL = isDark ? OFFICE_PASTEL_DARK : OFFICE_PASTEL_LIGHT;
  DEFAULT_CEO_THEME = isDark ? DEFAULT_CEO_THEME_DARK : DEFAULT_CEO_THEME_LIGHT;
  DEFAULT_BREAK_THEME = isDark ? DEFAULT_BREAK_THEME_DARK : DEFAULT_BREAK_THEME_LIGHT;
  DEPT_THEME = isDark ? DEPT_THEME_DARK : DEPT_THEME_LIGHT;
}

export {
  OFFICE_PASTEL_LIGHT,
  OFFICE_PASTEL_DARK,
  OFFICE_PASTEL,
  DEFAULT_CEO_THEME_LIGHT,
  DEFAULT_CEO_THEME_DARK,
  DEFAULT_BREAK_THEME_LIGHT,
  DEFAULT_BREAK_THEME_DARK,
  DEFAULT_CEO_THEME,
  DEFAULT_BREAK_THEME,
  type SupportedLocale,
  LOCALE_TEXT,
  BREAK_CHAT_MESSAGES,
  pickLocale,
  inferReviewDecision,
  resolveMeetingDecision,
  getMeetingBadgeStyle,
  paintMeetingBadge,
  BREAK_SPOTS,
  DEPT_THEME_LIGHT,
  DEPT_THEME_DARK,
  DEPT_THEME,
  applyOfficeThemeMode,
};
