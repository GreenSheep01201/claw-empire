import type { MutableRefObject } from "react";
import { Container, Graphics, Text, TextStyle, type Application, type Texture } from "pixi.js";
import type { Agent, Department, SubAgent, Task } from "../../types";
import { localeName } from "../../i18n";
import type { CallbackSnapshot, AnimItem, SubCloneAnimItem } from "./buildScene-types";
import {
  COLS_PER_ROW,
  DESK_W,
  ROOM_AGENT_TOP,
  ROOM_BACK_WALL_ROWS,
  SLOT_H,
  SLOT_W,
  TARGET_CHAR_H,
  type RoomRect,
  type SubCloneBurstParticle,
  type WallClockVisual,
  emitSubCloneSmokeBurst,
} from "./model";
import { DEPT_THEME, LOCALE_TEXT, type SupportedLocale, pickLocale } from "./themes-locale";
import { drawTileRoom, hasOfficeTiles, placeFurniture } from "./drawing-tiles";
import { TILE_PX } from "./officeTiles";
import {
  blendColor,
  contrastTextColor,
  drawAmbientGlow,
  drawBunting,
  drawCeilingLight,
  drawPictureFrame,
  drawRug,
  drawRoomAtmosphere,
  drawTiledFloor,
  drawTrashCan,
  drawWallClock,
  drawWindow,
} from "./drawing-core";
import { drawChair, drawDesk, drawPlant, drawWhiteboard } from "./drawing-furniture-a";
import { drawBookshelf } from "./drawing-furniture-b";
import { renderDeskAgentAndSubClones } from "./buildScene-department-agent";

interface BuildDepartmentRoomsParams {
  app: Application;
  textures: Record<string, Texture>;
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  subAgents: SubAgent[];
  unread?: Set<string>;
  customThemes?: Record<string, { floor1: number; floor2: number; wall: number; accent: number }>;
  activeLocale: SupportedLocale;
  gridCols: number;
  roomStartX: number;
  roomW: number;
  roomH: number;
  roomGap: number;
  deptStartY: number;
  agentRows: number;
  spriteMap: Map<string, number>;
  cbRef: MutableRefObject<CallbackSnapshot>;
  roomRectsRef: MutableRefObject<RoomRect[]>;
  agentPosRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  animItemsRef: MutableRefObject<AnimItem[]>;
  subCloneAnimItemsRef: MutableRefObject<SubCloneAnimItem[]>;
  subCloneBurstParticlesRef: MutableRefObject<SubCloneBurstParticle[]>;
  wallClocksRef: MutableRefObject<WallClockVisual[]>;
  removedSubBurstsByParent: Map<string, Array<{ x: number; y: number }>>;
  addedWorkingSubIds: Set<string>;
  nextSubSnapshot: Map<string, { parentAgentId: string; x: number; y: number }>;
}

export function buildDepartmentRooms({
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
}: BuildDepartmentRoomsParams): void {
  departments.forEach((dept, deptIdx) => {
    const col = deptIdx % gridCols;
    const row = Math.floor(deptIdx / gridCols);
    const rx = roomStartX + col * (roomW + roomGap);
    const ry = deptStartY + row * (roomH + roomGap);
    const theme = customThemes?.[dept.id] || DEPT_THEME[dept.id] || DEPT_THEME.dev;
    const deptAgents = agents.filter((agent) => agent.department_id === dept.id);
    roomRectsRef.current.push({ dept, x: rx, y: ry, w: roomW, h: roomH });

    const room = new Container();
    const frontWalls = hasOfficeTiles(textures)
      ? drawTileRoom(room, textures, {
          x: rx,
          y: ry,
          cols: Math.round(roomW / TILE_PX),
          rows: Math.round(roomH / TILE_PX),
          floorVariant: 2,
          backWallRows: ROOM_BACK_WALL_ROWS,
          floorTint: blendColor(theme.floor1, 0xffffff, 0.15),
          wallTint: blendColor(theme.wall, 0x1e2430, 0.35),
        })
      : null;
    if (!frontWalls) {
      const floorG = new Graphics();
      drawTiledFloor(floorG, rx, ry, roomW, roomH, theme.floor1, theme.floor2);
      room.addChild(floorG);
      drawRoomAtmosphere(room, rx, ry, roomW, roomH, theme.wall, theme.accent);
      const wallG = new Graphics();
      wallG.roundRect(rx, ry, roomW, roomH, 3).stroke({ width: 2.5, color: theme.wall });
      room.addChild(wallG);
    }

    if (frontWalls) {
      drawWallDecor(room, textures, rx, ry, roomW, roomH);
    } else {
      drawCeilingAndDecor(room, rx, ry, roomW, roomH, theme, deptIdx, wallClocksRef);
    }

    // QG pôle plaque: a strip of coloured tape on the back wall, clickable.
    const label = `${dept.icon || "🏢"} ${localeName(activeLocale, dept)}`;
    const signTxt = new Text({
      text: label,
      style: new TextStyle({
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: "bold",
        fontFamily: "Archivo, system-ui, sans-serif",
      }),
    });
    const signW = Math.max(96, Math.ceil(signTxt.width) + 24);
    const signY = frontWalls ? ry + TILE_PX + 10 : ry - 4;
    const signBg = new Graphics();
    signBg.rect(rx + roomW / 2 - signW / 2 + 1, signY + 2, signW, 20).fill({ color: 0x000000, alpha: 0.18 });
    signBg.rect(rx + roomW / 2 - signW / 2, signY, signW, 20).fill(theme.accent);
    signBg.eventMode = "static";
    signBg.cursor = "pointer";
    signBg.on("pointerdown", () => cbRef.current.onSelectDepartment(dept));
    room.addChild(signBg);
    signTxt.anchor.set(0.5, 0.5);
    signTxt.position.set(rx + roomW / 2, signY + 10);
    room.addChild(signTxt);

    if (deptAgents.length > 0 && !frontWalls) {
      drawRug(
        room,
        rx + roomW / 2,
        ry + 38 + (Math.min(agentRows, 2) * SLOT_H) / 2,
        roomW - 40,
        Math.min(agentRows, 2) * SLOT_H - 10,
        theme.accent,
      );
    }

    if (deptAgents.length === 0) {
      const emptyText = new Text({
        text: pickLocale(activeLocale, LOCALE_TEXT.noAssignedAgent),
        style: new TextStyle({ fontSize: 10, fill: 0x9a8a7a, fontFamily: "system-ui, sans-serif" }),
      });
      emptyText.anchor.set(0.5, 0.5);
      emptyText.position.set(rx + roomW / 2, ry + roomH / 2);
      room.addChild(emptyText);
    }

    deptAgents.forEach((agent, agentIdx) => {
      const acol = agentIdx % COLS_PER_ROW;
      const arow = Math.floor(agentIdx / COLS_PER_ROW);
      const ax = rx + (roomW - COLS_PER_ROW * SLOT_W) / 2 + acol * SLOT_W + SLOT_W / 2;
      const ay = ry + ROOM_AGENT_TOP + arow * SLOT_H;
      const isWorking = agent.status === "working";
      const isOffline = agent.status === "offline";
      const isBreak = agent.status === "break";

      const nameY = ay;
      const charFeetY = nameY + 24 + TARGET_CHAR_H;
      const deskY = charFeetY - 8;

      agentPosRef.current.set(agent.id, { x: ax, y: deskY });

      renderAgentHeader(room, ax, nameY, agent, theme.accent, unread, activeLocale);
      if (!frontWalls) drawChair(room, ax, charFeetY - TARGET_CHAR_H * 0.18, theme.accent);

      const removedBursts = removedSubBurstsByParent.get(agent.id);
      if (removedBursts && removedBursts.length > 0) {
        for (const burst of removedBursts) {
          emitSubCloneSmokeBurst(room, subCloneBurstParticlesRef.current, burst.x, burst.y, "despawn");
        }
        removedSubBurstsByParent.delete(agent.id);
      }

      if (isBreak) {
        drawBreakAwayTag(room, ax, deskY, charFeetY, activeLocale, theme.accent);
      } else {
        renderDeskAgentAndSubClones({
          room,
          textures,
          spriteMap,
          agent,
          tasks,
          subAgents,
          ax,
          deskY,
          charFeetY,
          isWorking,
          isOffline,
          cbRef,
          animItemsRef,
          subCloneAnimItemsRef,
          subCloneBurstParticlesRef,
          addedWorkingSubIds,
          nextSubSnapshot,
          themeAccent: theme.accent,
        });
      }
    });

    if (frontWalls) room.addChild(frontWalls);
    app.stage.addChild(room);
  });
}

function drawWallDecor(
  room: Container,
  textures: Record<string, Texture>,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
): void {
  const wallBottom = ry + TILE_PX * (ROOM_BACK_WALL_ROWS + 1);
  const floorBottom = ry + roomH - TILE_PX;
  placeFurniture(room, textures, "BOOKSHELF/BOOKSHELF", rx + TILE_PX + 40, wallBottom);
  placeFurniture(room, textures, "SMALL_PAINTING/SMALL_PAINTING", rx + TILE_PX + 96, wallBottom - 22);
  placeFurniture(room, textures, "WHITEBOARD/WHITEBOARD", rx + roomW - TILE_PX - 48, wallBottom - 6);
  placeFurniture(room, textures, "CLOCK/CLOCK", rx + roomW - TILE_PX - 104, wallBottom - 22);
  placeFurniture(room, textures, "PLANT/PLANT", rx + TILE_PX + 14, floorBottom);
  placeFurniture(room, textures, "PLANT_2/PLANT_2", rx + roomW - TILE_PX - 14, floorBottom);
  placeFurniture(room, textures, "BIN/BIN", rx + roomW - TILE_PX - 44, floorBottom);
}

function drawCeilingAndDecor(
  room: Container,
  rx: number,
  ry: number,
  roomW: number,
  roomH: number,
  theme: { accent: number; wall: number },
  deptIdx: number,
  wallClocksRef: MutableRefObject<WallClockVisual[]>,
): void {
  drawCeilingLight(room, rx + roomW / 2, ry + 14, theme.accent);
  drawAmbientGlow(room, rx + roomW / 2, ry + roomH / 2, roomW * 0.4, theme.accent, 0.04);
  drawBunting(
    room,
    rx + 12,
    ry + 16,
    roomW - 24,
    blendColor(theme.accent, 0xffffff, 0.2),
    blendColor(theme.wall, 0xffffff, 0.4),
    0.52,
  );

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

  drawPlant(room, rx + 8, ry + roomH - 14, deptIdx);
  drawPlant(room, rx + roomW - 12, ry + roomH - 14, deptIdx + 1);
  drawTrashCan(room, rx + roomW - 14, ry + roomH - 26);
}

function renderAgentHeader(
  room: Container,
  ax: number,
  nameY: number,
  agent: Agent,
  accent: number,
  unread: Set<string> | undefined,
  activeLocale: SupportedLocale,
): void {
  const nameText = new Text({
    text: localeName(activeLocale, agent),
    style: new TextStyle({
      fontSize: 7,
      fill: 0x3a3a4a,
      fontWeight: "bold",
      fontFamily: "system-ui, sans-serif",
    }),
  });
  nameText.anchor.set(0.5, 0);
  const nameTagW = nameText.width + 6;
  const nameTagBg = new Graphics();
  nameTagBg.roundRect(ax - nameTagW / 2, nameY, nameTagW, 12, 3).fill({ color: 0xffffff, alpha: 0.85 });
  room.addChild(nameTagBg);
  nameText.position.set(ax, nameY + 2);
  room.addChild(nameText);

  if (unread?.has(agent.id)) {
    const bangBg = new Graphics();
    const bangX = ax + nameTagW / 2 + 2;
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

  const roleText = new Text({
    text: pickLocale(
      activeLocale,
      LOCALE_TEXT.role[agent.role as keyof typeof LOCALE_TEXT.role] || {
        ko: agent.role,
        en: agent.role,
        ja: agent.role,
        zh: agent.role,
      },
    ),
    style: new TextStyle({
      fontSize: 6,
      fill: contrastTextColor(accent),
      fontFamily: "system-ui, sans-serif",
    }),
  });
  roleText.anchor.set(0.5, 0.5);
  const roleTagW = roleText.width + 5;
  const roleTagBg = new Graphics();
  roleTagBg.roundRect(ax - roleTagW / 2, nameY + 13, roleTagW, 9, 2).fill({ color: accent, alpha: 0.82 });
  room.addChild(roleTagBg);
  roleText.position.set(ax, nameY + 17.5);
  room.addChild(roleText);
}

function drawBreakAwayTag(
  room: Container,
  ax: number,
  deskY: number,
  charFeetY: number,
  activeLocale: SupportedLocale,
  accent: number,
): void {
  drawDesk(room, ax - DESK_W / 2, deskY, false);
  const awayTagY = charFeetY - TARGET_CHAR_H / 2;
  const awayTagBgColor = blendColor(accent, 0x101826, 0.78);
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
    .stroke({ width: 1, color: blendColor(accent, 0xffffff, 0.2), alpha: 0.85 });
  room.addChild(awayTagBg);
  awayTag.position.set(ax, awayTagY + 0.5);
  room.addChild(awayTag);
}
