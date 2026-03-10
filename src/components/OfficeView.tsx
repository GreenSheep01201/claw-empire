import { useEffect, useRef, useCallback, useState } from "react";
import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Sprite,
  Texture,
  Assets,
  AnimatedSprite,
  TextureStyle,
} from "pixi.js";
import type { Department, Agent, Task, MeetingPresence, MeetingReviewDecision } from "../types";
import type { CliStatusMap } from "../types";
import { getCliStatus, getCliUsage, refreshCliUsage, type CliUsageEntry, type CliUsageWindow } from "../api";
import { useI18n, type UiLanguage } from "../i18n";
import { useTheme, type ThemeMode } from "../ThemeContext";

const assetBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

function spritePath(fileName: string): string {
  return `${assetBase}/sprites/${fileName}`;
}

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface SubAgent {
  id: string;
  parentAgentId: string;
  task: string;
  status: "working" | "done";
}

interface CrossDeptDelivery {
  id: string;
  fromAgentId: string;
  toAgentId: string;
}

interface CeoOfficeCall {
  id: string;
  fromAgentId: string;
  seatIndex: number;
  phase: "kickoff" | "review";
  action?: "arrive" | "speak" | "dismiss";
  line?: string;
  decision?: MeetingReviewDecision;
  holdUntil?: number;
}

interface OfficeViewProps {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  meetingPresence?: MeetingPresence[];
  activeMeetingTaskId?: string | null;
  unreadAgentIds?: Set<string>;
  crossDeptDeliveries?: CrossDeptDelivery[];
  onCrossDeptDeliveryProcessed?: (id: string) => void;
  ceoOfficeCalls?: CeoOfficeCall[];
  onCeoOfficeCallProcessed?: (id: string) => void;
  onOpenActiveMeetingMinutes?: (taskId: string) => void;
  customDeptThemes?: Record<string, { floor1: number; floor2: number; wall: number; accent: number }>;
  themeHighlightTargetId?: string | null;
  onSelectAgent: (agent: Agent) => void;
  onSelectDepartment: (dept: Department) => void;
}

interface Delivery {
  sprite: Container;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  arcHeight?: number;
  speed?: number;
  type?: "throw" | "walk";
  agentId?: string;
  holdAtSeat?: boolean;
  holdUntil?: number;
  arrived?: boolean;
  seatedPoseApplied?: boolean;
  meetingSeatIndex?: number;
  meetingDecision?: MeetingReviewDecision;
  badgeGraphics?: Graphics;
  badgeText?: Text;
}

interface RoomRect {
  dept: Department;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WallClockVisual {
  hourHand: Graphics;
  minuteHand: Graphics;
  secondHand: Graphics;
}

function detachNode(node: Container): void {
  if (node.destroyed) return;
  node.parent?.removeChild(node);
}

/** Remove from parent AND destroy to free GPU/texture memory. */
function destroyNode(node: Container): void {
  if (node.destroyed) return;
  node.parent?.removeChild(node);
  node.destroy({ children: true });
}

function trackProcessedId(set: Set<string>, id: string, max = 4000): void {
  set.add(id);
  if (set.size <= max) return;
  const trimCount = set.size - max;
  let removed = 0;
  for (const key of set) {
    set.delete(key);
    removed += 1;
    if (removed >= trimCount) break;
  }
}

type ScrollAxis = "x" | "y";

function isScrollableOverflowValue(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function canScrollOnAxis(el: HTMLElement, axis: ScrollAxis): boolean {
  const style = window.getComputedStyle(el);
  if (axis === "y") {
    return isScrollableOverflowValue(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
  }
  return isScrollableOverflowValue(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
}

function findScrollContainer(start: HTMLElement | null, axis: ScrollAxis): HTMLElement | null {
  let current = start?.parentElement ?? null;
  let fallback: HTMLElement | null = null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const hasScrollableStyle = axis === "y"
      ? isScrollableOverflowValue(overflowY)
      : isScrollableOverflowValue(overflowX);
    if (!fallback && hasScrollableStyle) fallback = current;
    if (canScrollOnAxis(current, axis)) return current;
    current = current.parentElement;
  }
  return fallback;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const MIN_OFFICE_W = 360;
const CEO_ZONE_H = 110;
const HALLWAY_H = 32;
const TARGET_CHAR_H = 52;
const MINI_CHAR_H = 28;
const CEO_SIZE = 44;
const DESK_W = 48;
const DESK_H = 26;
const SLOT_W = 100;
const SLOT_H = 120;
const COLS_PER_ROW = 3;
const ROOM_PAD = 16;
const TILE = 20;
const CEO_SPEED = 3.5;
const DELIVERY_SPEED = 0.012;

const BREAK_ROOM_H = 110;
const BREAK_ROOM_GAP = 32;
const MOBILE_MOVE_CODES = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
} as const;
type MobileMoveDirection = keyof typeof MOBILE_MOVE_CODES;
type RoomTheme = { floor1: number; floor2: number; wall: number; accent: number };

/* ── Light (day-work) palette ── */
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
    ko: [
      "유관부서 영향도 확인중",
      "리스크/의존성 공유중",
      "일정/우선순위 조율중",
      "담당 경계 정의중",
    ],
    en: [
      "Checking cross-team impact",
      "Sharing risks/dependencies",
      "Aligning schedule/priorities",
      "Defining ownership boundaries",
    ],
    ja: [
      "関連部署への影響を確認中",
      "リスク/依存関係を共有中",
      "日程/優先度を調整中",
      "担当境界を定義中",
    ],
    zh: [
      "正在确认跨团队影响",
      "正在共享风险/依赖关系",
      "正在协调排期/优先级",
      "正在定义职责边界",
    ],
  },
  reviewLines: {
    ko: [
      "보완사항 반영 확인중",
      "최종안 Approved 검토중",
      "수정 아이디어 공유중",
      "결과물 교차 검토중",
    ],
    en: [
      "Verifying follow-up updates",
      "Reviewing final approval draft",
      "Sharing revision ideas",
      "Cross-checking deliverables",
    ],
    ja: [
      "補完事項の反映を確認中",
      "最終承認案を確認中",
      "修正アイデアを共有中",
      "成果物を相互レビュー中",
    ],
    zh: [
      "正在确认补充项是否反映",
      "正在审阅最终审批方案",
      "正在共享修改思路",
      "正在交叉评审交付物",
    ],
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

const BREAK_CHAT_MESSAGES: Record<SupportedLocale, string[]> = {
  ko: [
    "커피 한 잔 더~", "오늘 점심 뭐 먹지?", "아 졸려...",
    "주말에 뭐 해?", "이번 프로젝트 힘들다ㅋ", "카페라떼 최고!",
    "오늘 날씨 좋다~", "야근 싫어ㅠ", "맛있는 거 먹고 싶다",
    "조금만 쉬자~", "ㅋㅋㅋㅋ", "간식 왔다!", "5분만 더~",
    "힘내자 파이팅!", "에너지 충전 중...", "집에 가고 싶다~",
  ],
  en: [
    "One more cup of coffee~", "What should we eat for lunch?", "So sleepy...",
    "Any weekend plans?", "This project is tough lol", "Cafe latte wins!",
    "Nice weather today~", "I hate overtime...", "Craving something tasty",
    "Let's take a short break~", "LOL", "Snacks are here!", "5 more minutes~",
    "Let's go, fighting!", "Recharging energy...", "I want to go home~",
  ],
  ja: [
    "コーヒーもう一杯~", "今日のランチ何にする?", "眠い...",
    "週末なにする?", "今回のプロジェクト大変w", "カフェラテ最高!",
    "今日の天気いいね~", "残業いやだ...", "おいしいもの食べたい",
    "ちょっと休もう~", "www", "おやつ来た!", "あと5分だけ~",
    "頑張ろう!", "エネルギー充電中...", "家に帰りたい~",
  ],
  zh: [
    "再来一杯咖啡~", "今天午饭吃什么?", "好困...",
    "周末准备做什么?", "这个项目有点难哈哈", "拿铁最棒!",
    "今天天气真好~", "不想加班...", "想吃点好吃的",
    "先休息一下吧~", "哈哈哈哈", "零食到了!", "再来5分钟~",
    "加油冲一波!", "正在补充能量...", "想回家了~",
  ],
};

function pickLocale<T>(locale: SupportedLocale, map: Record<SupportedLocale, T>): T {
  return map[locale] ?? map.ko;
}

function inferReviewDecision(line?: string | null): MeetingReviewDecision {
  const cleaned = line?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "reviewing";
  if (/(보완|수정|보류|리스크|미흡|미완|추가.?필요|재검토|중단|불가|hold|revise|revision|changes?\s+requested|required|pending|risk|block|missing|incomplete|not\s+ready|保留|修正|风险|补充|未完成|暂缓|差し戻し)/i.test(cleaned)) {
    return "hold";
  }
  if (/(승인|통과|문제없|진행.?가능|배포.?가능|approve|approved|lgtm|ship\s+it|go\s+ahead|承認|批准|通过|可发布)/i.test(cleaned)) {
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
  { x: 86,  y: 72, dir: 'D' },   // 왼쪽 소파 좌측 (sofa at baseX+50, width 80)
  { x: 110, y: 72, dir: 'D' },   // 왼쪽 소파 중앙
  { x: 134, y: 72, dir: 'D' },   // 왼쪽 소파 우측
  { x: 30,  y: 58, dir: 'R' },   // 커피머신 앞 (machine at baseX, y+20)
  { x: -112, y: 72, dir: 'D' },  // 우측 소파 좌측 (sofa at rightX-120, width 80)
  { x: -82,  y: 72, dir: 'D' },  // 우측 소파 우측
  { x: -174, y: 56, dir: 'L' },  // 하이테이블 왼쪽 (table at rightX-170, width 36)
  { x: -144, y: 56, dir: 'R' },  // 하이테이블 오른쪽
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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function blendColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * clamped);
  const g = Math.round(fg + (tg - fg) * clamped);
  const b = Math.round(fb + (tb - fb) * clamped);
  return (r << 16) | (g << 8) | b;
}

function isLightColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150;
}

function contrastTextColor(bgColor: number, darkColor: number = OFFICE_PASTEL.ink, lightColor: number = 0xffffff): number {
  return isLightColor(bgColor) ? darkColor : lightColor;
}

function drawBandGradient(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  from: number,
  to: number,
  bands: number = 8,
  alpha: number = 1,
): void {
  const safeBands = Math.max(2, bands);
  const bandH = h / safeBands;
  for (let i = 0; i < safeBands; i++) {
    const color = blendColor(from, to, i / (safeBands - 1));
    g.rect(x, y + i * bandH, w, bandH + 0.75).fill({ color, alpha });
  }
}

function drawBunting(
  parent: Container,
  x: number,
  y: number,
  w: number,
  colorA: number,
  colorB: number,
  alpha: number = 0.7,
): void {
  const g = new Graphics();
  g.moveTo(x, y).lineTo(x + w, y).stroke({ width: 1, color: 0x33261a, alpha: 0.6 });
  const flagCount = Math.max(6, Math.floor(w / 24));
  const step = w / flagCount;
  for (let i = 0; i < flagCount; i++) {
    const fx = x + i * step + step / 2;
    const fy = y + (i % 2 === 0 ? 1 : 2.5);
    g.moveTo(fx - 4.2, fy).lineTo(fx + 4.2, fy).lineTo(fx, fy + 6.2)
      .fill({ color: i % 2 === 0 ? colorA : colorB, alpha });
    g.moveTo(fx, fy).lineTo(fx, fy + 1.8).stroke({ width: 0.5, color: 0xffffff, alpha: 0.14 });
  }
  parent.addChild(g);
}

function drawRoomAtmosphere(
  parent: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  wallColor: number,
  accent: number,
): void {
  const g = new Graphics();
  const topPanelH = Math.max(20, Math.min(34, h * 0.22));
  drawBandGradient(
    g,
    x + 1,
    y + 1,
    w - 2,
    topPanelH,
    blendColor(wallColor, 0xffffff, 0.24),
    blendColor(wallColor, 0xffffff, 0.05),
    7,
    0.75,
  );
  g.rect(x + 1, y + topPanelH + 1, w - 2, 1.2).fill({ color: blendColor(wallColor, 0xffffff, 0.3), alpha: 0.28 });
  g.rect(x + 1, y + h - 14, w - 2, 10).fill({ color: blendColor(wallColor, 0x000000, 0.5), alpha: 0.14 });
  g.rect(x + 3, y + h - 14, w - 6, 1).fill({ color: blendColor(accent, 0xffffff, 0.45), alpha: 0.22 });
  parent.addChild(g);
}

/* ================================================================== */
/*  Drawing helpers                                                    */
/* ================================================================== */

function drawTiledFloor(
  g: Graphics, x: number, y: number, w: number, h: number,
  c1: number, c2: number,
) {
  for (let ty = 0; ty < h; ty += TILE) {
    for (let tx = 0; tx < w; tx += TILE) {
      const isEven = ((tx / TILE + ty / TILE) & 1) === 0;
      g.rect(x + tx, y + ty, TILE, TILE).fill(isEven ? c1 : c2);
      // Top-left highlight (warm light)
      g.moveTo(x + tx, y + ty).lineTo(x + tx + TILE, y + ty)
        .stroke({ width: 0.3, color: 0xffffff, alpha: 0.15 });
      g.moveTo(x + tx, y + ty).lineTo(x + tx, y + ty + TILE)
        .stroke({ width: 0.3, color: 0xffffff, alpha: 0.10 });
      // Bottom-right shadow (warm dark)
      g.moveTo(x + tx, y + ty + TILE).lineTo(x + tx + TILE, y + ty + TILE)
        .stroke({ width: 0.3, color: 0x8a7a60, alpha: 0.10 });
      g.moveTo(x + tx + TILE, y + ty).lineTo(x + tx + TILE, y + ty + TILE)
        .stroke({ width: 0.3, color: 0x8a7a60, alpha: 0.08 });
    }
  }
}

/** Draw a soft ambient glow (radial gradient approximation using concentric ellipses) */
function drawAmbientGlow(parent: Container, cx: number, cy: number, radius: number, color: number, alpha: number = 0.15) {
  const g = new Graphics();
  const steps = 6;
  for (let i = steps; i >= 1; i--) {
    const r = radius * (i / steps);
    const a = alpha * (1 - i / (steps + 1));
    g.ellipse(cx, cy, r, r * 0.6).fill({ color, alpha: a });
  }
  parent.addChild(g);
  return g;
}

/** Draw a small window on the wall with warm sunlight filter and curtains */
function drawWindow(parent: Container, x: number, y: number, w: number = 24, h: number = 18) {
  const g = new Graphics();
  // Outer frame shadow
  g.roundRect(x + 1.5, y + 1.5, w, h, 2).fill({ color: 0x000000, alpha: 0.12 });
  // Frame (warmer wood-tone)
  g.roundRect(x, y, w, h, 2).fill(0x8a7a68);
  g.roundRect(x, y, w, h, 2).stroke({ width: 0.5, color: 0xa09080, alpha: 0.4 });
  // Glass panes (warm sky gradient tones)
  const pw = (w - 5) / 2, ph = (h - 5) / 2;
  g.rect(x + 2, y + 2, pw, ph).fill(0x8abcdd);
  g.rect(x + pw + 3, y + 2, pw, ph).fill(0x9accee);
  g.rect(x + 2, y + ph + 3, pw, ph).fill(0x9accee);
  g.rect(x + pw + 3, y + ph + 3, pw, ph).fill(0x8abcdd);
  // Cloud silhouettes (more puffy)
  g.circle(x + 6, y + 5, 1.5).fill({ color: 0xffffff, alpha: 0.2 });
  g.circle(x + 8, y + 5.5, 2.2).fill({ color: 0xffffff, alpha: 0.18 });
  g.circle(x + 10, y + 5.8, 1.8).fill({ color: 0xffffff, alpha: 0.16 });
  g.circle(x + w - 7, y + h - 7, 1.5).fill({ color: 0xffffff, alpha: 0.14 });
  g.circle(x + w - 9, y + h - 6.5, 1.8).fill({ color: 0xffffff, alpha: 0.12 });
  // Warm sunlight overlay on glass
  g.rect(x + 2, y + 2, w - 4, h - 4).fill({ color: 0xffe8a0, alpha: 0.10 });
  // Grid bars (wooden mullions)
  g.rect(x + w / 2 - 0.6, y + 2, 1.2, h - 4).fill({ color: 0x7a6a58, alpha: 0.4 });
  g.rect(x + 2, y + h / 2 - 0.5, w - 4, 1).fill({ color: 0x7a6a58, alpha: 0.35 });
  // Reflection highlight (brighter, diagonal)
  g.moveTo(x + 3, y + 3).lineTo(x + 8, y + 3).lineTo(x + 3, y + 6.5).fill({ color: 0xffffff, alpha: 0.28 });
  g.rect(x + pw + 4, y + 3, 3, 2).fill({ color: 0xffffff, alpha: 0.12 });
  // Mini curtains (soft dusty rose)
  g.moveTo(x + 1, y + 1).quadraticCurveTo(x + 3, y + h * 0.4, x + 1, y + h - 2)
    .stroke({ width: 1.5, color: 0xd8b0b8, alpha: 0.35 });
  g.moveTo(x + w - 1, y + 1).quadraticCurveTo(x + w - 3, y + h * 0.4, x + w - 1, y + h - 2)
    .stroke({ width: 1.5, color: 0xd8b0b8, alpha: 0.35 });
  // Curtain top valance
  g.roundRect(x, y, w, 2, 1).fill({ color: 0xd8b0b8, alpha: 0.25 });
  // Sill (warmer wood) with tiny plant
  g.rect(x - 2, y + h, w + 4, 3).fill(0x8a7a68);
  g.rect(x - 2, y + h, w + 4, 1.2).fill({ color: 0xa09080, alpha: 0.3 });
  // Tiny windowsill plant
  g.circle(x + w / 2, y + h - 1, 2).fill(0x7cb898);
  g.circle(x + w / 2 - 1, y + h - 2, 1.5).fill(0x92c8aa);
  g.roundRect(x + w / 2 - 1.5, y + h, 3, 2, 0.5).fill(0xd88060);
  // Sunlight beam cast below window (warm ambient glow on floor)
  g.moveTo(x, y + h + 3).lineTo(x + w, y + h + 3)
    .lineTo(x + w + 8, y + h + 22).lineTo(x - 8, y + h + 22)
    .fill({ color: 0xffeebb, alpha: 0.05 });
  g.moveTo(x + 2, y + h + 5).lineTo(x + w - 2, y + h + 5)
    .lineTo(x + w + 4, y + h + 16).lineTo(x - 4, y + h + 16)
    .fill({ color: 0xffeebb, alpha: 0.03 });
  // Warm sunlight streaming through window
  g.rect(x + 1, y + h + 3, w - 2, 12).fill({ color: 0xfff4d0, alpha: 0.05 });
  parent.addChild(g);
  return g;
}

/** Draw a small wall clock with shadow and detail */
function drawWallClock(parent: Container, x: number, y: number) {
  const clock = new Container();
  clock.position.set(x, y);

  const g = new Graphics();
  // Shadow behind clock
  g.circle(1, 1, 8).fill({ color: 0x000000, alpha: 0.12 });
  // Outer ring (frame)
  g.circle(0, 0, 8).fill(0xdddddd);
  g.circle(0, 0, 8).stroke({ width: 1.8, color: 0x555555 });
  // Inner face
  g.circle(0, 0, 6.5).fill(0xfcfcf8);
  // Hour marks (thicker at 12/3/6/9)
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
    const r = 5.2;
    const isCardinal = i % 3 === 0;
    g.circle(Math.cos(angle) * r, Math.sin(angle) * r, isCardinal ? 0.6 : 0.35).fill(0x333333);
  }
  clock.addChild(g);

  const hourHand = new Graphics();
  hourHand.moveTo(0, 0).lineTo(0, -3.5).stroke({ width: 1, color: 0x222222 });
  clock.addChild(hourHand);

  const minuteHand = new Graphics();
  minuteHand.moveTo(0, 0).lineTo(0, -5.2).stroke({ width: 0.7, color: 0x444444 });
  clock.addChild(minuteHand);

  const secondHand = new Graphics();
  secondHand.moveTo(0, 1.6).lineTo(0, -5.8).stroke({ width: 0.35, color: 0xcc3333 });
  clock.addChild(secondHand);

  // Center dot
  const center = new Graphics();
  center.circle(0, 0, 1).fill(0xcc3333);
  center.circle(0, 0, 0.5).fill(0xff5555);
  clock.addChild(center);

  const visual: WallClockVisual = { hourHand, minuteHand, secondHand };
  applyWallClockTime(visual, new Date());

  parent.addChild(clock);
  return visual;
}

function applyWallClockTime(clock: WallClockVisual, now: Date): void {
  const minuteValue = now.getMinutes() + now.getSeconds() / 60;
  const hourValue = (now.getHours() % 12) + minuteValue / 60;
  const secondValue = now.getSeconds() + now.getMilliseconds() / 1000;
  clock.minuteHand.rotation = (minuteValue / 60) * Math.PI * 2;
  clock.hourHand.rotation = (hourValue / 12) * Math.PI * 2;
  clock.secondHand.rotation = (secondValue / 60) * Math.PI * 2;
}

/** Draw a small picture frame on the wall */
function drawPictureFrame(parent: Container, x: number, y: number) {
  const g = new Graphics();
  g.roundRect(x, y, 16, 12, 1).fill(0x8b6914);
  g.rect(x + 1.5, y + 1.5, 13, 9).fill(0x445577);
  // Tiny landscape
  g.rect(x + 1.5, y + 7, 13, 3.5).fill(0x448844);
  g.circle(x + 11, y + 4, 1.5).fill(0xffdd44);
  parent.addChild(g);
  return g;
}

/** Draw a small rug/carpet under desk area */
function drawRug(parent: Container, cx: number, cy: number, w: number, h: number, color: number) {
  const g = new Graphics();
  g.roundRect(cx - w / 2, cy - h / 2, w, h, 3).fill({ color, alpha: 0.3 });
  // Border pattern
  g.roundRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4, 2)
    .stroke({ width: 0.8, color, alpha: 0.2 });
  // Inner pattern
  g.roundRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10, 1)
    .stroke({ width: 0.4, color: 0xffffff, alpha: 0.06 });
  parent.addChild(g);
  return g;
}

/** Draw a ceiling light fixture */
function drawCeilingLight(parent: Container, x: number, y: number, color: number) {
  const g = new Graphics();
  // Soft outer glow
  g.ellipse(x, y + 10, 20, 6).fill({ color: 0xfff5dd, alpha: 0.04 });
  // Light cone (downward, warm metal)
  g.rect(x - 2, y, 4, 3).fill(0x908070);
  g.rect(x - 5, y + 3, 10, 2).fill(0xb8a890);
  // Bulb highlight
  g.rect(x - 1, y + 1, 2, 2).fill({ color: 0xffffff, alpha: 0.2 });
  // Warm glow
  g.ellipse(x, y + 8, 16, 5).fill({ color, alpha: 0.06 });
  g.ellipse(x, y + 7, 10, 3.5).fill({ color, alpha: 0.10 });
  g.ellipse(x, y + 6, 5, 2).fill({ color: 0xfff5dd, alpha: 0.08 });
  parent.addChild(g);
  return g;
}

/** Draw a trash can */
function drawTrashCan(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Can body (trapezoid-ish)
  g.roundRect(x - 4, y, 8, 10, 1).fill(0x777788);
  g.roundRect(x - 4.5, y - 1, 9, 2, 1).fill(0x888899);
  // Paper sticking out
  g.roundRect(x - 2, y - 3, 4, 3, 0.5).fill(0xeeeeee);
  parent.addChild(g);
  return g;
}

/** Draw a water cooler */
function drawWaterCooler(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Base
  g.roundRect(x - 5, y + 10, 10, 14, 1).fill(0xdddddd);
  // Water bottle
  g.roundRect(x - 4, y, 8, 12, 3).fill(0x88ccff);
  g.roundRect(x - 4, y, 8, 12, 3).stroke({ width: 0.5, color: 0x66aadd });
  // Water level
  g.rect(x - 3, y + 3, 6, 8).fill({ color: 0x44aaff, alpha: 0.4 });
  // Tap
  g.rect(x + 3, y + 16, 3, 2).fill(0x999999);
  parent.addChild(g);
  return g;
}

function drawDesk(parent: Container, dx: number, dy: number, working: boolean): Graphics {
  const g = new Graphics();
  // Shadow (softer, multi-layer)
  g.ellipse(dx + DESK_W / 2, dy + DESK_H + 4, DESK_W / 2 + 6, 6).fill({ color: 0x000000, alpha: 0.06 });
  g.ellipse(dx + DESK_W / 2, dy + DESK_H + 3, DESK_W / 2 + 4, 5).fill({ color: 0x000000, alpha: 0.10 });
  g.ellipse(dx + DESK_W / 2, dy + DESK_H + 2, DESK_W / 2 + 2, 3.5).fill({ color: 0x000000, alpha: 0.12 });
  // Desk legs (subtle, peeking below)
  g.roundRect(dx + 3, dy + DESK_H - 2, 3, 6, 1).fill(0xb89060);
  g.roundRect(dx + DESK_W - 6, dy + DESK_H - 2, 3, 6, 1).fill(0xb89060);
  // Desk body (warm wood grain with richer layering)
  g.roundRect(dx, dy, DESK_W, DESK_H, 3).fill(0xbe9860);
  g.roundRect(dx + 1, dy + 1, DESK_W - 2, DESK_H - 2, 2).fill(0xd4b478);
  g.roundRect(dx + 2, dy + 2, DESK_W - 4, DESK_H - 4, 1.5).fill(0xe0c490);
  // Subtle desk-top gradient (warm highlight)
  g.roundRect(dx + 2, dy + 2, DESK_W - 4, 6, 1).fill({ color: 0xf5dca0, alpha: 0.25 });
  // Wood grain lines (warm, varied width)
  for (let i = 0; i < 4; i++) {
    const w = 0.25 + (i % 2) * 0.1;
    g.moveTo(dx + 4, dy + 5 + i * 5.5)
      .lineTo(dx + DESK_W - 4, dy + 5 + i * 5.5)
      .stroke({ width: w, color: 0xc4a060, alpha: 0.2 });
  }
  // Desk edge highlight (warmer, with bottom shadow)
  g.moveTo(dx + 2, dy + 1).lineTo(dx + DESK_W - 2, dy + 1)
    .stroke({ width: 0.6, color: 0xf0d890, alpha: 0.45 });
  g.moveTo(dx + 2, dy + DESK_H - 1).lineTo(dx + DESK_W - 2, dy + DESK_H - 1)
    .stroke({ width: 0.5, color: 0xa88050, alpha: 0.2 });
  // ── Keyboard at TOP (closest to character above) ──
  g.roundRect(dx + DESK_W / 2 - 10, dy + 2, 20, 7, 1.5).fill(0x788498);
  g.roundRect(dx + DESK_W / 2 - 10, dy + 2, 20, 7, 1.5).stroke({ width: 0.3, color: 0x5c6a80, alpha: 0.5 });
  // Keyboard highlight
  g.moveTo(dx + DESK_W / 2 - 8, dy + 2.5).lineTo(dx + DESK_W / 2 + 8, dy + 2.5)
    .stroke({ width: 0.4, color: 0xffffff, alpha: 0.1 });
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 6; c++) {
      g.roundRect(dx + DESK_W / 2 - 8 + c * 2.8, dy + 3.2 + r * 2.6, 2, 1.6, 0.3).fill(0xd4d9e6);
    }
  }
  // Spacebar
  g.roundRect(dx + DESK_W / 2 - 5, dy + 3.2 + 5.2, 10, 1.4, 0.3).fill(0xd4d9e6);
  // Paper stack (left, with slight rotation feel)
  g.ellipse(dx + 7, dy + 14, 6, 2).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.06 });
  g.rect(dx + 3, dy + 3, 9, 10).fill(0xf0e8dc);
  g.rect(dx + 3.5, dy + 2.5, 8.5, 10).fill(0xf4ede3);
  g.rect(dx + 4, dy + 2, 9, 10.5).fill(0xfffbf4);
  // Text lines on paper (more detailed)
  for (let i = 0; i < 4; i++) {
    const lw = 3 + (i * 1.7 % 4);
    g.moveTo(dx + 5, dy + 4 + i * 2.2)
      .lineTo(dx + 5 + lw, dy + 4 + i * 2.2)
      .stroke({ width: 0.35, color: 0xb0a898, alpha: 0.3 + (i % 2) * 0.1 });
  }
  // Paper clip on paper
  g.moveTo(dx + 11, dy + 3).lineTo(dx + 11, dy + 7)
    .stroke({ width: 0.5, color: 0xaaaaaa, alpha: 0.5 });
  g.moveTo(dx + 11, dy + 3).quadraticCurveTo(dx + 13, dy + 3, dx + 13, dy + 5)
    .stroke({ width: 0.5, color: 0xaaaaaa, alpha: 0.5 });
  // Coffee mug (dusty rose accent, with steam)
  g.ellipse(dx + DESK_W - 8, dy + 8.5, 4.5, 1.8).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.07 });
  g.circle(dx + DESK_W - 8, dy + 7, 4.2).fill(0xf0dee5);
  g.circle(dx + DESK_W - 8, dy + 7, 4.2).stroke({ width: 0.5, color: 0xc5a0b0 });
  g.circle(dx + DESK_W - 8, dy + 7, 2.8).fill(0x8a6248);
  // Mug inner rim highlight
  g.circle(dx + DESK_W - 8, dy + 7, 2.8).stroke({ width: 0.3, color: 0xa07050, alpha: 0.4 });
  // Mug handle
  g.moveTo(dx + DESK_W - 3.8, dy + 5.5)
    .quadraticCurveTo(dx + DESK_W - 1.5, dy + 7, dx + DESK_W - 3.8, dy + 8.5)
    .stroke({ width: 0.9, color: 0xd7c0c9 });
  // Tiny steam wisps above mug
  g.moveTo(dx + DESK_W - 9, dy + 3).quadraticCurveTo(dx + DESK_W - 10, dy + 1, dx + DESK_W - 9, dy - 0.5)
    .stroke({ width: 0.4, color: 0xcccccc, alpha: 0.2 });
  g.moveTo(dx + DESK_W - 7, dy + 3).quadraticCurveTo(dx + DESK_W - 6, dy + 1, dx + DESK_W - 7, dy - 0.5)
    .stroke({ width: 0.4, color: 0xcccccc, alpha: 0.15 });
  // ── Monitor at BOTTOM (character looks down at it) ──
  const mx = dx + DESK_W / 2 - 10;
  const my = dy + DESK_H - 16;
  // Monitor shadow
  g.ellipse(mx + 10, my + 13, 11, 2.5).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.07 });
  // Monitor bezel
  g.roundRect(mx, my, 20, 13, 2).fill(0x3e4858);
  g.roundRect(mx, my, 20, 13, 2).stroke({ width: 0.6, color: 0x5a6678 });
  // Screen
  g.roundRect(mx + 1.5, my + 1, 17, 10, 1).fill(working ? 0x89c8b9 : 0x1e2836);
  if (working) {
    // Code lines on screen (colorful IDE look)
    const codeColors = [0xe1fff8, 0xf8d876, 0xa8d8ea, 0xf0b8c8];
    for (let i = 0; i < 4; i++) {
      const lineW = 3 + (i * 2.3 % 7);
      const indent = i === 2 ? 2 : 0;
      g.moveTo(mx + 3.5 + indent, my + 2.5 + i * 2.2)
        .lineTo(mx + 3.5 + indent + lineW, my + 2.5 + i * 2.2)
        .stroke({ width: 0.7, color: codeColors[i % codeColors.length], alpha: 0.6 });
    }
    // Cursor blink line
    g.rect(mx + 4, my + 2.5, 0.5, 1.5).fill({ color: 0xffffff, alpha: 0.5 });
    // Screen glow on desk
    g.ellipse(mx + 10, my + 15, 12, 3).fill({ color: 0xa3ded1, alpha: 0.06 });
  } else {
    // Screensaver: tiny stars on dark screen
    g.circle(mx + 5, my + 4, 0.5).fill({ color: 0xffffff, alpha: 0.15 });
    g.circle(mx + 13, my + 6, 0.4).fill({ color: 0xffffff, alpha: 0.12 });
    g.circle(mx + 9, my + 8, 0.3).fill({ color: 0xffffff, alpha: 0.1 });
  }
  // Monitor webcam dot
  g.circle(mx + 10, my + 0.5, 0.6).fill({ color: 0x44dd66, alpha: 0.3 });
  // Monitor stand (slimmer, modern)
  g.rect(mx + 8, my - 2.5, 4, 3).fill(0x4e5a70);
  g.roundRect(mx + 5, my - 4, 10, 2, 1).fill(0x5e6a82);
  g.roundRect(mx + 5, my - 4, 10, 1, 1).fill({ color: 0x7a88a0, alpha: 0.3 });
  // Pencil holder (right of monitor, cuter)
  g.roundRect(dx + DESK_W - 7, dy + DESK_H - 11, 5, 7, 1.5).fill(0x9ab8c8);
  g.roundRect(dx + DESK_W - 7, dy + DESK_H - 11, 5, 7, 1.5).stroke({ width: 0.3, color: 0x7a9aac, alpha: 0.4 });
  // Pencils (varied colors)
  g.rect(dx + DESK_W - 6.5, dy + DESK_H - 15, 1, 5).fill(0xffcb76);
  g.rect(dx + DESK_W - 5.5, dy + DESK_H - 14, 1, 4).fill(0xd5a5ae);
  g.rect(dx + DESK_W - 4.5, dy + DESK_H - 13.5, 1, 3.5).fill(0x8abfd0);
  // Sticky notes near monitor (stack of 2 colors)
  g.roundRect(mx + 15, my + 1, 4, 4, 0.5).fill(0xf8dea8);
  g.roundRect(mx + 15.5, my + 0.5, 3.5, 3.5, 0.5).fill(0xfce8c0);
  g.moveTo(mx + 16, my + 2.5).lineTo(mx + 18, my + 2.5).stroke({ width: 0.3, color: 0xa5804f, alpha: 0.4 });
  g.moveTo(mx + 16, my + 3.5).lineTo(mx + 17.5, my + 3.5).stroke({ width: 0.3, color: 0xa5804f, alpha: 0.3 });
  // Tiny succulent on desk corner
  g.circle(dx + 3, dy + DESK_H - 4, 2.5).fill(0x7cb898);
  g.circle(dx + 2, dy + DESK_H - 5, 1.8).fill(0x92c8aa);
  g.circle(dx + 4, dy + DESK_H - 5, 1.5).fill(0x9dd9c2);
  g.roundRect(dx + 1, dy + DESK_H - 2, 4, 2.5, 0.8).fill(0xd88060);
  parent.addChild(g);
  return g;
}

function drawChair(parent: Container, cx: number, cy: number, color: number) {
  const g = new Graphics();
  const chairBase = blendColor(color, OFFICE_PASTEL.creamWhite, 0.18);
  const chairMid = blendColor(color, OFFICE_PASTEL.creamWhite, 0.08);
  const chairShadow = blendColor(color, OFFICE_PASTEL.ink, 0.22);
  const chairDark = blendColor(color, OFFICE_PASTEL.ink, 0.35);
  // Floor shadow
  g.ellipse(cx, cy + 5, 18, 6).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.08 });
  // Wheel base (star pattern)
  g.circle(cx - 8, cy + 3, 1.5).fill({ color: 0x555555, alpha: 0.3 });
  g.circle(cx + 8, cy + 3, 1.5).fill({ color: 0x555555, alpha: 0.3 });
  g.circle(cx, cy + 4, 1.5).fill({ color: 0x555555, alpha: 0.3 });
  // Seat cushion
  g.ellipse(cx, cy, 16, 10).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.06 });
  g.ellipse(cx, cy, 15, 9).fill(chairBase);
  g.ellipse(cx, cy, 15, 9).stroke({ width: 1, color: chairShadow, alpha: 0.25 });
  // Seat highlight (subtle dome)
  g.ellipse(cx - 1, cy - 1.5, 11, 5.5).fill({ color: 0xffffff, alpha: 0.12 });
  g.ellipse(cx, cy + 3, 10, 3).fill({ color: chairShadow, alpha: 0.08 });
  // Cushion stitch line
  g.ellipse(cx, cy, 10, 6).stroke({ width: 0.3, color: chairShadow, alpha: 0.12 });
  // Armrests (rounded, softer)
  g.roundRect(cx - 17, cy - 5, 5, 13, 2.5).fill(chairMid);
  g.roundRect(cx - 17, cy - 5, 5, 13, 2.5).stroke({ width: 0.5, color: chairShadow, alpha: 0.2 });
  g.roundRect(cx + 12, cy - 5, 5, 13, 2.5).fill(chairMid);
  g.roundRect(cx + 12, cy - 5, 5, 13, 2.5).stroke({ width: 0.5, color: chairShadow, alpha: 0.2 });
  // Armrest top highlight
  g.roundRect(cx - 16, cy - 4.5, 3, 1, 0.5).fill({ color: 0xffffff, alpha: 0.12 });
  g.roundRect(cx + 13, cy - 4.5, 3, 1, 0.5).fill({ color: 0xffffff, alpha: 0.12 });
  // Backrest (ergonomic curve)
  g.roundRect(cx - 14, cy - 13, 28, 7, 4).fill(chairShadow);
  g.roundRect(cx - 14, cy - 13, 28, 7, 4).stroke({ width: 0.8, color: chairDark, alpha: 0.25 });
  // Backrest top highlight
  g.roundRect(cx - 12, cy - 12, 24, 2.5, 2).fill({ color: blendColor(chairBase, 0xffffff, 0.4), alpha: 0.4 });
  // Backrest lumbar support detail
  g.roundRect(cx - 10, cy - 9, 20, 2, 1).fill({ color: chairBase, alpha: 0.3 });
  // Seat cushion center detail
  g.ellipse(cx, cy - 0.5, 9, 3.2).fill({ color: blendColor(chairBase, OFFICE_PASTEL.softMint, 0.22), alpha: 0.5 });
  parent.addChild(g);
}

function drawPlant(parent: Container, x: number, y: number, variant: number = 0) {
  const g = new Graphics();
  // Pot shadow (softer, larger)
  g.ellipse(x, y + 8, 8, 3).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.10 });
  g.ellipse(x, y + 7, 7, 2.5).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.07 });
  // Pot body (warm terra cotta with richer shading)
  g.roundRect(x - 5, y, 10, 7, 2).fill(0xd07858);
  g.roundRect(x - 4.5, y + 0.5, 9, 6, 1.5).fill(0xd88060);
  g.roundRect(x - 4, y + 1, 8, 5, 1.5).fill(0xe89070);
  // Pot highlight stripe
  g.roundRect(x - 3, y + 2, 6, 1, 0.5).fill({ color: 0xffffff, alpha: 0.08 });
  // Pot rim (thicker, with detail)
  g.roundRect(x - 6, y - 1.5, 12, 3.5, 1.8).fill(0xe08060);
  g.roundRect(x - 5.5, y - 1, 11, 2, 1.2).fill(0xf0a080);
  g.roundRect(x - 5, y - 1, 10, 1.2, 1).fill({ color: 0xffffff, alpha: 0.12 });
  // Pot decorative band
  g.roundRect(x - 4, y + 4, 8, 1, 0.5).fill({ color: 0xc06848, alpha: 0.3 });
  // Soil (richer)
  g.ellipse(x, y, 4.5, 1.8).fill(0x5e4530);
  g.ellipse(x - 1, y + 0.2, 2.5, 1).fill({ color: 0x7a5840, alpha: 0.5 });
  // Tiny soil pebble
  g.circle(x + 2.5, y - 0.3, 0.7).fill({ color: 0x8a6a50, alpha: 0.4 });
  if (variant % 4 === 0) {
    // Bushy monstera-style plant (soft mint)
    g.rect(x - 0.4, y - 2, 0.8, 3).fill(0x6aaa88);
    g.circle(x, y - 4, 6.5).fill(0x78bfa4);
    g.circle(x - 3, y - 6, 4.5).fill(0x89cfb5);
    g.circle(x + 3, y - 6.5, 4).fill(0x89cfb5);
    g.circle(x, y - 8.5, 4).fill(0x9dd9c2);
    g.circle(x - 2, y - 10, 2.8).fill(0xb7e7d5);
    g.circle(x + 2.5, y - 9.5, 2.2).fill(0xb7e7d5);
    // Leaf veins
    g.moveTo(x, y - 4).lineTo(x, y - 8).stroke({ width: 0.3, color: 0x5e9f7f, alpha: 0.3 });
    g.moveTo(x - 2, y - 6).lineTo(x - 4, y - 8).stroke({ width: 0.2, color: 0x5e9f7f, alpha: 0.2 });
    g.moveTo(x + 2, y - 6).lineTo(x + 4, y - 8).stroke({ width: 0.2, color: 0x5e9f7f, alpha: 0.2 });
    // Highlight leaves
    g.circle(x + 2, y - 7, 1.8).fill({ color: 0xffffff, alpha: 0.18 });
    g.circle(x - 2, y - 9.5, 1.2).fill({ color: 0xffffff, alpha: 0.12 });
  } else if (variant % 4 === 1) {
    // Tall cactus (mint-sage, more detailed)
    g.roundRect(x - 2.5, y - 12, 5, 12, 2.5).fill(0x6eaa88);
    g.roundRect(x - 2, y - 10, 4, 10, 2).fill(0x82bc9a);
    g.roundRect(x - 1.5, y - 9, 3, 8, 1.5).fill(0x92c8aa);
    // Cactus ribs
    g.moveTo(x - 1, y - 11).lineTo(x - 1, y - 1).stroke({ width: 0.25, color: 0x5a9a78, alpha: 0.3 });
    g.moveTo(x + 1, y - 11).lineTo(x + 1, y - 1).stroke({ width: 0.25, color: 0x5a9a78, alpha: 0.3 });
    // Arms (more rounded)
    g.roundRect(x - 7, y - 7, 5, 2.5, 1.2).fill(0x72b090);
    g.roundRect(x - 7, y - 10, 2.5, 5, 1.2).fill(0x82bc9a);
    g.roundRect(x + 2, y - 5, 5, 2.5, 1.2).fill(0x72b090);
    g.roundRect(x + 4.5, y - 8, 2.5, 5, 1.2).fill(0x82bc9a);
    // Spines (tiny dots)
    for (let i = 0; i < 5; i++) {
      g.circle(x + (i % 2 === 0 ? 2.5 : -2.5), y - 2 - i * 2, 0.3).fill({ color: 0xd8d0c0, alpha: 0.4 });
    }
    // Flower on top
    g.circle(x, y - 13, 2).fill(0xe3a8b2);
    g.circle(x - 1.2, y - 13.5, 1.5).fill(0xedb8c2);
    g.circle(x + 1.2, y - 13.5, 1.5).fill(0xedb8c2);
    g.circle(x, y - 13, 1).fill(0xf6d57a);
  } else if (variant % 4 === 2) {
    // Flower pot (mint stem + dusty blossoms, more flowers)
    g.rect(x - 0.5, y - 9, 1, 9).fill(0x6aaa88);
    g.rect(x - 2.5, y - 6, 0.8, 5).fill(0x7ab898);
    g.rect(x + 2, y - 5, 0.8, 4).fill(0x7ab898);
    // Leaves
    g.circle(x, y - 3.5, 5).fill(0x6eaa88);
    g.circle(x - 3.5, y - 5.5, 3.5).fill(0x82bc9a);
    g.circle(x + 3.5, y - 5.5, 3).fill(0x82bc9a);
    g.circle(x, y - 7, 3).fill(0x92c8aa);
    // Flowers (multiple, varied)
    g.circle(x, y - 10, 3).fill(0xe09aaa);
    g.circle(x - 1, y - 10.5, 1.8).fill(0xeaacb8);
    g.circle(x + 1, y - 10.5, 1.8).fill(0xeaacb8);
    g.circle(x, y - 10, 1.5).fill(0xf6d685);
    g.circle(x - 4, y - 8, 2.5).fill(0x9fbede);
    g.circle(x - 4, y - 8, 1.2).fill(0xf8efba);
    g.circle(x + 3.5, y - 8.5, 2).fill(0xf2b28a);
    g.circle(x + 3.5, y - 8.5, 1).fill(0xf7df97);
    // Tiny bud
    g.circle(x + 1.5, y - 12, 1.2).fill(0xe8a0b0);
  } else {
    // Snake plant / sansevieria (tall pointed leaves)
    const leafColors = [0x5e9a78, 0x6eaa88, 0x7cb898, 0x5a9070];
    for (let i = 0; i < 4; i++) {
      const lx = x + (i - 1.5) * 2.5;
      const lh = 10 + (i % 2) * 3;
      g.moveTo(lx, y).lineTo(lx - 1.5, y - lh * 0.6).lineTo(lx, y - lh).lineTo(lx + 1.5, y - lh * 0.6).lineTo(lx, y)
        .fill(leafColors[i]);
      // Leaf highlight stripe
      g.moveTo(lx, y).lineTo(lx, y - lh + 1).stroke({ width: 0.3, color: 0xb8e0c8, alpha: 0.25 });
    }
    // Yellow leaf edge detail
    g.moveTo(x - 2, y - 8).lineTo(x - 3, y - 5).stroke({ width: 0.3, color: 0xc8d8a8, alpha: 0.25 });
  }
  parent.addChild(g);
}

function drawWhiteboard(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Shadow behind board (deeper, offset)
  g.roundRect(x + 2, y + 2, 38, 22, 2).fill({ color: 0x000000, alpha: 0.15 });
  g.roundRect(x + 1, y + 1, 38, 22, 2).fill({ color: 0x000000, alpha: 0.08 });
  // Frame (warmer silver)
  g.roundRect(x, y, 38, 22, 2).fill(0xcccccc);
  g.roundRect(x, y, 38, 22, 2).stroke({ width: 0.5, color: 0xaaaaaa });
  // Frame highlight (top edge)
  g.moveTo(x + 2, y + 0.5).lineTo(x + 36, y + 0.5)
    .stroke({ width: 0.5, color: 0xffffff, alpha: 0.15 });
  // White surface
  g.roundRect(x + 2, y + 2, 34, 18, 1).fill(0xfaf8f2);
  // Content: colored lines + shapes
  const cc = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b];
  for (let i = 0; i < 3; i++) {
    g.moveTo(x + 5, y + 5 + i * 5)
      .lineTo(x + 5 + 8 + Math.random() * 16, y + 5 + i * 5)
      .stroke({ width: 1, color: cc[i], alpha: 0.6 });
  }
  // Small sticky notes
  g.rect(x + 26, y + 4, 6, 5).fill({ color: 0xffee88, alpha: 0.8 });
  g.rect(x + 26, y + 11, 6, 5).fill({ color: 0x88eeff, alpha: 0.8 });
  // Marker tray
  g.roundRect(x + 8, y + 21, 22, 3, 1).fill(0x999999);
  // Markers
  g.roundRect(x + 10, y + 20, 2, 3, 0.5).fill(0x3366ff);
  g.roundRect(x + 13, y + 20, 2, 3, 0.5).fill(0xff3333);
  g.roundRect(x + 16, y + 20, 2, 3, 0.5).fill(0x33aa33);
  parent.addChild(g);
}

function drawBookshelf(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Shadow (deeper, offset)
  g.roundRect(x + 2, y + 2, 28, 18, 2).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(x + 1, y + 1, 28, 18, 2).fill({ color: 0x000000, alpha: 0.08 });
  // Shelf frame (warmer wood)
  g.roundRect(x, y, 28, 18, 2).fill(0xb89050);
  g.roundRect(x, y, 28, 18, 2).stroke({ width: 0.5, color: 0xa07838 });
  g.rect(x + 1, y + 1, 26, 16).fill(0xa88040);
  // Frame top highlight
  g.moveTo(x + 2, y + 0.5).lineTo(x + 26, y + 0.5)
    .stroke({ width: 0.4, color: 0xd8b060, alpha: 0.4 });
  // Middle shelf
  g.rect(x + 1, y + 8.5, 26, 1.5).fill(0xc09848);
  // Books (warmer pastel tones for charm)
  const colors = [0xdd5555, 0x5588dd, 0x55bb66, 0xddbb44, 0xaa66cc, 0xe88855];
  const widths = [3.5, 4, 3, 4.5, 3.5, 4];
  let bx = x + 2;
  for (let i = 0; i < 5 && bx < x + 25; i++) {
    const w = widths[i % widths.length];
    const h = 5 + (i % 3);
    g.rect(bx, y + 8 - h, w, h).fill(colors[i]);
    // Book spine line
    g.moveTo(bx + w / 2, y + 8 - h + 1).lineTo(bx + w / 2, y + 7)
      .stroke({ width: 0.3, color: 0xffffff, alpha: 0.15 });
    bx += w + 0.8;
  }
  bx = x + 2;
  for (let i = 0; i < 4 && bx < x + 25; i++) {
    const w = widths[(i + 2) % widths.length];
    const h = 4.5 + (i % 2);
    g.rect(bx, y + 17 - h, w, h).fill(colors[(i + 3) % colors.length]);
    bx += w + 1;
  }
  // Tiny trophy/figure on shelf
  g.rect(x + 23, y + 2, 2, 4).fill(0xddaa33);
  g.circle(x + 24, y + 1, 1.5).fill(0xffcc44);
  parent.addChild(g);
}

function drawCoffeeMachine(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Shadow
  g.ellipse(x + 10, y + 30, 13, 3.5).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.10 });
  // Body (warmer, more premium feel)
  g.roundRect(x, y, 20, 28, 3).fill(0x7e8898);
  g.roundRect(x + 0.5, y + 0.5, 19, 27, 2.5).fill(0x939daf);
  g.roundRect(x + 1, y + 1, 18, 26, 2).fill(0xa1abc1);
  // Chrome top panel
  g.roundRect(x + 2, y + 2, 16, 5, 1.5).fill(0xc4cdd9);
  g.roundRect(x + 2, y + 2, 16, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  // Brand logo (tiny coffee icon)
  g.circle(x + 10, y + 4.5, 1.5).fill(0x8d654c);
  g.circle(x + 10, y + 4.5, 0.8).fill(0xb89070);
  // Buttons (with glow rings)
  g.circle(x + 6, y + 9, 2.5).fill(0xc07080);
  g.circle(x + 6, y + 9, 1.8).fill(0xe28e9f);
  g.circle(x + 6, y + 9, 0.8).fill(0xf3b8c3);
  g.circle(x + 14, y + 9, 2.5).fill(0x70a088);
  g.circle(x + 14, y + 9, 1.8).fill(0x8ebda7);
  g.circle(x + 14, y + 9, 0.8).fill(0xb5dbc7);
  // Display (LED screen with text)
  g.roundRect(x + 3, y + 12, 14, 4, 0.8).fill(0x1e2e40);
  g.roundRect(x + 3, y + 12, 14, 4, 0.8).stroke({ width: 0.3, color: 0x4a5a6a, alpha: 0.5 });
  g.moveTo(x + 4.5, y + 14).lineTo(x + 12, y + 14)
    .stroke({ width: 0.5, color: 0xb8f0de, alpha: 0.6 });
  g.circle(x + 15, y + 14, 0.5).fill({ color: 0x44dd66, alpha: 0.5 });
  // Nozzle / drip area
  g.rect(x + 6, y + 17, 8, 2).fill(0x4b556a);
  g.roundRect(x + 7.5, y + 19, 5, 4, 0.5).fill(0x3a4558);
  // Drip tray
  g.roundRect(x + 4, y + 23, 12, 1.5, 0.5).fill(0x5a6478);
  // Cup with latte art
  g.roundRect(x + 5.5, y + 21, 9, 7, 2).fill(0xfdf8f4);
  g.roundRect(x + 5.5, y + 21, 9, 7, 2).stroke({ width: 0.4, color: 0xd9cfc6 });
  g.ellipse(x + 10, y + 23, 3.5, 1.5).fill(0x8d654c);
  // Latte art heart
  g.circle(x + 9.3, y + 22.8, 0.8).fill(0xf0e0d0);
  g.circle(x + 10.7, y + 22.8, 0.8).fill(0xf0e0d0);
  g.moveTo(x + 8.5, y + 23).lineTo(x + 10, y + 24.2).lineTo(x + 11.5, y + 23)
    .fill({ color: 0xf0e0d0, alpha: 0.8 });
  // Handle
  g.moveTo(x + 14.5, y + 22).quadraticCurveTo(x + 16.5, y + 24.5, x + 14.5, y + 27)
    .stroke({ width: 1, color: 0xf2e9e2 });
  parent.addChild(g);
}

function drawSofa(parent: Container, x: number, y: number, color: number) {
  const g = new Graphics();
  const seatBase = blendColor(color, OFFICE_PASTEL.creamWhite, 0.18);
  const seatFront = blendColor(seatBase, OFFICE_PASTEL.ink, 0.08);
  const seatBack = blendColor(seatBase, OFFICE_PASTEL.ink, 0.18);
  const seatDark = blendColor(seatBase, OFFICE_PASTEL.ink, 0.28);
  // Floor shadow
  g.ellipse(x + 40, y + 20, 44, 5).fill({ color: 0x000000, alpha: 0.06 });
  // Sofa feet (tiny wooden)
  g.roundRect(x + 2, y + 16, 4, 3, 1).fill(0xb89060);
  g.roundRect(x + 74, y + 16, 4, 3, 1).fill(0xb89060);
  // Seat cushion
  g.roundRect(x, y, 80, 18, 5).fill(seatBase);
  g.roundRect(x + 2, y + 2, 76, 14, 4).fill(seatFront);
  // Seat highlight (top edge)
  g.moveTo(x + 6, y + 1.5).lineTo(x + 74, y + 1.5).stroke({ width: 0.6, color: 0xffffff, alpha: 0.14 });
  // Backrest (taller, with detail)
  g.roundRect(x + 3, y - 10, 74, 12, 4).fill(seatBack);
  g.roundRect(x + 3, y - 10, 74, 12, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.15 });
  // Backrest highlight
  g.roundRect(x + 6, y - 9, 68, 3, 2).fill({ color: 0xffffff, alpha: 0.08 });
  // Armrests (rounder, softer)
  g.roundRect(x - 5, y - 8, 9, 24, 4).fill(seatBack);
  g.roundRect(x - 5, y - 8, 9, 24, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.12 });
  g.roundRect(x + 76, y - 8, 9, 24, 4).fill(seatBack);
  g.roundRect(x + 76, y - 8, 9, 24, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.12 });
  // Armrest top highlights
  g.roundRect(x - 3, y - 7, 5, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(x + 78, y - 7, 5, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  // Cushion divider lines (softer)
  g.moveTo(x + 27, y + 3).lineTo(x + 27, y + 14).stroke({ width: 0.6, color: 0x000000, alpha: 0.1 });
  g.moveTo(x + 53, y + 3).lineTo(x + 53, y + 14).stroke({ width: 0.6, color: 0x000000, alpha: 0.1 });
  // Cushion puff highlights
  g.ellipse(x + 14, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  g.ellipse(x + 40, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  g.ellipse(x + 66, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  // Decorative throw pillow (cute accent)
  g.roundRect(x + 6, y - 3, 10, 8, 3).fill(blendColor(color, 0xffffff, 0.3));
  g.roundRect(x + 6, y - 3, 10, 8, 3).stroke({ width: 0.4, color: seatDark, alpha: 0.15 });
  // Pillow pattern (tiny star)
  g.star(x + 11, y + 1, 5, 1.5, 0.8, 0).fill({ color: 0xffffff, alpha: 0.15 });
  parent.addChild(g);
}

function drawCoffeeTable(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // table top (elliptical)
  g.ellipse(x + 18, y + 5, 18, 8).fill(0xb89060);
  g.ellipse(x + 18, y + 5, 16, 6).fill(0xd0a878);
  // legs
  g.rect(x + 6, y + 10, 3, 8).fill(0xa07840);
  g.rect(x + 27, y + 10, 3, 8).fill(0xa07840);
  // coffee cup
  g.roundRect(x + 12, y + 1, 5, 4, 1).fill(0xfffaf6);
  g.rect(x + 13, y + 2, 3, 2).fill(0x8d654c);
  // snack plate
  g.ellipse(x + 24, y + 4, 4, 2.5).fill(0xf4ede6);
  g.circle(x + 23, y + 3.5, 1.5).fill(0xedc27a);
  g.circle(x + 25.5, y + 4, 1.5).fill(0xdba282);
  parent.addChild(g);
}

function drawHighTable(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // table top
  g.roundRect(x, y, 36, 14, 2).fill(0xb89060);
  g.roundRect(x + 1, y + 1, 34, 12, 1).fill(0xd0a878);
  // legs
  g.rect(x + 4, y + 14, 3, 16).fill(0xa07840);
  g.rect(x + 29, y + 14, 3, 16).fill(0xa07840);
  // crossbar
  g.rect(x + 6, y + 24, 24, 2).fill(0xa07840);
  parent.addChild(g);
}

function drawVendingMachine(parent: Container, x: number, y: number) {
  const g = new Graphics();
  g.roundRect(x, y, 22, 30, 2).fill(0x7e8da6);
  g.roundRect(x + 1, y + 1, 20, 28, 1).fill(0x98a7c0);
  // display rows of drinks
  const drinkColors = [0xea9ba8, 0x8fb9d8, 0x9fceac, 0xf3c07e, 0xdfafc9, 0xb29ed7];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      g.roundRect(x + 3 + c * 6, y + 3 + r * 7, 4, 5, 1).fill(drinkColors[(r * 3 + c) % drinkColors.length]);
    }
  }
  // dispense slot
  g.roundRect(x + 4, y + 24, 14, 4, 1).fill(0x4f5a72);
  parent.addChild(g);
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function formatReset(iso: string, locale: SupportedLocale): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return pickLocale(locale, LOCALE_TEXT.soon);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) {
    if (locale === "ko") return `${h}시간 ${m}분`;
    if (locale === "ja") return `${h}時間 ${m}分`;
    if (locale === "zh") return `${h}小时 ${m}分`;
    return `${h}h ${m}m`;
  }
  if (locale === "ko") return `${m}분`;
  if (locale === "ja") return `${m}分`;
  if (locale === "zh") return `${m}分`;
  return `${m}m`;
}

function formatPeopleCount(count: number, locale: SupportedLocale): string {
  if (locale === "ko") return `${count}명`;
  if (locale === "ja") return `${count}人`;
  if (locale === "zh") return `${count}人`;
  return `${count}`;
}

function formatTaskCount(count: number, locale: SupportedLocale): string {
  if (locale === "ko") return `${count}건`;
  if (locale === "ja") return `${count}件`;
  if (locale === "zh") return `${count}项`;
  return `${count}`;
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function OfficeView({
  departments, agents, tasks, subAgents,
  meetingPresence,
  activeMeetingTaskId,
  unreadAgentIds,
  crossDeptDeliveries,
  onCrossDeptDeliveryProcessed,
  ceoOfficeCalls,
  onCeoOfficeCallProcessed,
  onOpenActiveMeetingMinutes,
  customDeptThemes,
  themeHighlightTargetId,
  onSelectAgent, onSelectDepartment,
}: OfficeViewProps) {
  const { language, t } = useI18n();
  const { theme: currentTheme } = useTheme();
  const themeRef = useRef<ThemeMode>(currentTheme);
  themeRef.current = currentTheme;
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const texturesRef = useRef<Record<string, Texture>>({});
  const destroyedRef = useRef(false);
  const initIdRef = useRef(0);
  const initDoneRef = useRef(false);
  const [sceneRevision, setSceneRevision] = useState(0);

  // Animation state refs
  const tickRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const ceoPosRef = useRef({ x: 180, y: 60 });
  const ceoSpriteRef = useRef<Container | null>(null);
  const crownRef = useRef<Text | null>(null);
  const highlightRef = useRef<Graphics | null>(null);
  const animItemsRef = useRef<Array<{
    sprite: Container; status: string;
    baseX: number; baseY: number; particles: Container;
    agentId?: string; cliProvider?: string;
    deskG?: Graphics; bedG?: Graphics; blanketG?: Graphics;
  }>>([]);
  const cliUsageRef = useRef<Record<string, CliUsageEntry> | null>(null);
  const roomRectsRef = useRef<RoomRect[]>([]);
  const deliveriesRef = useRef<Delivery[]>([]);
  const deliveryLayerRef = useRef<Container | null>(null);
  const prevAssignRef = useRef<Set<string>>(new Set());
  const agentPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const processedCrossDeptRef = useRef<Set<string>>(new Set());
  const processedCeoOfficeRef = useRef<Set<string>>(new Set());
  const spriteMapRef = useRef<Map<string, number>>(new Map());
  const ceoMeetingSeatsRef = useRef<Array<{ x: number; y: number }>>([]);
  const totalHRef = useRef(600);
  const officeWRef = useRef(MIN_OFFICE_W);
  const ceoOfficeRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const breakRoomRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const breakAnimItemsRef = useRef<Array<{
    sprite: Container; baseX: number; baseY: number;
  }>>([]);
  const breakSteamParticlesRef = useRef<Container | null>(null);
  const breakBubblesRef = useRef<Container[]>([]);
  const wallClocksRef = useRef<WallClockVisual[]>([]);
  const wallClockSecondRef = useRef(-1);
  const localeRef = useRef<SupportedLocale>(language);
  localeRef.current = language;
  const themeHighlightTargetIdRef = useRef<string | null>(themeHighlightTargetId ?? null);
  themeHighlightTargetIdRef.current = themeHighlightTargetId ?? null;

  // Latest data via refs (avoids stale closures)
  const dataRef = useRef({ departments, agents, tasks, subAgents, unreadAgentIds, meetingPresence, customDeptThemes });
  dataRef.current = { departments, agents, tasks, subAgents, unreadAgentIds, meetingPresence, customDeptThemes };
  const cbRef = useRef({ onSelectAgent, onSelectDepartment });
  cbRef.current = { onSelectAgent, onSelectDepartment };
  const activeMeetingTaskIdRef = useRef<string | null>(activeMeetingTaskId ?? null);
  activeMeetingTaskIdRef.current = activeMeetingTaskId ?? null;
  const meetingMinutesOpenRef = useRef<typeof onOpenActiveMeetingMinutes>(onOpenActiveMeetingMinutes);
  meetingMinutesOpenRef.current = onOpenActiveMeetingMinutes;
  const [showVirtualPad, setShowVirtualPad] = useState(false);
  const showVirtualPadRef = useRef(showVirtualPad);
  showVirtualPadRef.current = showVirtualPad;
  const scrollHostXRef = useRef<HTMLElement | null>(null);
  const scrollHostYRef = useRef<HTMLElement | null>(null);

  const triggerDepartmentInteract = useCallback(() => {
    const cx = ceoPosRef.current.x;
    const cy = ceoPosRef.current.y;
    for (const r of roomRectsRef.current) {
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y - 10 && cy <= r.y + r.h) {
        cbRef.current.onSelectDepartment(r.dept);
        break;
      }
    }
  }, []);

  const setMoveDirectionPressed = useCallback((direction: MobileMoveDirection, pressed: boolean) => {
    for (const code of MOBILE_MOVE_CODES[direction]) {
      keysRef.current[code] = pressed;
    }
  }, []);

  const clearVirtualMovement = useCallback(() => {
    (Object.keys(MOBILE_MOVE_CODES) as MobileMoveDirection[]).forEach((direction) => {
      setMoveDirectionPressed(direction, false);
    });
  }, [setMoveDirectionPressed]);

  const followCeoInView = useCallback(() => {
    if (!showVirtualPadRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const scaleX = officeWRef.current > 0 ? container.clientWidth / officeWRef.current : 1;
    const scaleY = totalHRef.current > 0 ? container.clientHeight / totalHRef.current : scaleX;

    let hostX = scrollHostXRef.current;
    if (!hostX || !canScrollOnAxis(hostX, "x")) {
      hostX = findScrollContainer(container, "x") ?? (document.scrollingElement as HTMLElement | null);
      scrollHostXRef.current = hostX;
    }

    let hostY = scrollHostYRef.current;
    if (!hostY || !canScrollOnAxis(hostY, "y")) {
      hostY = findScrollContainer(container, "y") ?? (document.scrollingElement as HTMLElement | null);
      scrollHostYRef.current = hostY;
    }

    let nextLeft: number | null = null;
    let movedX = false;
    if (hostX) {
      const hostRectX = hostX.getBoundingClientRect();
      const ceoInHostX = containerRect.left - hostRectX.left + ceoPosRef.current.x * scaleX;
      const ceoContentX = hostX.scrollLeft + ceoInHostX;
      const targetLeft = ceoContentX - hostX.clientWidth * 0.45;
      const maxLeft = Math.max(0, hostX.scrollWidth - hostX.clientWidth);
      nextLeft = Math.max(0, Math.min(maxLeft, targetLeft));
      movedX = Math.abs(hostX.scrollLeft - nextLeft) > 1;
    }

    let nextTop: number | null = null;
    let movedY = false;
    if (hostY) {
      const hostRectY = hostY.getBoundingClientRect();
      const ceoInHostY = containerRect.top - hostRectY.top + ceoPosRef.current.y * scaleY;
      const ceoContentY = hostY.scrollTop + ceoInHostY;
      const targetTop = ceoContentY - hostY.clientHeight * 0.45;
      const maxTop = Math.max(0, hostY.scrollHeight - hostY.clientHeight);
      nextTop = Math.max(0, Math.min(maxTop, targetTop));
      movedY = Math.abs(hostY.scrollTop - nextTop) > 1;
    }

    if (hostX && hostY && hostX === hostY) {
      if (movedX || movedY) {
        hostX.scrollTo({
          left: movedX && nextLeft !== null ? nextLeft : hostX.scrollLeft,
          top: movedY && nextTop !== null ? nextTop : hostX.scrollTop,
          behavior: "auto",
        });
      }
      return;
    }

    if (hostX && movedX && nextLeft !== null) {
      hostX.scrollTo({ left: nextLeft, top: hostX.scrollTop, behavior: "auto" });
    }
    if (hostY && movedY && nextTop !== null) {
      hostY.scrollTo({ left: hostY.scrollLeft, top: nextTop, behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    const updateVirtualPadVisibility = () => {
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const isNarrowViewport = window.innerWidth <= 1024;
      setShowVirtualPad(isCoarsePointer || isNarrowViewport);
    };
    updateVirtualPadVisibility();
    window.addEventListener("resize", updateVirtualPadVisibility);
    return () => window.removeEventListener("resize", updateVirtualPadVisibility);
  }, []);

  useEffect(() => {
    if (!showVirtualPad) clearVirtualMovement();
  }, [showVirtualPad, clearVirtualMovement]);

  useEffect(() => () => {
    clearVirtualMovement();
  }, [clearVirtualMovement]);

  /* ── BUILD SCENE (no app destroy, just stage clear + rebuild) ── */
  const buildScene = useCallback(() => {
    const app = appRef.current;
    const textures = texturesRef.current;
    if (!app) return;

    const preservedDeliverySprites = new Set<Container>();
    for (const delivery of deliveriesRef.current) {
      if (delivery.sprite.destroyed) continue;
      preservedDeliverySprites.add(delivery.sprite);
      detachNode(delivery.sprite);
    }

    const oldChildren = app.stage.removeChildren();
    for (const child of oldChildren) {
      if (preservedDeliverySprites.has(child)) continue;
      if (!child.destroyed) child.destroy({ children: true });
    }
    animItemsRef.current = [];
    roomRectsRef.current = [];
    agentPosRef.current.clear();
    breakAnimItemsRef.current = [];
    breakBubblesRef.current = [];
    breakSteamParticlesRef.current = null;
    wallClocksRef.current = [];
    wallClockSecondRef.current = -1;
    ceoOfficeRectRef.current = null;
    breakRoomRectRef.current = null;
    ceoMeetingSeatsRef.current = [];

    const { departments, agents, tasks, subAgents, unreadAgentIds: unread, customDeptThemes: customThemes } = dataRef.current;
    const activeLocale = localeRef.current;
    const isDark = themeRef.current === "dark";
    OFFICE_PASTEL = isDark ? OFFICE_PASTEL_DARK : OFFICE_PASTEL_LIGHT;
    DEFAULT_CEO_THEME = isDark ? DEFAULT_CEO_THEME_DARK : DEFAULT_CEO_THEME_LIGHT;
    DEFAULT_BREAK_THEME = isDark ? DEFAULT_BREAK_THEME_DARK : DEFAULT_BREAK_THEME_LIGHT;
    DEPT_THEME = isDark ? DEPT_THEME_DARK : DEPT_THEME_LIGHT;
    const ceoTheme = customThemes?.ceoOffice ?? DEFAULT_CEO_THEME;
    const breakTheme = customThemes?.breakRoom ?? DEFAULT_BREAK_THEME;

    // Assign unique sprite numbers to each agent (1-12, no duplicates)
    const spriteMap = new Map<string, number>();
    const allAgents = [...agents].sort((a, b) => a.id.localeCompare(b.id)); // stable order
    allAgents.forEach((a, i) => spriteMap.set(a.id, (i % 12) + 1));
    spriteMapRef.current = spriteMap;

    // Measure container width for responsive layout
    const OFFICE_W = officeWRef.current;

    // Layout: fit as many columns as possible (3 for 6 depts)
    const deptCount = departments.length || 1;
    const baseRoomW = COLS_PER_ROW * SLOT_W + ROOM_PAD * 2;
    const roomGap = 12;
    // Try 3 cols, fall back to 2, then 1
    let gridCols = Math.min(deptCount, 3);
    while (gridCols > 1 && (gridCols * baseRoomW + (gridCols - 1) * roomGap + 24) > OFFICE_W) {
      gridCols--;
    }
    const gridRows = Math.ceil(deptCount / gridCols);
    const agentsPerDept = departments.map(d => agents.filter(a => a.department_id === d.id));
    const maxAgents = Math.max(1, ...agentsPerDept.map(a => a.length));
    const agentRows = Math.ceil(maxAgents / COLS_PER_ROW);
    // Scale rooms to fill available width
    const totalRoomSpace = OFFICE_W - 24 - (gridCols - 1) * roomGap;
    const roomW = Math.max(baseRoomW, Math.floor(totalRoomSpace / gridCols));
    const roomH = Math.max(170, agentRows * SLOT_H + 44);
    const deptStartY = CEO_ZONE_H + HALLWAY_H;
    const breakRoomY = deptStartY + gridRows * (roomH + roomGap) + BREAK_ROOM_GAP;
    const totalH = breakRoomY + BREAK_ROOM_H + 30;
    const roomStartX = (OFFICE_W - (gridCols * roomW + (gridCols - 1) * roomGap)) / 2;
    totalHRef.current = totalH;

    app.renderer.resize(OFFICE_W, totalH);

    // ── BUILDING SHELL ──
    const bg = new Graphics();
    const bgFill = isDark ? 0x0e0e1c : 0xf5f0e8;
    const bgGradFrom = isDark ? 0x121222 : 0xf8f4ec;
    const bgGradTo = isDark ? 0x0a0a18 : 0xf0ece4;
    const bgStrokeInner = isDark ? 0x2a2a48 : 0xd8cfc0;
    const bgStrokeOuter = isDark ? 0x222240 : 0xe0d8cc;
    const bgDotColor = isDark ? 0x2a2a48 : 0xd0c8b8;
    bg.roundRect(0, 0, OFFICE_W, totalH, 6).fill(bgFill);
    drawBandGradient(bg, 2, 2, OFFICE_W - 4, totalH - 4, bgGradFrom, bgGradTo, 14, 0.82);
    bg.roundRect(2, 2, OFFICE_W - 4, totalH - 4, 5).stroke({ width: 1.5, color: bgStrokeInner, alpha: 0.55 });
    bg.roundRect(0, 0, OFFICE_W, totalH, 6).stroke({ width: 3, color: bgStrokeOuter });
    for (let i = 0; i < 22; i++) {
      const sx = 12 + ((i * 97) % Math.max(24, OFFICE_W - 24));
      const sy = 12 + ((i * 131) % Math.max(24, totalH - 24));
      bg.circle(sx, sy, i % 3 === 0 ? 1.1 : 0.8).fill({ color: bgDotColor, alpha: i % 2 === 0 ? 0.12 : 0.08 });
    }
    app.stage.addChild(bg);

    // ── CEO ZONE ──
    const ceoLayer = new Container();
    ceoOfficeRectRef.current = { x: 4, y: 4, w: OFFICE_W - 8, h: CEO_ZONE_H - 4 };
    const ceoFloor = new Graphics();
    drawTiledFloor(ceoFloor, 4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, ceoTheme.floor1, ceoTheme.floor2);
    ceoLayer.addChild(ceoFloor);
    drawRoomAtmosphere(ceoLayer, 4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, ceoTheme.wall, ceoTheme.accent);
    const ceoBorder = new Graphics();
    ceoBorder.roundRect(4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, 3)
      .stroke({ width: 2, color: blendColor(ceoTheme.wall, ceoTheme.accent, 0.55) });
    ceoBorder.roundRect(3, 3, OFFICE_W - 6, CEO_ZONE_H - 2, 4)
      .stroke({ width: 1, color: blendColor(ceoTheme.accent, 0xffffff, 0.2), alpha: 0.35 });
    ceoLayer.addChild(ceoBorder);

    const ceoLabel = new Text({
      text: pickLocale(activeLocale, LOCALE_TEXT.ceoOffice),
      style: new TextStyle({ fontSize: 10, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace", letterSpacing: 2 }),
    });
    const ceoLabelBg = new Graphics();
    ceoLabelBg
      .roundRect(10, 6, ceoLabel.width + 8, 14, 3)
      .fill({ color: blendColor(ceoTheme.accent, ceoTheme.wall, 0.35), alpha: 1 });
    ceoLabelBg
      .roundRect(10, 6, ceoLabel.width + 8, 14, 3)
      .stroke({ width: 1, color: blendColor(ceoTheme.accent, 0xffffff, 0.2), alpha: 0.8 });
    ceoLabel.position.set(12, 8);
    ceoLayer.addChild(ceoLabelBg);
    ceoLayer.addChild(ceoLabel);
    drawBunting(
      ceoLayer,
      148,
      11,
      Math.max(120, OFFICE_W - 300),
      blendColor(ceoTheme.accent, 0xffffff, 0.2),
      blendColor(ceoTheme.wall, ceoTheme.accent, 0.45),
      0.7,
    );

    // CEO desk
    const cdx = 50, cdy = 28;
    const cdg = new Graphics();
    const deskEdge = isDark ? 0x3a2a18 : 0xb8925c;
    const deskTop = isDark ? 0x4a3828 : 0xd0a870;
    const monitorFrame = isDark ? 0x1a1a2a : 0x2a2a3a;
    const monitorScreen = isDark ? 0x2255aa : 0x4488cc;
    const namePlate = isDark ? 0x5a4820 : 0xe8c060;
    cdg.roundRect(cdx, cdy, 64, 34, 3).fill(deskEdge);
    cdg.roundRect(cdx + 1, cdy + 1, 62, 32, 2).fill(deskTop);
    cdg.roundRect(cdx + 19, cdy + 2, 26, 16, 2).fill(monitorFrame);
    cdg.roundRect(cdx + 20.5, cdy + 3.5, 23, 12, 1).fill(monitorScreen);
    cdg.roundRect(cdx + 22, cdy + 24, 20, 7, 2).fill(namePlate);
    ceoLayer.addChild(cdg);
    const ceoPlateText = new Text({
      text: "CEO",
      style: new TextStyle({ fontSize: 5, fill: 0x000000, fontWeight: "bold", fontFamily: "monospace" }),
    });
    ceoPlateText.anchor.set(0.5, 0.5);
    ceoPlateText.position.set(cdx + 32, cdy + 27.5);
    ceoLayer.addChild(ceoPlateText);
    drawChair(ceoLayer, cdx + 32, cdy + 46, 0xd4a860);

    // 6-seat collaboration table in CEO OFFICE
    const mtW = 220;
    const mtH = 28;
    const mtX = Math.floor((OFFICE_W - mtW) / 2);
    const mtY = 48;
    const mt = new Graphics();
    const tableEdge = isDark ? 0x2a2018 : 0xb89060;
    const tableTop = isDark ? 0x382818 : 0xd0a878;
    const tableInlay = isDark ? 0x4a3828 : 0xf7e4c0;
    mt.roundRect(mtX, mtY, mtW, mtH, 12).fill(tableEdge);
    mt.roundRect(mtX + 3, mtY + 3, mtW - 6, mtH - 6, 10).fill(tableTop);
    mt.roundRect(mtX + 64, mtY + 8, 92, 12, 5).fill({ color: tableInlay, alpha: isDark ? 0.3 : 0.45 });
    if (activeMeetingTaskIdRef.current && meetingMinutesOpenRef.current) {
      mt.eventMode = "static";
      mt.cursor = "pointer";
      mt.on("pointerdown", () => {
        const taskId = activeMeetingTaskIdRef.current;
        if (!taskId) return;
        meetingMinutesOpenRef.current?.(taskId);
      });
    }
    ceoLayer.addChild(mt);

    const meetingSeatX = [mtX + 40, mtX + 110, mtX + 180];
    for (const sx of meetingSeatX) {
      drawChair(ceoLayer, sx, mtY - 4, 0xc4a070);
      drawChair(ceoLayer, sx, mtY + mtH + 10, 0xc4a070);
    }

    const meetingLabel = new Text({
      text: pickLocale(activeLocale, LOCALE_TEXT.collabTable),
      style: new TextStyle({ fontSize: 7, fill: 0x7a5c2a, fontWeight: "bold", fontFamily: "monospace", letterSpacing: 1 }),
    });
    meetingLabel.anchor.set(0.5, 0.5);
    meetingLabel.position.set(mtX + mtW / 2, mtY + mtH / 2);
    ceoLayer.addChild(meetingLabel);

    ceoMeetingSeatsRef.current = [
      { x: meetingSeatX[0], y: mtY + 2 },
      { x: meetingSeatX[1], y: mtY + 2 },
      { x: meetingSeatX[2], y: mtY + 2 },
      { x: meetingSeatX[0], y: mtY + mtH + 20 },
      { x: meetingSeatX[1], y: mtY + mtH + 20 },
      { x: meetingSeatX[2], y: mtY + mtH + 20 },
    ];
    // Purge destroyed entries, then keep meeting attendees aligned.
    deliveriesRef.current = deliveriesRef.current.filter(d => !d.sprite.destroyed);
    for (const d of deliveriesRef.current) {
      if (!d.holdAtSeat || typeof d.meetingSeatIndex !== "number") continue;
      const seat = ceoMeetingSeatsRef.current[d.meetingSeatIndex % ceoMeetingSeatsRef.current.length];
      if (!seat) continue;
      d.toX = seat.x;
      d.toY = seat.y;
      if (d.arrived) {
        d.sprite.position.set(seat.x, seat.y);
      } else {
        d.fromX = d.sprite.position.x;
        d.fromY = d.sprite.position.y;
        d.progress = 0;
      }
    }

    // Wall decorations (keep under status panels so they never cover KPI cards)
    drawPictureFrame(ceoLayer, 14, 14);
    wallClocksRef.current.push(drawWallClock(ceoLayer, OFFICE_W - 30, 18));

    // Stats panels (right side)
    const workingCount = agents.filter(a => a.status === "working").length;
    const doneCount = tasks.filter(t => t.status === "done").length;
    const inProg = tasks.filter(t => t.status === "in_progress").length;
    const stats = [
      {
        icon: "🤖",
        label: pickLocale(activeLocale, LOCALE_TEXT.statsEmployees),
        val: formatPeopleCount(agents.length, activeLocale),
      },
      {
        icon: "⚡",
        label: pickLocale(activeLocale, LOCALE_TEXT.statsWorking),
        val: formatPeopleCount(workingCount, activeLocale),
      },
      {
        icon: "📋",
        label: pickLocale(activeLocale, LOCALE_TEXT.statsProgress),
        val: formatTaskCount(inProg, activeLocale),
      },
      {
        icon: "✅",
        label: pickLocale(activeLocale, LOCALE_TEXT.statsDone),
        val: `${doneCount}/${tasks.length}`,
      },
    ];
    stats.forEach((s, i) => {
      const sx = OFFICE_W - 340 + i * 82, sy = 12;
      const sg = new Graphics();
      sg.roundRect(sx, sy, 74, 26, 4).fill({ color: 0xfff4d8, alpha: 0.85 });
      sg.roundRect(sx, sy, 74, 26, 4).stroke({ width: 1, color: 0xe8c870, alpha: 0.5 });
      ceoLayer.addChild(sg);
      const ti = new Text({ text: s.icon, style: new TextStyle({ fontSize: 10 }) });
      ti.position.set(sx + 4, sy + 4);
      ceoLayer.addChild(ti);
      ceoLayer.addChild(Object.assign(new Text({
        text: s.label,
        style: new TextStyle({ fontSize: 7, fill: 0x8b7040, fontFamily: "monospace" }),
      }), { x: sx + 18, y: sy + 2 }));
      ceoLayer.addChild(Object.assign(new Text({
        text: s.val,
        style: new TextStyle({ fontSize: 10, fill: 0x5a4020, fontWeight: "bold", fontFamily: "monospace" }),
      }), { x: sx + 18, y: sy + 13 }));
    });

    // Keyboard hint
    const hint = new Text({
      text: pickLocale(activeLocale, LOCALE_TEXT.hint),
      style: new TextStyle({
        fontSize: 10,
        fontWeight: "bold",
        fill: 0x8b7040,
        fontFamily: "monospace",
      }),
    });
    hint.anchor.set(1, 1);
    // Keep the control hint inside the CEO OFFICE area (bottom-right corner).
    hint.position.set(OFFICE_W - 16, CEO_ZONE_H - 8);
    ceoLayer.addChild(hint);
    if (activeMeetingTaskIdRef.current) {
      const meetingHint = new Text({
        text: pickLocale(activeLocale, LOCALE_TEXT.meetingTableHint),
        style: new TextStyle({
          fontSize: 12,
          fill: 0x8b6b30,
          fontWeight: "bold",
          fontFamily: "system-ui, sans-serif",
        }),
      });
      meetingHint.anchor.set(1, 1);
      meetingHint.position.set(hint.position.x - hint.width - 18, hint.position.y);
      ceoLayer.addChild(meetingHint);
    }

    // CEO office ambient glow (warm golden)
    drawAmbientGlow(ceoLayer, OFFICE_W / 2, CEO_ZONE_H / 2, OFFICE_W * 0.35, ceoTheme.accent, 0.08);

    // Plants with variety
    drawPlant(ceoLayer, 18, 62, 0);
    drawPlant(ceoLayer, OFFICE_W - 22, 62, 2);

    // Water cooler
    drawWaterCooler(ceoLayer, 28, 30);

    // Keep CEO room label above wall decorations for readability.
    ceoLayer.addChild(ceoLabelBg);
    ceoLayer.addChild(ceoLabel);

    app.stage.addChild(ceoLayer);

    // ── HALLWAY ──
    const hallY = CEO_ZONE_H;
    const hallG = new Graphics();
    const hallBase = isDark ? 0x252535 : 0xe8dcc8;
    const hallTile1 = isDark ? 0x2d2d40 : 0xf0e4d0;
    const hallTile2 = isDark ? 0x1f1f30 : 0xe8dcc8;
    const hallDash = isDark ? 0x3a3858 : 0xc8b898;
    const hallTrim = isDark ? 0x3a3858 : 0xd4c4a8;
    const hallGlow = isDark ? 0x3355bb : 0xfff8e0;
    hallG.rect(4, hallY, OFFICE_W - 8, HALLWAY_H).fill(hallBase);
    drawBandGradient(hallG, 4, hallY, OFFICE_W - 8, HALLWAY_H, hallTile1, hallTile2, 5, 0.38);
    for (let dx = 4; dx < OFFICE_W - 4; dx += TILE * 2) {
      hallG.rect(dx, hallY, TILE * 2, HALLWAY_H).fill({ color: hallTile1, alpha: 0.5 });
      hallG.rect(dx + TILE * 2, hallY, TILE * 2, HALLWAY_H).fill({ color: hallTile2, alpha: 0.3 });
    }
    for (let dx = 20; dx < OFFICE_W - 20; dx += 16) {
      hallG.rect(dx, hallY + HALLWAY_H / 2, 6, 1).fill({ color: hallDash, alpha: 0.4 });
    }
    hallG.rect(4, hallY, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
    hallG.rect(4, hallY + HALLWAY_H - 1.5, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
    hallG.ellipse(OFFICE_W / 2, hallY + HALLWAY_H / 2 + 1, Math.max(120, OFFICE_W * 0.28), 6).fill({ color: hallGlow, alpha: isDark ? 0.06 : 0.08 });
    
    // Draw second hallway above Break Room
    const hall2Y = breakRoomY - HALLWAY_H;
    hallG.rect(4, hall2Y, OFFICE_W - 8, HALLWAY_H).fill(hallBase);
    drawBandGradient(hallG, 4, hall2Y, OFFICE_W - 8, HALLWAY_H, hallTile1, hallTile2, 5, 0.38);
    for (let dx = 4; dx < OFFICE_W - 4; dx += TILE * 2) {
      hallG.rect(dx, hall2Y, TILE * 2, HALLWAY_H).fill({ color: hallTile1, alpha: 0.5 });
      hallG.rect(dx + TILE * 2, hall2Y, TILE * 2, HALLWAY_H).fill({ color: hallTile2, alpha: 0.3 });
    }
    for (let dx = 20; dx < OFFICE_W - 20; dx += 16) {
      hallG.rect(dx, hall2Y + HALLWAY_H / 2, 6, 1).fill({ color: hallDash, alpha: 0.4 });
    }
    hallG.rect(4, hall2Y, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
    hallG.rect(4, hall2Y + HALLWAY_H - 1.5, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
    hallG.ellipse(OFFICE_W / 2, hall2Y + HALLWAY_H / 2 + 1, Math.max(120, OFFICE_W * 0.28), 6).fill({ color: hallGlow, alpha: isDark ? 0.06 : 0.08 });

    // Small potted plants along hallway
    app.stage.addChild(hallG);
    drawPlant(app.stage as Container, 30, hallY + HALLWAY_H - 6, 2);
    drawPlant(app.stage as Container, OFFICE_W - 30, hallY + HALLWAY_H - 6, 1);

    // ── DEPARTMENT ROOMS ──
    departments.forEach((dept, deptIdx) => {
      const col = deptIdx % gridCols;
      const row = Math.floor(deptIdx / gridCols);
      const rx = roomStartX + col * (roomW + roomGap);
      const ry = deptStartY + row * (roomH + roomGap);
      const theme = customThemes?.[dept.id] || DEPT_THEME[dept.id] || DEPT_THEME.dev;
      const deptAgents = agents.filter(a => a.department_id === dept.id);
      roomRectsRef.current.push({ dept, x: rx, y: ry, w: roomW, h: roomH });

      const room = new Container();

      const floorG = new Graphics();
      drawTiledFloor(floorG, rx, ry, roomW, roomH, theme.floor1, theme.floor2);
      room.addChild(floorG);
      drawRoomAtmosphere(room, rx, ry, roomW, roomH, theme.wall, theme.accent);

      const wallG = new Graphics();
      wallG.roundRect(rx, ry, roomW, roomH, 3).stroke({ width: 2.5, color: theme.wall });
      room.addChild(wallG);

      // Door opening
      const doorG = new Graphics();
      doorG.rect(rx + roomW / 2 - 16, ry - 2, 32, 5).fill(0xf5f0e8);
      room.addChild(doorG);

      // Sign
      const signW = 84;
      const signBg = new Graphics();
      signBg.roundRect(rx + roomW / 2 - signW / 2 + 1, ry - 3, signW, 18, 4).fill({ color: 0x000000, alpha: 0.12 });
      signBg.roundRect(rx + roomW / 2 - signW / 2, ry - 4, signW, 18, 4).fill(theme.accent);
      signBg.eventMode = "static";
      signBg.cursor = "pointer";
      signBg.on("pointerdown", () => cbRef.current.onSelectDepartment(dept));
      room.addChild(signBg);
      const signTxt = new Text({
        text: `${dept.icon || "🏢"} ${activeLocale === "ko" ? (dept.name_ko || dept.name) : dept.name}`,
        style: new TextStyle({ fontSize: 9, fill: 0xffffff, fontWeight: "bold", fontFamily: "system-ui, sans-serif", dropShadow: { alpha: 0.2, distance: 1, color: 0x000000 } }),
      });
      signTxt.anchor.set(0.5, 0.5);
      signTxt.position.set(rx + roomW / 2, ry + 5);
      room.addChild(signTxt);

      // Ambient glow from ceiling light
      drawCeilingLight(room, rx + roomW / 2, ry + 14, theme.accent);
      drawAmbientGlow(room, rx + roomW / 2, ry + roomH / 2, roomW * 0.4, theme.accent, 0.04);
      drawBunting(room, rx + 12, ry + 16, roomW - 24, blendColor(theme.accent, 0xffffff, 0.2), blendColor(theme.wall, 0xffffff, 0.4), 0.52);

      // Wall decorations
      drawWhiteboard(room, rx + roomW - 48, ry + 18);
      drawBookshelf(room, rx + 6, ry + 18);
      wallClocksRef.current.push(drawWallClock(room, rx + roomW - 16, ry + 12));
      drawWindow(room, rx + roomW / 2 - 12, ry + 16);
      if (roomW > 240) {
        drawWindow(room, rx + roomW / 2 - 40, ry + 16, 20, 16);
        drawWindow(room, rx + roomW / 2 + 20, ry + 16, 20, 16);
      }
      if (roomW > 200) {
        drawPictureFrame(room, rx + 40, ry + 20);
      }

      // Floor decorations
      drawPlant(room, rx + 8, ry + roomH - 14, deptIdx);
      drawPlant(room, rx + roomW - 12, ry + roomH - 14, deptIdx + 1);
      drawTrashCan(room, rx + roomW - 14, ry + roomH - 26);

      // Area rug under desk zone
      if (deptAgents.length > 0) {
        drawRug(room, rx + roomW / 2, ry + 38 + Math.min(agentRows, 2) * SLOT_H / 2, roomW - 40, Math.min(agentRows, 2) * SLOT_H - 10, theme.accent);
      }

      // Agents (all dept members keep desks; break agents' sprites move to break room)
      if (deptAgents.length === 0) {
        const et = new Text({
          text: pickLocale(activeLocale, LOCALE_TEXT.noAssignedAgent),
          style: new TextStyle({ fontSize: 10, fill: 0x9a8a7a, fontFamily: "system-ui, sans-serif" }),
        });
        et.anchor.set(0.5, 0.5);
        et.position.set(rx + roomW / 2, ry + roomH / 2);
        room.addChild(et);
      }

      deptAgents.forEach((agent, agentIdx) => {
        const acol = agentIdx % COLS_PER_ROW;
        const arow = Math.floor(agentIdx / COLS_PER_ROW);
        const ax = rx + ROOM_PAD + acol * SLOT_W + SLOT_W / 2;
        const ay = ry + 38 + arow * SLOT_H;
        const isWorking = agent.status === "working";
        const isOffline = agent.status === "offline";
        const isBreak = agent.status === "break";

        // Layout (top→bottom): name+role → chair(behind) + character(↓) → desk
        const nameY = ay;
        const charFeetY = nameY + 24 + TARGET_CHAR_H; // feet position (anchor 0.5,1)
        const deskY = charFeetY - 8; // desk covers lower legs, upper body visible

        agentPosRef.current.set(agent.id, { x: ax, y: deskY });

        // ── Name tag (above character) ──
        const nt = new Text({
          text: activeLocale === "ko" ? (agent.name_ko || agent.name) : agent.name,
          style: new TextStyle({ fontSize: 7, fill: 0x3a3a4a, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
        });
        nt.anchor.set(0.5, 0);
        const ntW = nt.width + 6;
        const ntBg = new Graphics();
        ntBg.roundRect(ax - ntW / 2, nameY, ntW, 12, 3).fill({ color: 0xffffff, alpha: 0.85 });
        room.addChild(ntBg);
        nt.position.set(ax, nameY + 2);
        room.addChild(nt);

        // Unread message indicator (red !)
        if (unread?.has(agent.id)) {
          const bangBg = new Graphics();
          const bangX = ax + ntW / 2 + 2;
          bangBg.circle(bangX, nameY + 6, 6).fill(0xff3333);
          bangBg.circle(bangX, nameY + 6, 6).stroke({ width: 1, color: 0xff0000, alpha: 0.6 });
          room.addChild(bangBg);
          const bangTxt = new Text({
            text: "!",
            style: new TextStyle({ fontSize: 8, fill: 0xffffff, fontWeight: "bold", fontFamily: "monospace" }),
          });
          bangTxt.anchor.set(0.5, 0.5);
          bangTxt.position.set(bangX, nameY + 6);
          room.addChild(bangTxt);
        }

        // Role badge (below name, above character)
        const rt = new Text({
          text: pickLocale(
            activeLocale,
            LOCALE_TEXT.role[agent.role as keyof typeof LOCALE_TEXT.role] || {
              ko: agent.role,
              en: agent.role,
              ja: agent.role,
              zh: agent.role,
            },
          ),
          style: new TextStyle({ fontSize: 6, fill: contrastTextColor(theme.accent), fontFamily: "system-ui, sans-serif" }),
        });
        rt.anchor.set(0.5, 0.5);
        const rtW = rt.width + 5;
        const rtBg = new Graphics();
        rtBg.roundRect(ax - rtW / 2, nameY + 13, rtW, 9, 2).fill({ color: theme.accent, alpha: 0.82 });
        room.addChild(rtBg);
        rt.position.set(ax, nameY + 17.5);
        room.addChild(rt);

        // ── Chair (behind character) ──
        drawChair(room, ax, charFeetY - TARGET_CHAR_H * 0.18, theme.accent);

        // Break agents: desk+chair stay, character goes to break room
        if (isBreak) {
          // Desk (on top of empty chair)
          drawDesk(room, ax - DESK_W / 2, deskY, false);
          const awayTagY = charFeetY - TARGET_CHAR_H / 2;
          const awayTagBgColor = blendColor(theme.accent, 0x101826, 0.78);
          const awayTag = new Text({
            text: pickLocale(activeLocale, LOCALE_TEXT.breakRoom),
            style: new TextStyle({
              fontSize: 8,
              fill: contrastTextColor(awayTagBgColor),
              fontWeight: "bold",
              fontFamily: "system-ui, sans-serif",
            }),
          });
          awayTag.anchor.set(0.5, 0.5);
          const awayTagW = awayTag.width + 10;
          const awayTagH = awayTag.height + 4;
          const awayTagBg = new Graphics();
          awayTagBg
            .roundRect(ax - awayTagW / 2, awayTagY - awayTagH / 2, awayTagW, awayTagH, 3)
            .fill({ color: awayTagBgColor, alpha: 0.9 });
          awayTagBg
            .roundRect(ax - awayTagW / 2, awayTagY - awayTagH / 2, awayTagW, awayTagH, 3)
            .stroke({ width: 1, color: blendColor(theme.accent, 0xffffff, 0.2), alpha: 0.85 });
          room.addChild(awayTagBg);
          awayTag.position.set(ax, awayTagY + 0.5);
          room.addChild(awayTag);
        } else {
          // ── Character sprite (drawn BEFORE desk so legs hide behind it) ──
          const spriteNum = spriteMap.get(agent.id) ?? ((hashStr(agent.id) % 12) + 1);
          const charContainer = new Container();
          charContainer.position.set(ax, charFeetY);
          charContainer.eventMode = "static";
          charContainer.cursor = "pointer";
          charContainer.on("pointerdown", () => cbRef.current.onSelectAgent(agent));

          const frames: Texture[] = [];
          for (let f = 1; f <= 3; f++) {
            const key = `${spriteNum}-D-${f}`;
            if (textures[key]) frames.push(textures[key]);
          }

          if (frames.length > 0) {
            const animSprite = new AnimatedSprite(frames);
            animSprite.anchor.set(0.5, 1);
            const scale = TARGET_CHAR_H / animSprite.texture.height;
            animSprite.scale.set(scale);
            animSprite.gotoAndStop(0);
            if (isOffline) { animSprite.alpha = 0.3; animSprite.tint = 0x888899; }
            charContainer.addChild(animSprite);
          } else {
            const fb = new Text({ text: agent.avatar_emoji || "🤖", style: new TextStyle({ fontSize: 24 }) });
            fb.anchor.set(0.5, 1);
            charContainer.addChild(fb);
          }
          room.addChild(charContainer);

          // ── Desk AFTER character (covers legs) ──
          const deskG = drawDesk(room, ax - DESK_W / 2, deskY, isWorking);

          // ── Bed graphics (hidden, shown at 100% CLI usage) ──
          // Split into bottom layer (frame+mattress+pillow) and top layer (blanket)
          // so the blanket covers the character's legs
          const bedW = TARGET_CHAR_H + 20; // wide enough for lying character
          const bedH = 36;                 // bed depth (front-to-back)
          const bedX = ax - bedW / 2;
          const bedY = deskY;

          // --- Bottom layer: frame + mattress + pillow ---
          const bedG = new Graphics();
          bedG.roundRect(bedX, bedY, bedW, bedH, 4).fill(0x5c3d2e);       // outer frame
          bedG.roundRect(bedX + 1, bedY + 1, bedW - 2, bedH - 2, 3).fill(0x8b6347); // inner frame
          bedG.roundRect(bedX + 3, bedY + 3, bedW - 6, bedH - 6, 2).fill(0xf0e6d3); // mattress
          // Headboard (left edge, darker wood)
          bedG.roundRect(bedX - 2, bedY - 1, 6, bedH + 2, 3).fill(0x4a2e1a);
          // Pillow (left side, slightly indented)
          bedG.ellipse(bedX + 16, bedY + bedH / 2, 9, 7).fill(0xfff8ee);
          bedG.ellipse(bedX + 16, bedY + bedH / 2, 9, 7).stroke({ width: 0.5, color: 0xd8d0c0 });
          // Pillow dent (where head rests)
          bedG.ellipse(bedX + 16, bedY + bedH / 2, 5, 4).fill({ color: 0xf0e8d8, alpha: 0.6 });
          bedG.visible = false;
          room.addChild(bedG);

          // --- Top layer: blanket (covers right ~60% of bed, over character's legs) ---
          const blanketG = new Graphics();
          const blankX = bedX + bedW * 0.35;
          const blankW = bedW * 0.62;
          blanketG.roundRect(blankX, bedY + 2, blankW, bedH - 4, 3).fill(0xc8d8be);
          blanketG.roundRect(blankX, bedY + 2, blankW, bedH - 4, 3)
            .stroke({ width: 0.5, color: 0xa8b898 });
          // Blanket fold line
          blanketG.moveTo(blankX + 2, bedY + bedH / 2)
            .lineTo(blankX + blankW - 4, bedY + bedH / 2)
            .stroke({ width: 0.4, color: 0xb0c0a0, alpha: 0.5 });
          blanketG.visible = false;
          room.addChild(blanketG);

          const particles = new Container();
          room.addChild(particles);
          animItemsRef.current.push({
            sprite: charContainer, status: agent.status,
            baseX: ax, baseY: charContainer.position.y, particles,
            agentId: agent.id, cliProvider: agent.cli_provider,
            deskG, bedG, blanketG,
          });

          // ── Active task speech bubble (above name tag) ──
          const activeTask = tasks.find(t => t.assigned_agent_id === agent.id && t.status === "in_progress");
          if (activeTask) {
            const txt = activeTask.title.length > 16 ? activeTask.title.slice(0, 16) + "..." : activeTask.title;
            const bt = new Text({
              text: `💬 ${txt}`,
              style: new TextStyle({ fontSize: 6.5, fill: 0x333333, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: 85 }),
            });
            bt.anchor.set(0.5, 1);
            const bw = Math.min(bt.width + 8, 100);
            const bh = bt.height + 6;
            const bubbleTop = nameY - bh - 6;
            const bubbleG = new Graphics();
            bubbleG.roundRect(ax - bw / 2, bubbleTop, bw, bh, 4).fill(0xffffff);
            bubbleG.roundRect(ax - bw / 2, bubbleTop, bw, bh, 4)
              .stroke({ width: 1.2, color: theme.accent, alpha: 0.4 });
            bubbleG.moveTo(ax - 3, bubbleTop + bh).lineTo(ax, bubbleTop + bh + 4).lineTo(ax + 3, bubbleTop + bh).fill(0xffffff);
            room.addChild(bubbleG);
            bt.position.set(ax, bubbleTop + bh - 3);
            room.addChild(bt);
          }

          // Status indicators (next to character)
          if (isOffline) {
            const zzz = new Text({ text: "💤", style: new TextStyle({ fontSize: 12 }) });
            zzz.anchor.set(0.5, 0.5);
            zzz.position.set(ax + 20, charFeetY - TARGET_CHAR_H / 2);
            room.addChild(zzz);
          }
        }

        // Sub-agents (beside the desk)
        const mySubs = subAgents.filter(s => s.parentAgentId === agent.id);
        mySubs.forEach((sub, si) => {
          const sx = ax + 35 + si * 28;
          const sy = deskY;
          const tg = new Graphics();
          tg.roundRect(sx - 10, sy + DESK_H + 2, 20, 10, 1).fill(0x777788);
          room.addChild(tg);
          const miniNum = ((hashStr(agent.id) + si + 1) % 12) + 1;
          const miniKey = `${miniNum}-D-1`;
          if (textures[miniKey]) {
            const ms = new Sprite(textures[miniKey]);
            ms.anchor.set(0.5, 1);
            ms.scale.set(MINI_CHAR_H / ms.texture.height);
            ms.position.set(sx, sy + DESK_H);
            if (sub.status !== "working") ms.alpha = 0.5;
            room.addChild(ms);
          }
          const abBg = new Graphics();
          abBg.roundRect(sx - 10, sy - 6, 20, 10, 2).fill(0xf59e0b);
          room.addChild(abBg);
          const abTxt = new Text({
            text: pickLocale(activeLocale, LOCALE_TEXT.partTime),
            style: new TextStyle({ fontSize: 6, fill: 0x000000, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
          });
          abTxt.anchor.set(0.5, 0.5);
          abTxt.position.set(sx, sy - 1);
          room.addChild(abTxt);
        });
      });

      app.stage.addChild(room);
    });

    // ── BREAK ROOM ──
    const breakAgents = agents.filter(a => a.status === 'break');
    breakAnimItemsRef.current = [];
    breakBubblesRef.current = [];

    const breakRoom = new Container();
    const brx = 4, bry = breakRoomY, brw = OFFICE_W - 8, brh = BREAK_ROOM_H;
    breakRoomRectRef.current = { x: brx, y: bry, w: brw, h: brh };

    // Floor
    const brFloor = new Graphics();
    drawTiledFloor(brFloor, brx, bry, brw, brh, breakTheme.floor1, breakTheme.floor2);
    breakRoom.addChild(brFloor);
    drawRoomAtmosphere(breakRoom, brx, bry, brw, brh, breakTheme.wall, breakTheme.accent);

    // Wall border
    const brBorder = new Graphics();
    brBorder.roundRect(brx, bry, brw, brh, 3)
      .stroke({ width: 2, color: breakTheme.wall });
    brBorder.roundRect(brx - 1, bry - 1, brw + 2, brh + 2, 4)
      .stroke({ width: 1, color: breakTheme.accent, alpha: 0.25 });
    breakRoom.addChild(brBorder);

    // Break room ambient glow
    drawAmbientGlow(breakRoom, brx + brw / 2, bry + brh / 2, brw * 0.3, breakTheme.accent, 0.05);
    drawCeilingLight(breakRoom, brx + brw / 3, bry + 6, breakTheme.accent);
    drawCeilingLight(breakRoom, brx + brw * 2 / 3, bry + 6, breakTheme.accent);
    drawBunting(
      breakRoom,
      brx + 14,
      bry + 16,
      brw - 28,
      blendColor(OFFICE_PASTEL.softMint, 0xffffff, 0.18),
      blendColor(OFFICE_PASTEL.dustyRose, 0xffffff, 0.08),
      0.64,
    );

    // Furniture layout (relative to room left)
    const furnitureBaseX = brx + 16;
    drawCoffeeMachine(breakRoom, furnitureBaseX, bry + 20);
    drawPlant(breakRoom, furnitureBaseX + 30, bry + 38, 1);
    drawSofa(breakRoom, furnitureBaseX + 50, bry + 56, 0xc89da6);
    drawCoffeeTable(breakRoom, furnitureBaseX + 140, bry + 58);

    // Right side furniture (from room right edge)
    const furnitureRightX = brx + brw - 16;
    drawVendingMachine(breakRoom, furnitureRightX - 26, bry + 20);
    drawPlant(breakRoom, furnitureRightX - 36, bry + 38, 2);
    drawSofa(breakRoom, furnitureRightX - 120, bry + 56, 0x91bcae);
    drawHighTable(breakRoom, furnitureRightX - 170, bry + 24);

    // Extra decor: wall pictures, clock
    drawPictureFrame(breakRoom, brx + brw / 2 - 8, bry + 14);
    wallClocksRef.current.push(drawWallClock(breakRoom, brx + brw / 2 + 30, bry + 18));
    drawTrashCan(breakRoom, furnitureBaseX + 24, bry + brh - 14);

    // Sign (drawn after wall decor so clock/picture never cover it)
    const brSignW = 84;
    const brSignBg = new Graphics();
    brSignBg.roundRect(brx + brw / 2 - brSignW / 2 + 1, bry - 3, brSignW, 18, 4).fill({ color: 0x000000, alpha: 0.12 });
    brSignBg.roundRect(brx + brw / 2 - brSignW / 2, bry - 4, brSignW, 18, 4).fill(breakTheme.accent);
    breakRoom.addChild(brSignBg);
    const breakSignTextColor = isDark ? 0xffffff : contrastTextColor(breakTheme.accent);
    const brSignTxt = new Text({
      text: pickLocale(activeLocale, LOCALE_TEXT.breakRoom),
      style: new TextStyle({
        fontSize: 9,
        fill: breakSignTextColor,
        fontWeight: "bold",
        fontFamily: "system-ui, sans-serif",
        dropShadow: isDark ? { alpha: 0.6, blur: 2, distance: 1, color: 0x000000 } : undefined,
      }),
    });
    brSignTxt.anchor.set(0.5, 0.5);
    brSignTxt.position.set(brx + brw / 2, bry + 5);
    breakRoom.addChild(brSignTxt);

    // Rug under lounge area
    drawRug(breakRoom, brx + brw / 2, bry + brh / 2 + 10, brw * 0.5, brh * 0.45, breakTheme.accent);

    // Steam particles container (for coffee machine)
    const steamContainer = new Container();
    breakRoom.addChild(steamContainer);
    breakSteamParticlesRef.current = steamContainer;

    // Break agents placement
    breakAgents.forEach((agent, idx) => {
      const spot = BREAK_SPOTS[idx % BREAK_SPOTS.length];
      const seed = hashStr(agent.id);
      const offsetX = ((seed % 7) - 3);
      const offsetY = ((seed % 5) - 2) * 0.6;

      // Resolve x: positive = from room left, negative = from furnitureRightX (brx+brw-16)
      const spotX = spot.x >= 0
        ? brx + spot.x + offsetX
        : (brx + brw - 16) + spot.x + offsetX;
      const spotY = bry + spot.y + offsetY;

      agentPosRef.current.set(agent.id, { x: spotX, y: spotY });

      // Character sprite
      const spriteNum = spriteMap.get(agent.id) ?? ((seed % 12) + 1);
      const charContainer = new Container();
      charContainer.position.set(spotX, spotY);
      charContainer.eventMode = "static";
      charContainer.cursor = "pointer";
      charContainer.on("pointerdown", () => cbRef.current.onSelectAgent(agent));

      const dirKey = `${spriteNum}-${spot.dir}-1`;
      const fallbackKey = `${spriteNum}-D-1`;
      const tex = textures[dirKey] || textures[fallbackKey];

      if (tex) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5, 1);
        const scale = (TARGET_CHAR_H * 0.85) / sp.texture.height;
        sp.scale.set(scale);
        charContainer.addChild(sp);
      } else {
        const fb = new Text({ text: agent.avatar_emoji || "🤖", style: new TextStyle({ fontSize: 20 }) });
        fb.anchor.set(0.5, 1);
        charContainer.addChild(fb);
      }
      breakRoom.addChild(charContainer);

      breakAnimItemsRef.current.push({
        sprite: charContainer,
        baseX: spotX,
        baseY: spotY,
      });

      // Coffee emoji next to character
      const coffeeEmoji = new Text({ text: "☕", style: new TextStyle({ fontSize: 10 }) });
      coffeeEmoji.anchor.set(0.5, 0.5);
      coffeeEmoji.position.set(spotX + 14, spotY - 10);
      breakRoom.addChild(coffeeEmoji);

      // Small name tag
      const nameTag = new Text({
        text: activeLocale === "ko" ? (agent.name_ko || agent.name) : agent.name,
        style: new TextStyle({ fontSize: 6, fill: 0x4a3a2a, fontFamily: "system-ui, sans-serif" }),
      });
      nameTag.anchor.set(0.5, 0);
      const ntW = nameTag.width + 4;
      const ntBg = new Graphics();
      ntBg.roundRect(spotX - ntW / 2, spotY + 2, ntW, 9, 2).fill({ color: 0xffffff, alpha: 0.8 });
      breakRoom.addChild(ntBg);
      nameTag.position.set(spotX, spotY + 3);
      breakRoom.addChild(nameTag);
    });

    // Chat bubbles (1-2 at a time, rotating)
    if (breakAgents.length > 0) {
      const phase = Math.floor(Date.now() / 4000);
      const speakerCount = Math.min(2, breakAgents.length);
      for (let si = 0; si < speakerCount; si++) {
        const speakerIdx = (phase + si) % breakAgents.length;
        const agent = breakAgents[speakerIdx];
        const spot = BREAK_SPOTS[speakerIdx % BREAK_SPOTS.length];
        const seed = hashStr(agent.id);
        const spotX = spot.x >= 0
          ? brx + spot.x + ((seed % 7) - 3)
          : (brx + brw - 16) + spot.x + ((seed % 7) - 3);
        const spotY = bry + spot.y + ((seed % 5) - 2) * 0.6;

        const chatPool = BREAK_CHAT_MESSAGES[activeLocale] || BREAK_CHAT_MESSAGES.ko;
        const msg = chatPool[(seed + phase) % chatPool.length];
        const bubbleText = new Text({
          text: msg,
          style: new TextStyle({ fontSize: 7, fill: 0x333333, fontFamily: "system-ui, sans-serif" }),
        });
        bubbleText.anchor.set(0.5, 1);
        const bw = bubbleText.width + 10;
        const bh = bubbleText.height + 6;
        const bubbleTop = spotY - TARGET_CHAR_H * 0.85 - bh - 4;

        const bubbleG = new Graphics();
        bubbleG.roundRect(spotX - bw / 2, bubbleTop, bw, bh, 4).fill(0xfff8f0);
        bubbleG.roundRect(spotX - bw / 2, bubbleTop, bw, bh, 4)
          .stroke({ width: 1.2, color: breakTheme.accent, alpha: 0.5 });
        // Tail
        bubbleG.moveTo(spotX - 3, bubbleTop + bh).lineTo(spotX, bubbleTop + bh + 4).lineTo(spotX + 3, bubbleTop + bh).fill(0xfff8f0);
        breakRoom.addChild(bubbleG);
        bubbleText.position.set(spotX, bubbleTop + bh - 3);
        breakRoom.addChild(bubbleText);

        // Store for alpha animation
        const bubbleContainer = new Container();
        bubbleContainer.addChild(bubbleG);
        // Re-parent text into container for animation
        breakRoom.removeChild(bubbleG);
        breakRoom.removeChild(bubbleText);
        bubbleContainer.addChild(bubbleG);
        bubbleContainer.addChild(bubbleText);
        breakRoom.addChild(bubbleContainer);
        breakBubblesRef.current.push(bubbleContainer);
      }
    }

    app.stage.addChild(breakRoom);

    // ── DELIVERY LAYER ──
    const dlLayer = new Container();
    app.stage.addChild(dlLayer);
    deliveryLayerRef.current = dlLayer;
    // Preserve in-flight deliveries/meeting attendees across scene rebuilds.
    // Rebuilds happen on data updates (e.g. unread badges) and should not
    // cancel ongoing CEO-table gathering animations.
    deliveriesRef.current = deliveriesRef.current.filter(d => !d.sprite.destroyed);
    for (const delivery of deliveriesRef.current) {
      dlLayer.addChild(delivery.sprite);
    }

    // ── ROOM HIGHLIGHT (drawn in ticker) ──
    const hl = new Graphics();
    app.stage.addChild(hl);
    highlightRef.current = hl;

    // ── CEO CHARACTER (always on top, moveable) ──
    const ceoChar = new Container();
    if (textures["ceo"]) {
      const sp = new Sprite(textures["ceo"]);
      sp.anchor.set(0.5, 0.5);
      const s = CEO_SIZE / Math.max(sp.texture.width, sp.texture.height);
      sp.scale.set(s);
      ceoChar.addChild(sp);
    } else {
      const fb = new Graphics();
      fb.circle(0, 0, 18).fill(0xff4d4d);
      ceoChar.addChild(fb);
    }

    // Crown above lobster
    const crown = new Text({ text: "👑", style: new TextStyle({ fontSize: 14 }) });
    crown.anchor.set(0.5, 1);
    crown.position.set(0, -CEO_SIZE / 2 + 2);
    ceoChar.addChild(crown);
    crownRef.current = crown;

    // CEO name badge
    const cbg = new Graphics();
    cbg.roundRect(-16, CEO_SIZE / 2 + 1, 32, 11, 3).fill({ color: 0xf0d888, alpha: 0.9 });
    ceoChar.addChild(cbg);
    const cName = new Text({
      text: "CEO",
      style: new TextStyle({ fontSize: 7, fill: 0x5a4020, fontWeight: "bold", fontFamily: "monospace" }),
    });
    cName.anchor.set(0.5, 0.5);
    cName.position.set(0, CEO_SIZE / 2 + 6.5);
    ceoChar.addChild(cName);

    ceoChar.position.set(ceoPosRef.current.x, ceoPosRef.current.y);
    app.stage.addChild(ceoChar);
    ceoSpriteRef.current = ceoChar;

    // ── Detect new task assignments → delivery animation ──
    const currentAssign = new Set(
      tasks.filter(t => t.assigned_agent_id && t.status === "in_progress").map(t => t.id)
    );
    const newAssigns = [...currentAssign].filter(id => !prevAssignRef.current.has(id));
    prevAssignRef.current = currentAssign;

    if (dlLayer) {
      for (const tid of newAssigns) {
        const task = tasks.find(t => t.id === tid);
        if (!task?.assigned_agent_id) continue;
        const target = agentPosRef.current.get(task.assigned_agent_id);
        if (!target) continue;

        const dc = new Container();
        const docEmoji = new Text({ text: "📋", style: new TextStyle({ fontSize: 16 }) });
        docEmoji.anchor.set(0.5, 0.5);
        dc.addChild(docEmoji);
        dc.position.set(ceoPosRef.current.x, ceoPosRef.current.y);
        dlLayer.addChild(dc);

        deliveriesRef.current.push({
          sprite: dc,
          fromX: ceoPosRef.current.x,
          fromY: ceoPosRef.current.y,
          toX: target.x,
          toY: target.y + DESK_H,
          progress: 0,
        });
      }
    }
    setSceneRevision((prev) => prev + 1);
  }, []);

  /* ── INIT PIXI APP (runs once on mount) ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    destroyedRef.current = false;
    const currentInitId = ++initIdRef.current;
    scrollHostXRef.current = findScrollContainer(el, "x");
    scrollHostYRef.current = findScrollContainer(el, "y");

    async function init() {
      if (!el) return;
      TextureStyle.defaultOptions.scaleMode = "nearest";

      // Measure container for responsive width
      officeWRef.current = Math.max(MIN_OFFICE_W, el.clientWidth);

      const app = new Application();
      await app.init({
        width: officeWRef.current,
        height: 600,
        backgroundAlpha: 0,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (initIdRef.current !== currentInitId) { app.destroy(); return; }
      appRef.current = app;
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.imageRendering = "pixelated";
      el.innerHTML = "";
      el.appendChild(canvas);

      // Load all textures once
      const textures: Record<string, Texture> = {};
      const loads: Promise<void>[] = [];
      for (let i = 1; i <= 12; i++) {
        for (const f of [1, 2, 3]) {
          const key = `${i}-D-${f}`;
          loads.push(Assets.load<Texture>(spritePath(`${key}.png`)).then(t => { textures[key] = t; }).catch(() => {}));
        }
        for (const dir of ['L', 'R']) {
          const key = `${i}-${dir}-1`;
          loads.push(Assets.load<Texture>(spritePath(`${key}.png`)).then(t => { textures[key] = t; }).catch(() => {}));
        }
      }
      loads.push(Assets.load<Texture>(spritePath("ceo-lobster.png")).then(t => { textures["ceo"] = t; }).catch(() => {}));
      await Promise.all(loads);
      if (initIdRef.current !== currentInitId) { app.destroy(); return; }
      texturesRef.current = textures;

      // Initial scene
      buildScene();
      initDoneRef.current = true;
      followCeoInView();

      // ── ANIMATION TICKER ──
      app.ticker.add(() => {
        if (destroyedRef.current || appRef.current !== app) return;
        const tick = ++tickRef.current;
        const keys = keysRef.current;
        const ceo = ceoSpriteRef.current;
        const wallClockNow = new Date();
        const wallClockSecond = wallClockNow.getHours() * 3600 + wallClockNow.getMinutes() * 60 + wallClockNow.getSeconds();
        if (wallClockSecondRef.current !== wallClockSecond) {
          wallClockSecondRef.current = wallClockSecond;
          for (const clock of wallClocksRef.current) applyWallClockTime(clock, wallClockNow);
        }

        // CEO movement
        if (ceo) {
          let dx = 0, dy = 0;
          if (keys["ArrowLeft"] || keys["KeyA"]) dx -= CEO_SPEED;
          if (keys["ArrowRight"] || keys["KeyD"]) dx += CEO_SPEED;
          if (keys["ArrowUp"] || keys["KeyW"]) dy -= CEO_SPEED;
          if (keys["ArrowDown"] || keys["KeyS"]) dy += CEO_SPEED;
          if (dx || dy) {
            ceoPosRef.current.x = Math.max(28, Math.min(officeWRef.current - 28, ceoPosRef.current.x + dx));
            ceoPosRef.current.y = Math.max(18, Math.min(totalHRef.current - 28, ceoPosRef.current.y + dy));
            ceo.position.set(ceoPosRef.current.x, ceoPosRef.current.y);
            followCeoInView();
          }

          // Crown bob
          const crown = crownRef.current;
          if (crown) {
            crown.position.y = -CEO_SIZE / 2 + 2 + Math.sin(tick * 0.06) * 2;
            crown.rotation = Math.sin(tick * 0.03) * 0.06;
          }
        }

        // Room highlight when CEO is inside
        const hl = highlightRef.current;
        if (hl) {
          hl.clear();
          const activeThemeTargetId = themeHighlightTargetIdRef.current;
          if (activeThemeTargetId) {
            const pulse = 0.55 + Math.sin(tick * 0.08) * 0.2;
            let targetRect: { x: number; y: number; w: number; h: number } | null = null;
            let targetAccent = DEPT_THEME.dev.accent;
            if (activeThemeTargetId === "ceoOffice") {
              targetRect = ceoOfficeRectRef.current;
              targetAccent = dataRef.current.customDeptThemes?.ceoOffice?.accent ?? DEFAULT_CEO_THEME.accent;
            } else if (activeThemeTargetId === "breakRoom") {
              targetRect = breakRoomRectRef.current;
              targetAccent = dataRef.current.customDeptThemes?.breakRoom?.accent ?? DEFAULT_BREAK_THEME.accent;
            } else {
              const targetRoom = roomRectsRef.current.find((r) => r.dept.id === activeThemeTargetId);
              if (targetRoom) {
                targetRect = { x: targetRoom.x, y: targetRoom.y, w: targetRoom.w, h: targetRoom.h };
                const targetTheme = dataRef.current.customDeptThemes?.[activeThemeTargetId]
                  || DEPT_THEME[activeThemeTargetId]
                  || DEPT_THEME.dev;
                targetAccent = targetTheme.accent;
              }
            }
            if (targetRect) {
              hl.roundRect(targetRect.x - 4, targetRect.y - 4, targetRect.w + 8, targetRect.h + 8, 7)
                .stroke({ width: 3.5, color: targetAccent, alpha: pulse });
              hl.roundRect(targetRect.x - 6, targetRect.y - 6, targetRect.w + 12, targetRect.h + 12, 9)
                .stroke({
                  width: 1.2,
                  color: blendColor(targetAccent, 0xffffff, 0.22),
                  alpha: 0.35 + Math.sin(tick * 0.06) * 0.08,
                });
            }
          }
          const cx = ceoPosRef.current.x, cy = ceoPosRef.current.y;
          let highlighted = false;
          for (const r of roomRectsRef.current) {
            if (cx >= r.x && cx <= r.x + r.w && cy >= r.y - 10 && cy <= r.y + r.h) {
              const theme = dataRef.current.customDeptThemes?.[r.dept.id] || DEPT_THEME[r.dept.id] || DEPT_THEME.dev;
              hl.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 5)
                .stroke({ width: 3, color: theme.accent, alpha: 0.5 + Math.sin(tick * 0.08) * 0.2 });
              highlighted = true;
              break;
            }
          }
          // Break room highlight
          if (!highlighted) {
            const br = breakRoomRectRef.current;
            if (br && cx >= br.x && cx <= br.x + br.w && cy >= br.y - 10 && cy <= br.y + br.h) {
              const breakThemeHighlight = dataRef.current.customDeptThemes?.breakRoom ?? DEFAULT_BREAK_THEME;
              hl.roundRect(br.x - 2, br.y - 2, br.w + 4, br.h + 4, 5)
                .stroke({ width: 3, color: breakThemeHighlight.accent, alpha: 0.5 + Math.sin(tick * 0.08) * 0.2 });
            }
          }
        }

        // Agent animations
        for (const { sprite, status, baseX, baseY, particles, agentId, cliProvider, deskG, bedG, blanketG } of animItemsRef.current) {
          // Hide desk sprite if agent is at CEO meeting table
          if (agentId) {
            const meetingNow = Date.now();
            const inMeetingPresence = (dataRef.current.meetingPresence ?? []).some(
              row => row.agent_id === agentId && row.until >= meetingNow,
            );
            const inMeeting = inMeetingPresence || deliveriesRef.current.some(
              d => d.agentId === agentId && d.holdAtSeat && d.arrived,
            );
            sprite.visible = !inMeeting;
            if (inMeeting) continue;
          }
          // Characters stay seated (no bobbing)
          sprite.position.x = baseX;
          sprite.position.y = baseY;

          if (status === "working") {
            if (tick % 10 === 0) {
              const p = new Graphics();
              const colors = [0x55aaff, 0x55ff88, 0xffaa33, 0xff5577, 0xaa77ff];
              p.star(0, 0, 4, 2, 1, 0).fill(colors[Math.floor(Math.random() * colors.length)]);
              p.position.set(baseX + (Math.random() - 0.5) * 24, baseY - 16 - Math.random() * 8);
              (p as any)._vy = -0.4 - Math.random() * 0.3;
              (p as any)._life = 0;
              particles.addChild(p);
            }
            for (let i = particles.children.length - 1; i >= 0; i--) {
              const p = particles.children[i] as any;
              if (p._sweat) continue; // skip sweat drops here
              p._life++;
              p.position.y += p._vy ?? -0.4;
              p.position.x += Math.sin(p._life * 0.2) * 0.2;
              p.alpha = Math.max(0, 1 - p._life * 0.03);
              p.scale.set(Math.max(0.1, 1 - p._life * 0.02));
              if (p._life > 35) { particles.removeChild(p); p.destroy(); }
            }
          }

          // CLI usage stress visuals (3-tier)
          if (cliProvider) {
            const usage = cliUsageRef.current?.[cliProvider];
            const maxUtil = usage?.windows?.reduce((m: number, w: { utilization: number }) => Math.max(m, w.utilization), 0) ?? 0;
            const isOfflineAgent = status === "offline";

            if (maxUtil >= 1.0) {
              // === 100%: fainted — lie down on bed ===
              // Position character lying on bed with head on pillow
              // Bed layout: bedX = baseX - bedW/2, bedY = deskY = baseY-8
              // With rotation -90° and anchor(0.5,1): head extends LEFT from position
              // So position.x = headX + TARGET_CHAR_H to place head on pillow
              const bedCX = baseX;
              const bedCY = baseY - 8 + 18; // bedY + bedH/2 = deskY + 18
              const headX = bedCX - TARGET_CHAR_H / 2 + 6; // head on pillow
              sprite.rotation = -Math.PI / 2; // lie on back (head left)
              // With anchor(0.5,1) rotated -90°: feet at position.x, head at position.x - TARGET_CHAR_H
              sprite.position.set(headX + TARGET_CHAR_H - 6, bedCY);
              sprite.alpha = 0.85;
              const child0 = sprite.children[0];
              if (child0 && 'tint' in child0) (child0 as any).tint = 0xff6666;
              if (deskG) deskG.visible = false;
              if (bedG) {
                bedG.visible = true;
                // Z-order: bedG(bottom) → sprite → blanketG(top)
                const room = sprite.parent;
                if (room) {
                  room.removeChild(sprite);
                  const bedIdx = room.children.indexOf(bedG);
                  room.addChildAt(sprite, bedIdx + 1);
                }
              }
              if (blanketG) {
                blanketG.visible = true;
                // Ensure blanket is above sprite
                const room = sprite.parent;
                if (room) {
                  room.removeChild(blanketG);
                  const sprIdx = room.children.indexOf(sprite);
                  room.addChildAt(blanketG, sprIdx + 1);
                }
              }
              // Dizzy star particle (orbit above head on pillow)
              if (tick % 40 === 0) {
                const star = new Graphics();
                star.star(0, 0, 5, 3, 1.5, 0).fill({ color: 0xffdd44, alpha: 0.8 });
                star.position.set(headX, bedCY - 22);
                (star as any)._sweat = true;
                (star as any)._dizzy = true;
                (star as any)._offset = Math.random() * Math.PI * 2;
                (star as any)._life = 0;
                particles.addChild(star);
              }
              // zzZ text particle (float up from head)
              if (tick % 80 === 0) {
                const zz = new Text({
                  text: "z",
                  style: new TextStyle({ fontSize: 7 + Math.random() * 3, fill: 0xaaaacc, fontFamily: "monospace" }),
                });
                zz.anchor.set(0.5, 0.5);
                zz.position.set(headX + 6, bedCY - 18);
                (zz as any)._sweat = true;
                (zz as any)._life = 0;
                particles.addChild(zz);
              }

            } else if (maxUtil >= 0.8) {
              // === 80%: red face + sweat ===
              sprite.rotation = 0;
              sprite.alpha = 1;
              const child0 = sprite.children[0];
              if (child0 && 'tint' in child0) (child0 as any).tint = 0xff9999;
              if (deskG) deskG.visible = true;
              if (bedG) bedG.visible = false;
              if (blanketG) blanketG.visible = false;
              // Sweat drops (more frequent)
              if (tick % 40 === 0) {
                const drop = new Graphics();
                drop.moveTo(0, 0).lineTo(-1.8, 4).quadraticCurveTo(0, 6.5, 1.8, 4).lineTo(0, 0)
                  .fill({ color: 0x7ec8e3, alpha: 0.85 });
                drop.circle(0, 3.8, 1.2).fill({ color: 0xbde4f4, alpha: 0.5 });
                drop.position.set(baseX + 8, baseY - 36);
                (drop as any)._sweat = true;
                (drop as any)._life = 0;
                particles.addChild(drop);
              }

            } else if (maxUtil >= 0.6) {
              // === 60%: sweat only ===
              sprite.rotation = 0;
              sprite.alpha = 1;
              const child0 = sprite.children[0];
              if (child0 && 'tint' in child0) (child0 as any).tint = 0xffffff;
              if (deskG) deskG.visible = true;
              if (bedG) bedG.visible = false;
              if (blanketG) blanketG.visible = false;
              if (tick % 55 === 0) {
                const drop = new Graphics();
                drop.moveTo(0, 0).lineTo(-1.8, 4).quadraticCurveTo(0, 6.5, 1.8, 4).lineTo(0, 0)
                  .fill({ color: 0x7ec8e3, alpha: 0.85 });
                drop.circle(0, 3.8, 1.2).fill({ color: 0xbde4f4, alpha: 0.5 });
                drop.position.set(baseX + 8, baseY - 36);
                (drop as any)._sweat = true;
                (drop as any)._life = 0;
                particles.addChild(drop);
              }

            } else {
              // === Normal: reset all effects ===
              sprite.rotation = 0;
              sprite.alpha = isOfflineAgent ? 0.3 : 1;
              const child0 = sprite.children[0];
              if (child0 && 'tint' in child0) (child0 as any).tint = isOfflineAgent ? 0x888899 : 0xffffff;
              if (deskG) deskG.visible = true;
              if (bedG) bedG.visible = false;
              if (blanketG) blanketG.visible = false;
            }

            // Animate existing sweat/dizzy particles
            for (let i = particles.children.length - 1; i >= 0; i--) {
              const p = particles.children[i] as any;
              if (!p._sweat) continue;
              p._life++;
              if (p._dizzy) {
                // Dizzy star: orbit around head on pillow
                const headPX = baseX - TARGET_CHAR_H / 2 + 10;
                const bedCY2 = baseY - 8 + 18;
                const angle = tick * 0.08 + p._offset;
                p.position.x = headPX + Math.cos(angle) * 14;
                p.position.y = bedCY2 - 22 + Math.sin(angle * 0.7) * 4;
                p.alpha = 0.7 + Math.sin(tick * 0.1) * 0.3;
              } else {
                // Sweat/zzZ: drip down
                p.position.y += 0.45;
                p.position.x += Math.sin(p._life * 0.15) * 0.15;
                p.alpha = Math.max(0, 0.85 - p._life * 0.022);
              }
              if (p._life > 38) { particles.removeChild(p); p.destroy(); }
            }
          }
        }

        // Break room agent sway animation
        for (const { sprite, baseX, baseY } of breakAnimItemsRef.current) {
          const seed = hashStr((sprite as any)._name || `${baseX}`);
          sprite.position.x = baseX + Math.sin(tick * 0.02 + seed) * 1.5;
          sprite.position.y = baseY + Math.sin(tick * 0.03) * 0.8;
        }

        // Coffee steam particles
        const steamC = breakSteamParticlesRef.current;
        if (steamC) {
          if (tick % 20 === 0) {
            const p = new Graphics();
            p.circle(0, 0, 1.5 + Math.random()).fill({ color: 0xffffff, alpha: 0.5 });
            const br = breakRoomRectRef.current;
            if (br) {
              p.position.set(br.x + 26, br.y + 18);
              (p as any)._vy = -0.3 - Math.random() * 0.2;
              (p as any)._life = 0;
              steamC.addChild(p);
            }
          }
          for (let i = steamC.children.length - 1; i >= 0; i--) {
            const p = steamC.children[i] as any;
            p._life++;
            p.position.y += p._vy ?? -0.3;
            p.position.x += Math.sin(p._life * 0.15) * 0.3;
            p.alpha = Math.max(0, 0.5 - p._life * 0.016);
            if (p._life > 30) { steamC.removeChild(p); p.destroy(); }
          }
        }

        // Break room chat bubble alpha pulsing
        for (const bubble of breakBubblesRef.current) {
          const phase = tick * 0.05;
          bubble.alpha = 0.7 + Math.sin(phase) * 0.3;
        }

        // Delivery animations
        const deliveries = deliveriesRef.current;
        const now = Date.now();
        for (let i = deliveries.length - 1; i >= 0; i--) {
          const d = deliveries[i];
          if (d.sprite.destroyed) { deliveries.splice(i, 1); continue; }
          if (d.holdAtSeat && d.arrived) {
            if (!d.seatedPoseApplied) {
              for (const child of d.sprite.children) {
                const maybeAnim = child as unknown as {
                  stop?: () => void;
                  gotoAndStop?: (frame: number) => void;
                };
                if (typeof maybeAnim.stop === "function" && typeof maybeAnim.gotoAndStop === "function") {
                  maybeAnim.stop();
                  maybeAnim.gotoAndStop(0);
                }
              }
              // Keep a neutral facing direction after arrival.
              d.sprite.scale.x = 1;
              d.seatedPoseApplied = true;
            }
            d.sprite.position.set(d.toX, d.toY);
            d.sprite.alpha = 1;
            if (d.holdUntil && now >= d.holdUntil) {
              destroyNode(d.sprite);
              deliveries.splice(i, 1);
            }
            continue;
          }

          d.progress += d.speed ?? DELIVERY_SPEED;
          if (d.progress >= 1) {
            if (d.holdAtSeat) {
              d.arrived = true;
              d.progress = 1;
              d.sprite.position.set(d.toX, d.toY);
              d.sprite.alpha = 1;
              continue;
            }
            destroyNode(d.sprite);
            deliveries.splice(i, 1);
          } else if (d.type === "walk") {
            // Walking character animation — smooth linear walk with bounce
            const t = d.progress;
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            d.sprite.position.x = d.fromX + (d.toX - d.fromX) * ease;
            d.sprite.position.y = d.fromY + (d.toY - d.fromY) * ease;
            // Walking bounce (small hop)
            const walkBounce = Math.abs(Math.sin(t * Math.PI * 12)) * 3;
            d.sprite.position.y -= walkBounce;
            // Fade in/out at edges
            if (t < 0.05) d.sprite.alpha = t / 0.05;
            else if (t > 0.9) d.sprite.alpha = (1 - t) / 0.1;
            else d.sprite.alpha = 1;
            // Flip direction: face right when moving right, left when moving left
            d.sprite.scale.x = d.toX > d.fromX ? 1 : -1;
          } else {
            // Thrown document animation (CEO → agent)
            const t = d.progress;
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            const arc = d.arcHeight ?? -30;
            d.sprite.position.x = d.fromX + (d.toX - d.fromX) * ease;
            d.sprite.position.y = d.fromY + (d.toY - d.fromY) * ease + Math.sin(t * Math.PI) * arc;
            d.sprite.alpha = t > 0.85 ? (1 - t) / 0.15 : 1;
            d.sprite.scale.set(0.8 + Math.sin(t * Math.PI) * 0.3);
          }
        }
      });
    }

    // Keyboard handlers
    const isInputFocused = () => {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement as HTMLElement)?.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
        keysRef.current[e.code] = true;
      }
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        triggerDepartmentInteract();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    init();

    // Resize observer for responsive layout
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !appRef.current || destroyedRef.current || initIdRef.current !== currentInitId) return;
      const newW = Math.max(MIN_OFFICE_W, Math.floor(entry.contentRect.width));
      if (Math.abs(newW - officeWRef.current) > 10) {
        officeWRef.current = newW;
        buildScene();
      }
    });
    if (el) ro.observe(el);

    return () => {
      destroyedRef.current = true;
      initIdRef.current++; // Invalidate any in-flight init
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      deliveriesRef.current = [];
      initDoneRef.current = false;
      scrollHostXRef.current = null;
      scrollHostYRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [buildScene, triggerDepartmentInteract, followCeoInView]);

  /* ── REBUILD SCENE on data change (no app destroy!) ── */
  useEffect(() => {
    if (initDoneRef.current && appRef.current) {
      buildScene();
    }
  }, [departments, agents, tasks, subAgents, unreadAgentIds, language, activeMeetingTaskId, customDeptThemes, currentTheme, buildScene]);

  /* ── MEETING PRESENCE SYNC (restore seats on refresh/view switch) ── */
  useEffect(() => {
    const dlLayer = deliveryLayerRef.current;
    const textures = texturesRef.current;
    const seats = ceoMeetingSeatsRef.current;
    if (!dlLayer || seats.length === 0) return;

    const now = Date.now();
    const rows = (meetingPresence ?? []).filter((row) => row.until >= now);
    const activeByAgent = new Map(rows.map((row) => [row.agent_id, row]));

    for (const row of rows) {
      const seat = seats[row.seat_index % seats.length];
      if (!seat) continue;
      const decision = resolveMeetingDecision(row.phase, row.decision);

      const existing = deliveriesRef.current.find(
        (d) => d.agentId === row.agent_id && d.holdAtSeat && !d.sprite.destroyed,
      );
      if (existing) {
        existing.meetingSeatIndex = row.seat_index;
        existing.holdUntil = row.until;
        existing.toX = seat.x;
        existing.toY = seat.y;
        existing.arrived = true;
        existing.progress = 1;
        existing.seatedPoseApplied = false;
        existing.meetingDecision = decision;
        existing.sprite.position.set(seat.x, seat.y);
        existing.sprite.alpha = 1;
        if (existing.badgeGraphics && existing.badgeText) {
          paintMeetingBadge(existing.badgeGraphics, existing.badgeText, language, row.phase, decision);
        }
        continue;
      }

      const spriteNum = spriteMapRef.current.get(row.agent_id) ?? ((hashStr(row.agent_id) % 12) + 1);
      const dc = new Container();
      const frames: Texture[] = [];
      for (let f = 1; f <= 3; f++) {
        const key = `${spriteNum}-D-${f}`;
        if (textures[key]) frames.push(textures[key]);
      }
      if (frames.length > 0) {
        const animSprite = new AnimatedSprite(frames);
        animSprite.anchor.set(0.5, 1);
        const scale = 44 / animSprite.texture.height;
        animSprite.scale.set(scale);
        animSprite.gotoAndStop(0);
        dc.addChild(animSprite);
      } else {
        const fb = new Text({ text: "🧑‍💼", style: new TextStyle({ fontSize: 20 }) });
        fb.anchor.set(0.5, 1);
        dc.addChild(fb);
      }

      const badge = new Graphics();
      dc.addChild(badge);
      const badgeText = new Text({
        text: "",
        style: new TextStyle({ fontSize: 7, fill: 0x111111, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
      });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.position.set(0, 10.5);
      dc.addChild(badgeText);
      paintMeetingBadge(badge, badgeText, language, row.phase, decision);

      dc.position.set(seat.x, seat.y);
      dlLayer.addChild(dc);
      deliveriesRef.current.push({
        sprite: dc,
        fromX: seat.x,
        fromY: seat.y,
        toX: seat.x,
        toY: seat.y,
        progress: 1,
        speed: 0.0048,
        type: "walk",
        agentId: row.agent_id,
        holdAtSeat: true,
        holdUntil: row.until,
        arrived: true,
        meetingSeatIndex: row.seat_index,
        meetingDecision: decision,
        badgeGraphics: badge,
        badgeText,
      });
    }

    for (let i = deliveriesRef.current.length - 1; i >= 0; i--) {
      const d = deliveriesRef.current[i];
      if (!d.holdAtSeat || !d.agentId || !d.arrived) continue;
      if (activeByAgent.has(d.agentId)) continue;
      destroyNode(d.sprite);
      deliveriesRef.current.splice(i, 1);
    }
  }, [meetingPresence, language, sceneRevision]);

  /* ── CROSS-DEPT DELIVERY ANIMATIONS (walking character) ── */
  useEffect(() => {
    if (!crossDeptDeliveries?.length) return;
    const dlLayer = deliveryLayerRef.current;
    const textures = texturesRef.current;
    if (!dlLayer) return;

    for (const cd of crossDeptDeliveries) {
      if (processedCrossDeptRef.current.has(cd.id)) continue;
      trackProcessedId(processedCrossDeptRef.current, cd.id);

      const fromPos = agentPosRef.current.get(cd.fromAgentId);
      const toPos = agentPosRef.current.get(cd.toAgentId);
      if (!fromPos || !toPos) {
        onCrossDeptDeliveryProcessed?.(cd.id);
        continue;
      }

      const dc = new Container();

      // ── Walking character sprite ──
      const spriteNum = spriteMapRef.current.get(cd.fromAgentId) ?? ((hashStr(cd.fromAgentId) % 12) + 1);
      const frames: Texture[] = [];
      for (let f = 1; f <= 3; f++) {
        const key = `${spriteNum}-D-${f}`;
        if (textures[key]) frames.push(textures[key]);
      }

      if (frames.length > 0) {
        const animSprite = new AnimatedSprite(frames);
        animSprite.anchor.set(0.5, 1);
        const scale = 44 / animSprite.texture.height;
        animSprite.scale.set(scale);
        animSprite.animationSpeed = 0.12;
        animSprite.play();
        animSprite.position.set(0, 0);
        dc.addChild(animSprite);
      } else {
        const fb = new Text({ text: "🧑‍💼", style: new TextStyle({ fontSize: 20 }) });
        fb.anchor.set(0.5, 1);
        dc.addChild(fb);
      }

      // ── Document held above head ──
      const docHolder = new Container();
      const docEmoji = new Text({ text: "📋", style: new TextStyle({ fontSize: 13 }) });
      docEmoji.anchor.set(0.5, 0.5);
      docHolder.addChild(docEmoji);
      docHolder.position.set(0, -50);
      dc.addChild(docHolder);

      // ── "협업" badge below feet ──
      const badge = new Graphics();
      badge.roundRect(-16, 3, 32, 13, 4).fill({ color: 0xf59e0b, alpha: 0.9 });
      badge.roundRect(-16, 3, 32, 13, 4).stroke({ width: 1, color: 0xd97706, alpha: 0.5 });
      dc.addChild(badge);
      const badgeText = new Text({
        text: pickLocale(language, LOCALE_TEXT.collabBadge),
        style: new TextStyle({ fontSize: 7, fill: 0x000000, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
      });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.position.set(0, 9.5);
      dc.addChild(badgeText);

      dc.position.set(fromPos.x, fromPos.y);
      dlLayer.addChild(dc);

      deliveriesRef.current.push({
        sprite: dc,
        fromX: fromPos.x,
        fromY: fromPos.y,
        toX: toPos.x,
        toY: toPos.y,
        progress: 0,
        speed: 0.005,
        type: "walk",
      });

      onCrossDeptDeliveryProcessed?.(cd.id);
    }
  }, [crossDeptDeliveries, onCrossDeptDeliveryProcessed, language]);

  /* ── CEO OFFICE CALL ANIMATIONS (leaders gather at 6P table) ── */
  useEffect(() => {
    if (!ceoOfficeCalls?.length) return;
    const dlLayer = deliveryLayerRef.current;
    const textures = texturesRef.current;
    if (!dlLayer) return;

    const pickLine = (call: CeoOfficeCall) => {
      const provided = call.line?.trim();
      if (provided) return provided;
      const pool = call.phase === "review"
        ? pickLocale(language, LOCALE_TEXT.reviewLines)
        : pickLocale(language, LOCALE_TEXT.kickoffLines);
      return pool[hashStr(`${call.fromAgentId}-${call.id}`) % pool.length];
    };

    const renderSpeechBubble = (x: number, y: number, phase: "kickoff" | "review", line: string) => {
      const bubble = new Container();
      const bubbleText = new Text({
        text: line,
        style: new TextStyle({
          fontSize: 7,
          fill: 0x2b2b2b,
          fontFamily: "system-ui, sans-serif",
          wordWrap: true,
          wordWrapWidth: 120,
          breakWords: true,
        }),
      });
      bubbleText.anchor.set(0.5, 1);
      const bw = Math.min(bubbleText.width + 12, 122);
      const bh = bubbleText.height + 8;
      const by = -62;
      const bubbleG = new Graphics();
      bubbleG.roundRect(-bw / 2, by - bh, bw, bh, 4).fill(0xfff8e8);
      bubbleG.roundRect(-bw / 2, by - bh, bw, bh, 4).stroke({
        width: 1,
        color: phase === "review" ? 0x34d399 : 0xf59e0b,
        alpha: 0.6,
      });
      bubbleG.moveTo(-3, by).lineTo(0, by + 4).lineTo(3, by).fill(0xfff8e8);
      bubble.addChild(bubbleG);
      bubbleText.position.set(0, by - 4);
      bubble.addChild(bubbleText);

      bubble.position.set(x, y - 6);
      dlLayer.addChild(bubble);

      setTimeout(() => {
        destroyNode(bubble);
      }, 2800);
    };

    for (const call of ceoOfficeCalls) {
      if (processedCeoOfficeRef.current.has(call.id)) continue;

      if (call.action === "dismiss") {
        trackProcessedId(processedCeoOfficeRef.current, call.id);
        for (let i = deliveriesRef.current.length - 1; i >= 0; i--) {
          const d = deliveriesRef.current[i];
          if (d.agentId === call.fromAgentId && d.holdAtSeat) {
            destroyNode(d.sprite);
            deliveriesRef.current.splice(i, 1);
          }
        }
        onCeoOfficeCallProcessed?.(call.id);
        continue;
      }

      const seats = ceoMeetingSeatsRef.current;
      const seat = seats.length > 0 ? seats[call.seatIndex % seats.length] : null;
      if (!seat) continue; // seats not ready yet — retry on next render

      if (call.action === "speak") {
        trackProcessedId(processedCeoOfficeRef.current, call.id);
        const line = pickLine(call);
        const decision = resolveMeetingDecision(call.phase, call.decision, line);
        renderSpeechBubble(seat.x, seat.y, call.phase, line);
        if (call.phase === "review") {
          const attendee = deliveriesRef.current.find(
            (d) => d.agentId === call.fromAgentId && d.holdAtSeat && !d.sprite.destroyed,
          );
          if (attendee) {
            attendee.meetingDecision = decision;
            if (attendee.badgeGraphics && attendee.badgeText) {
              paintMeetingBadge(attendee.badgeGraphics, attendee.badgeText, language, call.phase, decision);
            }
          }
        }
        onCeoOfficeCallProcessed?.(call.id);
        continue;
      }

      // action === "arrive" (default)
      const fromPos = agentPosRef.current.get(call.fromAgentId);
      if (!fromPos) continue; // agent not rendered yet — retry on next render

      trackProcessedId(processedCeoOfficeRef.current, call.id);
      const dc = new Container();
      const spriteNum = spriteMapRef.current.get(call.fromAgentId) ?? ((hashStr(call.fromAgentId) % 12) + 1);
      const frames: Texture[] = [];
      for (let f = 1; f <= 3; f++) {
        const key = `${spriteNum}-D-${f}`;
        if (textures[key]) frames.push(textures[key]);
      }

      if (frames.length > 0) {
        const animSprite = new AnimatedSprite(frames);
        animSprite.anchor.set(0.5, 1);
        const scale = 44 / animSprite.texture.height;
        animSprite.scale.set(scale);
        animSprite.animationSpeed = 0.12;
        animSprite.play();
        dc.addChild(animSprite);
      } else {
        const fb = new Text({ text: "🧑‍💼", style: new TextStyle({ fontSize: 20 }) });
        fb.anchor.set(0.5, 1);
        dc.addChild(fb);
      }

      const badge = new Graphics();
      dc.addChild(badge);
      const decision = resolveMeetingDecision(call.phase, call.decision, call.line);
      const badgeText = new Text({
        text: "",
        style: new TextStyle({ fontSize: 7, fill: 0x111111, fontWeight: "bold", fontFamily: "system-ui, sans-serif" }),
      });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.position.set(0, 10.5);
      dc.addChild(badgeText);
      paintMeetingBadge(badge, badgeText, language, call.phase, decision);

      dc.position.set(fromPos.x, fromPos.y);
      dlLayer.addChild(dc);

      for (let i = deliveriesRef.current.length - 1; i >= 0; i--) {
        const d = deliveriesRef.current[i];
        if (d.agentId !== call.fromAgentId) continue;
        destroyNode(d.sprite);
        deliveriesRef.current.splice(i, 1);
      }

      deliveriesRef.current.push({
        sprite: dc,
        fromX: fromPos.x,
        fromY: fromPos.y,
        toX: seat.x,
        toY: seat.y,
        progress: 0,
        speed: 0.0048,
        type: "walk",
        agentId: call.fromAgentId,
        holdAtSeat: true,
        holdUntil: call.holdUntil ?? (Date.now() + 600_000),
        meetingSeatIndex: call.seatIndex,
        meetingDecision: decision,
        badgeGraphics: badge,
        badgeText,
      });

      onCeoOfficeCallProcessed?.(call.id);
    }
  }, [ceoOfficeCalls, onCeoOfficeCallProcessed, language, agents]);

  // ── CLI Usage Gauges ──
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [cliUsage, setCliUsage] = useState<Record<string, CliUsageEntry> | null>(null);
  cliUsageRef.current = cliUsage;
  const [refreshing, setRefreshing] = useState(false);
  const doneCountRef = useRef(0);

  // Load cached data from SQLite on mount (instant)
  useEffect(() => {
    getCliStatus().then(setCliStatus).catch(() => {});
    getCliUsage().then((r) => { if (r.ok) setCliUsage(r.usage); }).catch(() => {});
  }, []);

  // Auto-refresh when a task completes (done count increases)
  useEffect(() => {
    const doneCount = tasks.filter((t) => t.status === "done").length;
    if (doneCountRef.current > 0 && doneCount > doneCountRef.current) {
      // A new task just completed — refresh usage
      refreshCliUsage().then((r) => { if (r.ok) setCliUsage(r.usage); }).catch(() => {});
    }
    doneCountRef.current = doneCount;
  }, [tasks]);

  const handleRefreshUsage = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    refreshCliUsage()
      .then((r) => { if (r.ok) setCliUsage(r.usage); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refreshing]);

  const ClaudeLogo = () => (
    <svg width="18" height="18" viewBox="0 0 400 400" fill="none">
      <path fill="#D97757" d="m124.011 241.251 49.164-27.585.826-2.396-.826-1.333h-2.396l-8.217-.506-28.09-.759-24.363-1.012-23.603-1.266-5.938-1.265L75 197.79l.574-3.661 4.994-3.358 7.153.625 15.808 1.079 23.722 1.637 17.208 1.012 25.493 2.649h4.049l.574-1.637-1.384-1.012-1.079-1.012-24.548-16.635-26.573-17.58-13.919-10.123-7.524-5.129-3.796-4.808-1.637-10.494 6.833-7.525 9.178.624 2.345.625 9.296 7.153 19.858 15.37 25.931 19.098 3.796 3.155 1.519-1.08.185-.759-1.704-2.851-14.104-25.493-15.049-25.931-6.698-10.747-1.772-6.445c-.624-2.649-1.08-4.876-1.08-7.592l7.778-10.561L144.729 75l10.376 1.383 4.37 3.797 6.445 14.745 10.443 23.215 16.197 31.566 4.741 9.364 2.53 8.672.945 2.649h1.637v-1.519l1.332-17.782 2.464-21.832 2.395-28.091.827-7.912 3.914-9.482 7.778-5.129 6.074 2.902 4.994 7.153-.692 4.623-2.969 19.301-5.821 30.234-3.796 20.245h2.21l2.531-2.53 10.241-13.599 17.208-21.511 7.593-8.537 8.857-9.431 5.686-4.488h10.747l7.912 11.76-3.543 12.147-11.067 14.037-9.178 11.895-13.16 17.714-8.216 14.172.759 1.131 1.957-.186 29.727-6.327 16.062-2.901 19.166-3.29 8.672 4.049.944 4.116-3.408 8.419-20.498 5.062-24.042 4.808-35.801 8.469-.439.321.506.624 16.13 1.519 6.9.371h16.888l31.448 2.345 8.217 5.433 4.926 6.647-.827 5.061-12.653 6.445-17.074-4.049-39.85-9.482-13.666-3.408h-1.889v1.131l11.388 11.135 20.87 18.845 26.133 24.295 1.333 6.006-3.357 4.741-3.543-.506-22.962-17.277-8.858-7.777-20.06-16.888H238.5v1.771l4.623 6.765 24.413 36.696 1.265 11.253-1.771 3.661-6.327 2.21-6.951-1.265-14.29-20.06-14.745-22.591-11.895-20.246-1.451.827-7.018 75.601-3.29 3.863-7.592 2.902-6.327-4.808-3.357-7.778 3.357-15.37 4.049-20.06 3.29-15.943 2.969-19.807 1.772-6.58-.118-.439-1.451.186-14.931 20.498-22.709 30.689-17.968 19.234-4.302 1.704-7.458-3.864.692-6.9 4.167-6.141 24.869-31.634 14.999-19.605 9.684-11.32-.068-1.637h-.573l-66.052 42.887-11.759 1.519-5.062-4.741.625-7.778 2.395-2.531 19.858-13.665-.068.067z"/>
    </svg>
  );

  const ChatGPTLogo = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.413a6.12 6.12 0 00-5.834 4.27 5.984 5.984 0 00-3.996 2.9 6.043 6.043 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.192 24a6.116 6.116 0 005.84-4.27 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.01zM13.192 22.784a4.474 4.474 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.658 18.607a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.77.77 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 20.236a4.508 4.508 0 01-6.083-1.63zM2.328 7.847A4.477 4.477 0 014.68 5.879l-.002.159v5.52a.78.78 0 00.391.676l5.84 3.37-2.02 1.166a.08.08 0 01-.073.007L3.917 13.98a4.506 4.506 0 01-1.589-6.132zM19.835 11.94l-5.844-3.37 2.02-1.166a.08.08 0 01.073-.007l4.898 2.794a4.494 4.494 0 01-.69 8.109v-5.68a.79.79 0 00-.457-.68zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L10.302 9.42V7.088a.08.08 0 01.033-.062l4.898-2.824a4.497 4.497 0 016.612 4.66v.054zM9.076 12.59l-2.02-1.164a.08.08 0 01-.038-.057V5.79A4.498 4.498 0 0114.392 3.2l-.141.08-4.778 2.758a.795.795 0 00-.392.681l-.005 5.87zm1.098-2.358L12 9.019l1.826 1.054v2.109L12 13.235l-1.826-1.054v-2.108z" fill="#10A37F"/>
    </svg>
  );

  const GeminiLogo = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" fill="url(#gemini_grad)"/>
      <defs>
        <linearGradient id="gemini_grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4"/>
          <stop offset="1" stopColor="#886FBF"/>
        </linearGradient>
      </defs>
    </svg>
  );

  const CLI_DISPLAY: Array<{ key: string; name: string; icon: React.ReactNode; color: string; bgColor: string }> = [
    { key: "claude", name: "Claude", icon: <ClaudeLogo />, color: "text-violet-300", bgColor: "bg-violet-500/15 border-violet-400/30" },
    { key: "codex", name: "Codex", icon: <ChatGPTLogo />, color: "text-emerald-300", bgColor: "bg-emerald-500/15 border-emerald-400/30" },
    { key: "gemini", name: "Gemini", icon: <GeminiLogo />, color: "text-blue-300", bgColor: "bg-blue-500/15 border-blue-400/30" },
    { key: "copilot", name: "Copilot", icon: "\uD83D\uDE80", color: "text-amber-300", bgColor: "bg-amber-500/15 border-amber-400/30" },
    { key: "antigravity", name: "Antigravity", icon: "\uD83C\uDF0C", color: "text-pink-300", bgColor: "bg-pink-500/15 border-pink-400/30" },
  ];

  const connectedClis = CLI_DISPLAY.filter((c) => {
    const s = cliStatus?.[c.key as keyof CliStatusMap];
    return s?.installed && s?.authenticated;
  });

  const mobilePadButtonClass =
    "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300/70 bg-transparent text-sm font-bold text-slate-100 shadow-none active:scale-95 active:bg-slate-500/20";

  return (
    <div className="w-full overflow-auto" style={{ minHeight: "100%" }}>
      <div className="relative mx-auto w-full">
        <div
          ref={containerRef}
          className="mx-auto"
          style={{ maxWidth: "100%", lineHeight: 0, outline: "none" }}
          tabIndex={0}
        />

        {showVirtualPad && (
          <>
            <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
              <button
                type="button"
                aria-label="Interact"
                className="pointer-events-auto flex h-10 min-w-12 items-center justify-center rounded-xl border border-amber-300/80 bg-amber-500/85 px-2 text-[11px] font-bold tracking-wide text-slate-950 shadow-none active:scale-95 active:bg-amber-400"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => e.preventDefault()}
                onClick={triggerDepartmentInteract}
              >
                {t(LOCALE_TEXT.mobileEnter)}
              </button>
            </div>

            <div className="pointer-events-none fixed bottom-3 right-3 z-50">
              <div className="grid grid-cols-3 gap-1">
                <div />
                <button
                  type="button"
                  aria-label="Move up"
                  className={mobilePadButtonClass}
                  style={{ touchAction: "none" }}
                  onPointerDown={() => setMoveDirectionPressed("up", true)}
                  onPointerUp={() => setMoveDirectionPressed("up", false)}
                  onPointerCancel={() => setMoveDirectionPressed("up", false)}
                  onPointerLeave={() => setMoveDirectionPressed("up", false)}
                >
                  ▲
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Move left"
                  className={mobilePadButtonClass}
                  style={{ touchAction: "none" }}
                  onPointerDown={() => setMoveDirectionPressed("left", true)}
                  onPointerUp={() => setMoveDirectionPressed("left", false)}
                  onPointerCancel={() => setMoveDirectionPressed("left", false)}
                  onPointerLeave={() => setMoveDirectionPressed("left", false)}
                >
                  ◀
                </button>
                <div className="h-9 w-9" />
                <button
                  type="button"
                  aria-label="Move right"
                  className={mobilePadButtonClass}
                  style={{ touchAction: "none" }}
                  onPointerDown={() => setMoveDirectionPressed("right", true)}
                  onPointerUp={() => setMoveDirectionPressed("right", false)}
                  onPointerCancel={() => setMoveDirectionPressed("right", false)}
                  onPointerLeave={() => setMoveDirectionPressed("right", false)}
                >
                  ▶
                </button>
                <div />
                <button
                  type="button"
                  aria-label="Move down"
                  className={mobilePadButtonClass}
                  style={{ touchAction: "none" }}
                  onPointerDown={() => setMoveDirectionPressed("down", true)}
                  onPointerUp={() => setMoveDirectionPressed("down", false)}
                  onPointerCancel={() => setMoveDirectionPressed("down", false)}
                  onPointerLeave={() => setMoveDirectionPressed("down", false)}
                >
                  ▼
                </button>
                <div />
              </div>
            </div>
          </>
        )}
      </div>

      {/* CLI Usage Gauges */}
      {connectedClis.length > 0 && (
        <div className="mt-4 px-2">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-cyan-400">
                    <path d="M12 2a10 10 0 1 0 10 10" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.3" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </span>
                {t(LOCALE_TEXT.cliUsageTitle)}
              </h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                  {connectedClis.length} {t(LOCALE_TEXT.cliConnected)}
                </span>
                <button
                  onClick={handleRefreshUsage}
                  disabled={refreshing}
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
                  title={t(LOCALE_TEXT.cliRefreshTitle)}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={refreshing ? "animate-spin" : ""}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {connectedClis.map((cli) => {
                const usage = cliUsage?.[cli.key];
                return (
                  <div
                    key={cli.key}
                    className={`group rounded-xl border ${cli.bgColor} p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-[18px] w-[18px] items-center justify-center text-base">{cli.icon}</span>
                        <span className={`text-sm font-semibold ${cli.color}`}>{cli.name}</span>
                      </div>
                    </div>

                    {/* Error / empty states */}
                    {usage?.error === "unauthenticated" && (
                      <p className="text-[11px] text-slate-500 italic">{t(LOCALE_TEXT.cliNotSignedIn)}</p>
                    )}
                    {usage?.error === "not_implemented" && (
                      <p className="text-[11px] text-slate-500 italic">{t(LOCALE_TEXT.cliNoApi)}</p>
                    )}
                    {usage?.error && usage.error !== "unauthenticated" && usage.error !== "not_implemented" && (
                      <p className="text-[11px] text-slate-500 italic">{t(LOCALE_TEXT.cliUnavailable)}</p>
                    )}

                    {/* Loading */}
                    {!usage && (
                      <p className="text-[11px] text-slate-500 italic">{t(LOCALE_TEXT.cliLoading)}</p>
                    )}

                    {/* Window bars */}
                    {usage && !usage.error && usage.windows.length > 0 && (
                      <div className={
                        usage.windows.length > 3
                          ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                          : "flex flex-col gap-1.5"
                      }>
                        {usage.windows.map((w: CliUsageWindow) => {
                          const pct = Math.round(w.utilization * 100);
                          const barColor =
                            pct >= 80
                              ? "bg-red-500"
                              : pct >= 50
                                ? "bg-amber-400"
                                : "bg-emerald-400";
                          return (
                            <div key={w.label}>
                              <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                <span className="text-slate-400">{w.label}</span>
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={
                                      pct >= 80
                                        ? "font-semibold text-red-400"
                                        : pct >= 50
                                          ? "text-amber-400"
                                          : "text-slate-400"
                                    }
                                  >
                                    {pct}%
                                  </span>
                                  {w.resetsAt && (
                                    <span className="text-slate-500">
                                      {t(LOCALE_TEXT.cliResets)} {formatReset(w.resetsAt, language)}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-700/60">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-700`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* No windows but no error */}
                    {usage && !usage.error && usage.windows.length === 0 && (
                      <p className="text-[11px] text-slate-500 italic">{t(LOCALE_TEXT.cliNoData)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
