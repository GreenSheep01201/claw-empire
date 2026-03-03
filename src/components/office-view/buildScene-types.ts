import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Application, AnimatedSprite, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Agent, Department, SubAgent, Task } from "../../types";
import type { ThemeMode } from "../../ThemeContext";
import type { Delivery, RoomRect, SubCloneBurstParticle, WallClockVisual } from "./model";
import type { SupportedLocale } from "./themes-locale";

export interface DataSnapshot {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  unreadAgentIds?: Set<string>;
  meetingPresence?: Array<{ agent_id: string; until: number }>;
  customDeptThemes?: Record<string, { floor1: number; floor2: number; wall: number; accent: number }>;
  patrolAgentIds?: Set<string>;
}

export interface CallbackSnapshot {
  onSelectAgent: (agent: Agent) => void;
  onSelectDepartment: (dept: Department) => void;
}

export interface AnimItem {
  sprite: Container;
  status: string;
  baseX: number;
  baseY: number;
  particles: Container;
  agentId?: string;
  cliProvider?: string;
  deskG?: Graphics;
  bedG?: Graphics;
  blanketG?: Graphics;
}

export interface BreakAnimItem {
  sprite: Container;
  baseX: number;
  baseY: number;
}

export interface SubCloneAnimItem {
  container: Container;
  aura: Graphics;
  cloneVisual: Sprite;
  animated?: AnimatedSprite;
  frameCount: number;
  baseScale: number;
  baseX: number;
  baseY: number;
  phase: number;
  fireworkOffset: number;
}

export interface BuildOfficeSceneContext {
  appRef: MutableRefObject<Application | null>;
  texturesRef: MutableRefObject<Record<string, Texture>>;
  dataRef: MutableRefObject<DataSnapshot>;
  cbRef: MutableRefObject<CallbackSnapshot>;
  activeMeetingTaskIdRef: MutableRefObject<string | null>;
  meetingMinutesOpenRef: MutableRefObject<((taskId: string) => void) | undefined>;
  localeRef: MutableRefObject<SupportedLocale>;
  themeRef: MutableRefObject<ThemeMode>;
  animItemsRef: MutableRefObject<AnimItem[]>;
  roomRectsRef: MutableRefObject<RoomRect[]>;
  deliveriesRef: MutableRefObject<Delivery[]>;
  deliveryLayerRef: MutableRefObject<Container | null>;
  prevAssignRef: MutableRefObject<Set<string>>;
  agentPosRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  spriteMapRef: MutableRefObject<Map<string, number>>;
  ceoMeetingSeatsRef: MutableRefObject<Array<{ x: number; y: number }>>;
  totalHRef: MutableRefObject<number>;
  officeWRef: MutableRefObject<number>;
  ceoPosRef: MutableRefObject<{ x: number; y: number }>;
  ceoSpriteRef: MutableRefObject<Container | null>;
  crownRef: MutableRefObject<Text | null>;
  highlightRef: MutableRefObject<Graphics | null>;
  ceoOfficeRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  breakRoomRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  breakAnimItemsRef: MutableRefObject<BreakAnimItem[]>;
  subCloneAnimItemsRef: MutableRefObject<SubCloneAnimItem[]>;
  subCloneBurstParticlesRef: MutableRefObject<SubCloneBurstParticle[]>;
  subCloneSnapshotRef: MutableRefObject<Map<string, { parentAgentId: string; x: number; y: number }>>;
  breakSteamParticlesRef: MutableRefObject<Container | null>;
  breakBubblesRef: MutableRefObject<Container[]>;
  wallClocksRef: MutableRefObject<WallClockVisual[]>;
  wallClockSecondRef: MutableRefObject<number>;
  setSceneRevision: Dispatch<SetStateAction<number>>;
}
