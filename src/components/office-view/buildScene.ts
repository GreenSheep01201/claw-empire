import { type Container } from "pixi.js";
import { buildSpriteMap } from "../AgentAvatar";
import {
  BREAK_ROOM_GAP,
  BREAK_ROOM_H,
  CEO_ZONE_H,
  COLS_PER_ROW,
  HALLWAY_H,
  ROOM_PAD,
  SLOT_H,
  SLOT_W,
  detachNode,
} from "./model";
import { DEFAULT_BREAK_THEME, DEFAULT_CEO_THEME, applyOfficeThemeMode } from "./themes-locale";
import type { BuildOfficeSceneContext } from "./buildScene-types";
import { buildCeoAndHallway } from "./buildScene-ceo-hallway";
import { buildDepartmentRooms } from "./buildScene-departments";
import { buildBreakRoom } from "./buildScene-break-room";
import { buildFinalLayers } from "./buildScene-final-layers";

export function buildOfficeScene(context: BuildOfficeSceneContext): void {
  const {
    appRef,
    texturesRef,
    dataRef,
    cbRef,
    activeMeetingTaskIdRef,
    meetingMinutesOpenRef,
    localeRef,
    themeRef,
    animItemsRef,
    roomRectsRef,
    deliveriesRef,
    deliveryLayerRef,
    prevAssignRef,
    agentPosRef,
    spriteMapRef,
    ceoMeetingSeatsRef,
    totalHRef,
    officeWRef,
    ceoPosRef,
    ceoSpriteRef,
    crownRef,
    highlightRef,
    ceoOfficeRectRef,
    breakRoomRectRef,
    breakAnimItemsRef,
    subCloneAnimItemsRef,
    subCloneBurstParticlesRef,
    subCloneSnapshotRef,
    breakSteamParticlesRef,
    breakBubblesRef,
    wallClocksRef,
    wallClockSecondRef,
    setSceneRevision,
  } = context;

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
  subCloneAnimItemsRef.current = [];
  subCloneBurstParticlesRef.current = [];
  breakBubblesRef.current = [];
  breakSteamParticlesRef.current = null;
  wallClocksRef.current = [];
  wallClockSecondRef.current = -1;
  ceoOfficeRectRef.current = null;
  breakRoomRectRef.current = null;
  ceoMeetingSeatsRef.current = [];

  const {
    departments,
    agents,
    tasks,
    subAgents,
    unreadAgentIds: unread,
    customDeptThemes: customThemes,
  } = dataRef.current;

  const previousSubSnapshot = subCloneSnapshotRef.current;
  const currentWorkingSubIds = new Set(subAgents.filter((sub) => sub.status === "working").map((sub) => sub.id));
  const addedWorkingSubIds = new Set<string>();
  for (const sub of subAgents) {
    if (sub.status !== "working") continue;
    if (!previousSubSnapshot.has(sub.id)) addedWorkingSubIds.add(sub.id);
  }

  const removedSubBurstsByParent = new Map<string, Array<{ x: number; y: number }>>();
  for (const [subId, prev] of previousSubSnapshot.entries()) {
    if (currentWorkingSubIds.has(subId)) continue;
    const list = removedSubBurstsByParent.get(prev.parentAgentId) ?? [];
    list.push({ x: prev.x, y: prev.y });
    removedSubBurstsByParent.set(prev.parentAgentId, list);
  }
  const nextSubSnapshot = new Map<string, { parentAgentId: string; x: number; y: number }>();

  const activeLocale = localeRef.current;
  const isDark = themeRef.current === "dark";
  applyOfficeThemeMode(isDark);
  const ceoTheme = customThemes?.ceoOffice ?? DEFAULT_CEO_THEME;
  const breakTheme = customThemes?.breakRoom ?? DEFAULT_BREAK_THEME;

  const spriteMap = buildSpriteMap(agents);
  spriteMapRef.current = spriteMap;

  const OFFICE_W = officeWRef.current;
  const deptCount = departments.length || 1;
  const baseRoomW = COLS_PER_ROW * SLOT_W + ROOM_PAD * 2;
  const roomGap = 12;
  let gridCols = Math.min(deptCount, 3);
  while (gridCols > 1 && gridCols * baseRoomW + (gridCols - 1) * roomGap + 24 > OFFICE_W) {
    gridCols -= 1;
  }

  const gridRows = Math.ceil(deptCount / gridCols);
  const agentsPerDept = departments.map((dept) => agents.filter((agent) => agent.department_id === dept.id));
  const maxAgents = Math.max(1, ...agentsPerDept.map((deptAgents) => deptAgents.length));
  const agentRows = Math.ceil(maxAgents / COLS_PER_ROW);

  const totalRoomSpace = OFFICE_W - 24 - (gridCols - 1) * roomGap;
  const roomW = Math.max(baseRoomW, Math.floor(totalRoomSpace / gridCols));
  const roomH = Math.max(170, agentRows * SLOT_H + 44);
  const deptStartY = CEO_ZONE_H + HALLWAY_H;
  const breakRoomY = deptStartY + gridRows * (roomH + roomGap) + BREAK_ROOM_GAP;
  const totalH = breakRoomY + BREAK_ROOM_H + 30;
  const roomStartX = (OFFICE_W - (gridCols * roomW + (gridCols - 1) * roomGap)) / 2;
  totalHRef.current = totalH;

  app.renderer.resize(OFFICE_W, totalH);

  buildCeoAndHallway({
    app,
    OFFICE_W,
    totalH,
    breakRoomY,
    isDark,
    activeLocale,
    ceoTheme,
    activeMeetingTaskId: activeMeetingTaskIdRef.current,
    onOpenActiveMeetingMinutes: meetingMinutesOpenRef.current,
    agents,
    tasks,
    deliveriesRef,
    ceoMeetingSeatsRef,
    wallClocksRef,
    ceoOfficeRectRef,
  });

  buildDepartmentRooms({
    app,
    textures,
    departments,
    agents,
    tasks,
    subAgents,
    unread,
    customThemes,
    activeLocale,
    gridCols,
    roomStartX,
    roomW,
    roomH,
    roomGap,
    deptStartY,
    agentRows,
    spriteMap,
    cbRef,
    roomRectsRef,
    agentPosRef,
    animItemsRef,
    subCloneAnimItemsRef,
    subCloneBurstParticlesRef,
    wallClocksRef,
    removedSubBurstsByParent,
    addedWorkingSubIds,
    nextSubSnapshot,
    patrolAgentIds: dataRef.current.patrolAgentIds,
  });
  subCloneSnapshotRef.current = nextSubSnapshot;

  buildBreakRoom({
    app,
    textures,
    agents,
    spriteMap,
    activeLocale,
    breakTheme,
    isDark,
    breakRoomY,
    OFFICE_W,
    cbRef,
    breakAnimItemsRef,
    breakBubblesRef,
    breakSteamParticlesRef,
    breakRoomRectRef,
    wallClocksRef,
    agentPosRef,
  });

  buildFinalLayers({
    app,
    textures,
    tasks,
    ceoPosRef,
    agentPosRef,
    deliveriesRef,
    deliveryLayerRef,
    highlightRef,
    ceoSpriteRef,
    crownRef,
    prevAssignRef,
    setSceneRevision,
  });
}
