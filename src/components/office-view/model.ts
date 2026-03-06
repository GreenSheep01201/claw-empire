import { type Container, Graphics, Text, TextStyle } from "pixi.js";
import type {
  Department,
  Agent,
  Task,
  MeetingPresence,
  MeetingReviewDecision,
  SubAgent,
  CrossDeptDelivery,
  CeoOfficeCall,
} from "../../types";

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
    const hasScrollableStyle =
      axis === "y" ? isScrollableOverflowValue(overflowY) : isScrollableOverflowValue(overflowX);
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
const CEO_SPEED = 7;
const DELIVERY_SPEED = 0.012;

const BREAK_ROOM_H = 110;
const BREAK_ROOM_GAP = 32;
const MAX_VISIBLE_SUB_CLONES_PER_AGENT = 3;
const SUB_CLONE_WAVE_SPEED = 0.04;
const SUB_CLONE_MOVE_X_AMPLITUDE = 0.16;
const SUB_CLONE_MOVE_Y_AMPLITUDE = 0.34;
const SUB_CLONE_FLOAT_DRIFT = 0.08;
const SUB_CLONE_FIREWORK_INTERVAL = 210;
const MOBILE_MOVE_CODES = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
} as const;
type MobileMoveDirection = keyof typeof MOBILE_MOVE_CODES;
type RoomTheme = { floor1: number; floor2: number; wall: number; accent: number };

type SubCloneBurstParticle = {
  node: Container;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  spin: number;
  growth: number;
};

function emitSubCloneSmokeBurst(
  target: Container,
  particles: SubCloneBurstParticle[],
  x: number,
  y: number,
  mode: "spawn" | "despawn",
): void {
  const baseColor = mode === "spawn" ? 0xc7d4ec : 0xb7bfd1;
  const strokeColor = mode === "spawn" ? 0xe6edff : 0xd4dae8;
  const puffCount = mode === "spawn" ? 9 : 7;
  for (let i = 0; i < puffCount; i++) {
    const puff = new Graphics();
    const radius = 1.8 + Math.random() * 2.8;
    puff.circle(0, 0, radius).fill({ color: baseColor, alpha: 0.62 + Math.random() * 0.18 });
    puff.circle(0, 0, radius).stroke({ width: 0.6, color: strokeColor, alpha: 0.32 });
    puff.position.set(x + (Math.random() - 0.5) * 10, y - 14 + (Math.random() - 0.5) * 6);
    target.addChild(puff);
    particles.push({
      node: puff,
      vx: (Math.random() - 0.5) * (mode === "spawn" ? 1.4 : 1.1),
      vy: -0.22 - Math.random() * 0.6,
      life: 0,
      maxLife: 20 + Math.floor(Math.random() * 12),
      spin: (Math.random() - 0.5) * 0.1,
      growth: 0.013 + Math.random() * 0.012,
    });
  }

  const flash = new Graphics();
  flash.circle(0, 0, mode === "spawn" ? 5.4 : 4.2).fill({ color: 0xf8fbff, alpha: mode === "spawn" ? 0.52 : 0.42 });
  flash.position.set(x, y - 14);
  target.addChild(flash);
  particles.push({
    node: flash,
    vx: 0,
    vy: -0.16,
    life: 0,
    maxLife: mode === "spawn" ? 14 : 12,
    spin: 0,
    growth: 0.022,
  });

  const burstTxt = new Text({
    text: "ポン",
    style: new TextStyle({
      fontSize: 7,
      fill: mode === "spawn" ? 0xeff4ff : 0xdde4f5,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
      stroke: { color: 0x1f2838, width: 2 },
    }),
  });
  burstTxt.anchor.set(0.5, 0.5);
  burstTxt.position.set(x, y - 24);
  target.addChild(burstTxt);
  particles.push({
    node: burstTxt,
    vx: (Math.random() - 0.5) * 0.35,
    vy: -0.3,
    life: 0,
    maxLife: mode === "spawn" ? 18 : 16,
    spin: (Math.random() - 0.5) * 0.04,
    growth: 0.004,
  });
}

function emitSubCloneFireworkBurst(target: Container, particles: SubCloneBurstParticle[], x: number, y: number): void {
  const colors = [0xff6b6b, 0xffc75f, 0x7ce7ff, 0x8cff9f, 0xd7a6ff];
  const sparkCount = 10;
  for (let i = 0; i < sparkCount; i++) {
    const spark = new Graphics();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const radius = 0.85 + Math.random() * 0.6;
    spark.circle(0, 0, radius).fill({ color, alpha: 0.96 });
    spark.circle(0, 0, radius).stroke({ width: 0.45, color: 0xffffff, alpha: 0.5 });
    spark.position.set(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 3);
    target.addChild(spark);
    const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.45;
    const speed = 0.9 + Math.random() * 0.85;
    particles.push({
      node: spark,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.45,
      life: 0,
      maxLife: 16 + Math.floor(Math.random() * 8),
      spin: (Math.random() - 0.5) * 0.08,
      growth: 0.006 + Math.random() * 0.006,
    });
  }
}

export {
  type OfficeViewProps,
  type Delivery,
  type RoomRect,
  type WallClockVisual,
  detachNode,
  destroyNode,
  trackProcessedId,
  type ScrollAxis,
  canScrollOnAxis,
  findScrollContainer,
  MIN_OFFICE_W,
  CEO_ZONE_H,
  HALLWAY_H,
  TARGET_CHAR_H,
  MINI_CHAR_H,
  CEO_SIZE,
  DESK_W,
  DESK_H,
  SLOT_W,
  SLOT_H,
  COLS_PER_ROW,
  ROOM_PAD,
  TILE,
  CEO_SPEED,
  DELIVERY_SPEED,
  BREAK_ROOM_H,
  BREAK_ROOM_GAP,
  MAX_VISIBLE_SUB_CLONES_PER_AGENT,
  SUB_CLONE_WAVE_SPEED,
  SUB_CLONE_MOVE_X_AMPLITUDE,
  SUB_CLONE_MOVE_Y_AMPLITUDE,
  SUB_CLONE_FLOAT_DRIFT,
  SUB_CLONE_FIREWORK_INTERVAL,
  MOBILE_MOVE_CODES,
  type MobileMoveDirection,
  type RoomTheme,
  type SubCloneBurstParticle,
  emitSubCloneSmokeBurst,
  emitSubCloneFireworkBurst,
};
