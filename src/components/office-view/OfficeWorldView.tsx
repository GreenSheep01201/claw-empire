import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";
import type { Agent, CeoOfficeCall, CrossDeptDelivery, Department, MeetingPresence, Task } from "../../types";
import { localeName, useI18n } from "../../i18n";
import { buildSpriteMap } from "../AgentAvatar";
import { loadOfficeTiles } from "./officeTiles";
import { DEPT_THEME, LOCALE_TEXT, pickLocale } from "./themes-locale";
import { blendColor } from "./drawing-core";
import { generateOfficeMap, isWalkableTile } from "./world/officeMap";
import { moveWithCollision } from "./world/collision";
import { cameraOffset, screenToTile, stepZoom, tileToPixel, ZOOM_LEVELS } from "./world/worldGeometry";
import { buildWorldScene, type WorldAgent } from "./world/renderWorld";
import { desiredSpot, findPath, smoothPath, stepAlongPath, type Spot } from "./world/movement";
import { stretchDelegationWire } from "./delegationWire";
import type { TilePoint } from "./world/officeMap";
import { interactionAt, type Interaction } from "./world/interaction";
import { applyOfficeEvents, type ErrandState } from "./world/errands";
import { agentFatigue } from "./world/fatigue";
import { useCliUsage } from "./useCliUsage";
import CliUsagePanel from "./CliUsagePanel";
import type { RoomTheme } from "./model";

interface OfficeWorldViewProps {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  meetingPresence?: MeetingPresence[];
  customDeptThemes?: Record<string, RoomTheme>;
  pendingDecisionAgentIds: string[];
  theme: "light" | "dark";
  crossDeptDeliveries?: CrossDeptDelivery[];
  ceoOfficeCalls?: CeoOfficeCall[];
  onCrossDeptDeliveryProcessed?: (id: string) => void;
  onCeoOfficeCallProcessed?: (id: string) => void;
  activeMeetingTaskId: string | null;
  onSelectAgent: (agent: Agent) => void;
  onOpenChat: (agent: Agent) => void;
  onSelectDepartment: (department: Department) => void;
  onOpenDecisionInbox: () => void;
  onOpenMeetingMinutes: (taskId: string) => void;
}

interface Walker {
  node: Container;
  sprite: Sprite | null;
  frames: { D?: Texture; L?: Texture; R?: Texture };
  x: number;
  y: number;
  path: TilePoint[];
  index: number;
  goalKey: string;
  spot: Spot | null;
}

/** px per frame at 60 fps; a little slower than the avatar so you can catch up with them. */
const AGENT_SPEED = 3;
/** Stride bounce while walking (px). */
const STEP_BOUNCE = 2.5;
/** Red is reserved for what waits for the CEO's approval. */
const PIN_COLOR = 0xd7263d;
/** QG accent green reserved for the mission route. */
const DELEGATION_WIRE_COLOR = 0x3f8f76;

const AVATAR_SPEED = 3.2;
const AVATAR_RADIUS = 9;
const ZOOM_STORAGE_KEY = "qg.officeZoom";

function initialZoom(): number {
  try {
    const stored = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    if ((ZOOM_LEVELS as readonly number[]).includes(stored)) return stored;
  } catch {
    // Storage unavailable: fall back to the default.
  }
  return window.innerWidth < 640 ? 0.6 : 0.75;
}
const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(
    el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable),
  );
}

/**
 * The office as one walkable floor (Gather-like): you move the CEO avatar
 * through corridors and doors, walls block, the camera follows.
 */
export default function OfficeWorldView({
  departments,
  agents,
  tasks,
  meetingPresence,
  customDeptThemes,
  pendingDecisionAgentIds,
  theme,
  crossDeptDeliveries,
  ceoOfficeCalls,
  onCrossDeptDeliveryProcessed,
  onCeoOfficeCallProcessed,
  activeMeetingTaskId,
  onSelectAgent,
  onOpenChat,
  onSelectDepartment,
  onOpenDecisionInbox,
  onOpenMeetingMinutes,
}: OfficeWorldViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { language, t } = useI18n();
  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;
  // Movement input shared by keyboard, the touch pad and click-to-walk.
  const keysRef = useRef(new Set<string>());
  // Survives scene rebuilds (theme or colour changes) so you stay where you were.
  const avatarPosRef = useRef<{ x: number; y: number } | null>(null);
  const { cliStatus, cliUsage, cliUsageRef, refreshing, handleRefreshUsage } = useCliUsage(tasks);
  // Rebuild on actual colour changes, not on every new object identity.
  const themesKey = JSON.stringify(customDeptThemes ?? {});
  const themesRef = useRef(customDeptThemes);
  themesRef.current = customDeptThemes;
  const [zoom, setZoom] = useState(initialZoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const changeZoom = (direction: 1 | -1) =>
    setZoom((current) => {
      const next = stepZoom(current, direction);
      try {
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
      } catch {
        // Not persisted: zoom still applies for this session.
      }
      return next;
    });
  const changeZoomRef = useRef(changeZoom);
  changeZoomRef.current = changeZoom;
  const walkToRef = useRef<(tile: TilePoint) => void>(() => {});
  const avatarDotRef = useRef<SVGCircleElement>(null);
  const [coarsePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
  );
  // Live data read every frame, so status changes move agents without rebuilding the floor.
  const liveRef = useRef({ agents, tasks, meetingPresence: meetingPresence ?? [], pinned: new Set<string>() });
  liveRef.current = {
    agents,
    tasks,
    meetingPresence: meetingPresence ?? [],
    pinned: new Set(pendingDecisionAgentIds),
  };
  const [prompt, setPrompt] = useState<Interaction>(null);
  const promptRef = useRef<Interaction>(null);
  // Acting on the current prompt (Enter / E / click) goes through the app's existing panels.
  const actRef = useRef<() => void>(() => {});
  actRef.current = () => {
    const current = promptRef.current;
    if (!current) return;
    if (current.kind === "pin") onOpenDecisionInbox();
    else if (current.kind === "meeting" && activeMeetingTaskId) onOpenMeetingMinutes(activeMeetingTaskId);
    else if (current.kind === "agent") {
      const agent = agents.find((candidate) => candidate.id === current.agentId);
      if (agent) onOpenChat(agent);
    } else if (current.kind === "pole") {
      const dept = departments.find((candidate) => candidate.id === current.poleId);
      if (dept) onSelectDepartment(dept);
    }
  };
  const meetingActiveRef = useRef(false);
  meetingActiveRef.current = Boolean(activeMeetingTaskId);

  // The floor only depends on which agents sit in which pole.
  const layoutKey = useMemo(
    () =>
      departments
        .map(
          (dept) =>
            `${dept.id}:${agents
              .filter((a) => a.department_id === dept.id)
              .map((a) => a.id)
              .join(",")}`,
        )
        .join("|"),
    [departments, agents],
  );
  const layoutRef = useRef({ departments, agents });
  layoutRef.current = { departments, agents };
  const map = useMemo(
    () =>
      generateOfficeMap({
        poles: layoutRef.current.departments.map((dept) => ({
          id: dept.id,
          seats: layoutRef.current.agents.filter((agent) => agent.department_id === dept.id).length,
        })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the seating layout changes
    [layoutKey],
  );

  // Errands (visits to a colleague, calls to the CEO office) and speech bubbles.
  const errandsRef = useRef<ErrandState>({ errands: new Map(), bubbles: [] });
  useEffect(() => {
    if (!crossDeptDeliveries?.length && !ceoOfficeCalls?.length) return;
    const { departments, agents } = layoutRef.current;
    const seatOf = (agentId: string) => {
      const agent = agents.find((candidate) => candidate.id === agentId);
      if (!agent?.department_id) return undefined;
      const index = agents.filter((a) => a.department_id === agent.department_id).findIndex((a) => a.id === agentId);
      const room = map.rooms.find((candidate) => candidate.poleId === agent.department_id);
      return departments.some((dept) => dept.id === agent.department_id) ? room?.seats[index] : undefined;
    };
    const result = applyOfficeEvents(
      map,
      errandsRef.current,
      { deliveries: crossDeptDeliveries ?? [], calls: ceoOfficeCalls ?? [] },
      seatOf,
      Date.now(),
    );
    errandsRef.current = result.state;
    for (const id of result.processedDeliveryIds) onCrossDeptDeliveryProcessed?.(id);
    for (const id of result.processedCallIds) onCeoOfficeCallProcessed?.(id);
  }, [crossDeptDeliveries, ceoOfficeCalls, map, onCrossDeptDeliveryProcessed, onCeoOfficeCallProcessed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const keys = keysRef.current;
    keys.clear();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping()) return;
      if ((event.code === "Enter" || event.code === "KeyE") && promptRef.current) {
        event.preventDefault();
        actRef.current();
        return;
      }
      if (!MOVE_KEYS[event.code]) return;
      event.preventDefault();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    let wheelAccumulator = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      wheelAccumulator += event.deltaY;
      if (Math.abs(wheelAccumulator) < 60) return;
      changeZoomRef.current(wheelAccumulator < 0 ? 1 : -1);
      wheelAccumulator = 0;
    };

    void (async () => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      (app.canvas as HTMLCanvasElement).style.imageRendering = "pixelated";
      host.appendChild(app.canvas);

      const { agents, departments } = layoutRef.current;
      const textures: Record<string, Texture> = {};
      const spriteMap = buildSpriteMap(agents);
      await Promise.all([
        loadOfficeTiles(textures),
        Assets.load<Texture>("/sprites/ceo-lobster.png")
          .then((t) => (textures.ceo = t))
          .catch(() => {}),
        ...[...new Set(spriteMap.values())].flatMap((num) =>
          ["D", "L", "R"].map((dir) =>
            Assets.load<Texture>(`/sprites/${num}-${dir}-1.png`)
              .then((t) => (textures[`${num}-${dir}-1`] = t))
              .catch(() => {}),
          ),
        ),
      ]);
      if (disposed) return;

      const isDark = theme === "dark";
      const roomTheme = (deptId: string) => themesRef.current?.[deptId] ?? DEPT_THEME[deptId] ?? DEPT_THEME.dev;
      const worldAgents: WorldAgent[] = agents
        .filter((agent) => agent.department_id)
        .map((agent) => ({
          id: agent.id,
          poleId: agent.department_id!,
          name: language === "ko" ? agent.name_ko || agent.name : agent.name,
          texture: textures[`${spriteMap.get(agent.id)}-D-1`] ?? null,
          dimmed: agent.status === "offline",
        }));
      const deptById = new Map(departments.map((dept) => [dept.id, dept]));
      const scene = buildWorldScene(
        textures,
        map,
        {
          // Floor sprites are grayscale: the tint is the floor colour (night = dimmed).
          corridorFloor: isDark ? 0x4a4f4d : 0xeeeae2,
          wall: isDark ? 0x3d4350 : 0x6b7385,
          ceoFloor: isDark ? 0x6b5b43 : 0xd9c39b,
          meetingFloor: isDark ? 0x55606a : 0xd9e4ea,
          breakFloor: isDark ? 0x6a6150 : 0xf1e6cf,
          poleFloor: (id) => blendColor(roomTheme(id).floor1, isDark ? 0x1a1d1c : 0xffffff, isDark ? 0.55 : 0.15),
          poleAccent: (id) => roomTheme(id).accent,
        },
        worldAgents,
        {
          ceo: pickLocale(language, LOCALE_TEXT.ceoOffice),
          meeting: pickLocale(language, LOCALE_TEXT.collabTable),
          break: pickLocale(language, LOCALE_TEXT.breakRoom),
          pole: (id) => {
            const dept = deptById.get(id);
            return dept ? `${dept.icon ?? ""} ${localeName(language, dept)}`.trim() : id;
          },
        },
      );
      for (const [agentId, node] of scene.agentNodes) {
        const agent = agents.find((candidate) => candidate.id === agentId);
        if (agent) node.on("pointerdown", () => onSelectAgentRef.current(agent));
      }

      const world = new Container();
      const overlay = new Container();
      world.addChild(scene.floor, scene.entities, overlay);
      app.stage.addChild(world);

      const size = map.tileSize;
      const seatIndexOf = new Map<string, number>();
      for (const dept of departments) {
        agents.filter((a) => a.department_id === dept.id).forEach((a, index) => seatIndexOf.set(a.id, index));
      }
      const walkers = new Map<string, Walker>();
      for (const [agentId, node] of scene.agentNodes) {
        const num = spriteMap.get(agentId);
        const first = node.children[0];
        walkers.set(agentId, {
          node,
          sprite: first instanceof Sprite ? first : null,
          frames: { D: textures[`${num}-D-1`], L: textures[`${num}-L-1`], R: textures[`${num}-R-1`] },
          x: node.position.x,
          // Seated feet sit 10 px below the seat row; the walker tracks the tile centre.
          y: node.position.y - 10 - size / 2,
          path: [],
          index: 0,
          goalKey: "",
          spot: null,
        });
      }
      let knownAssignments: Set<string> | null = null;
      const pins = new Map<string, Graphics>();
      const bubbleNodes = new Map<string, Container>();
      const snores = new Map<string, Text>();

      const avatar = new Container();
      const remembered = avatarPosRef.current;
      const pos =
        remembered &&
        isWalkableTile(map, Math.floor(remembered.x / map.tileSize), Math.floor(remembered.y / map.tileSize))
          ? { ...remembered }
          : tileToPixel(map, map.spawn);
      avatarPosRef.current = pos;
      if (textures.ceo) {
        const sprite = new Sprite(textures.ceo);
        sprite.anchor.set(0.5, 0.85);
        sprite.scale.set(44 / textures.ceo.height);
        avatar.addChild(sprite);
      }
      scene.entities.addChild(avatar);

      const worldSize = { width: map.cols * map.tileSize, height: map.rows * map.tileSize };

      // Click / tap a floor tile to walk there (Gather-like); the keyboard takes over at once.
      let route: { path: TilePoint[]; index: number } | null = null;
      const marker = new Graphics();
      marker.circle(0, 0, 9).stroke({ width: 2, color: DELEGATION_WIRE_COLOR, alpha: 0.9 });
      marker.visible = false;
      overlay.addChild(marker);
      walkToRef.current = (tile) => {
        if (!isWalkableTile(map, tile.col, tile.row)) return;
        const here = { col: Math.floor(pos.x / map.tileSize), row: Math.floor(pos.y / map.tileSize) };
        const found = findPath(map, here, tile);
        if (!found) return;
        route = { path: smoothPath(map, found), index: 0 };
        const target = tileToPixel(map, tile);
        marker.position.set(target.x, target.y);
        marker.visible = true;
      };
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointertap", (event) => {
        if (event.target !== app.stage) return; // agents handle their own taps
        walkToRef.current(screenToTile(map, event.global, world.position, zoomRef.current));
      });
      app.ticker.add((ticker) => {
        let dx = 0;
        let dy = 0;
        for (const code of keys) {
          dx += MOVE_KEYS[code][0];
          dy += MOVE_KEYS[code][1];
        }
        if (dx !== 0 || dy !== 0) route = null;
        if (route) {
          const before = pos.x;
          const step = stepAlongPath(
            { ...pos, index: route.index },
            route.path,
            AVATAR_SPEED * ticker.deltaTime,
            map.tileSize,
          );
          pos.x = step.x;
          pos.y = step.y;
          route.index = step.index;
          if (pos.x !== before) avatar.scale.x = pos.x < before ? -1 : 1;
          if (step.arrived) route = null;
        }
        marker.visible = route !== null;
        if (dx !== 0 || dy !== 0) {
          const length = Math.hypot(dx, dy);
          const step = AVATAR_SPEED * ticker.deltaTime;
          const next = moveWithCollision(map, pos, (dx / length) * step, (dy / length) * step, AVATAR_RADIUS);
          pos.x = next.x;
          pos.y = next.y;
          if (dx !== 0) avatar.scale.x = dx < 0 ? -1 : 1;
        }
        avatar.position.set(pos.x, pos.y);
        avatar.zIndex = pos.y + 1;

        // Agents walk the corridors to wherever they should be (desk, meeting, break).
        const live = liveRef.current;
        let breakCount = 0;
        for (const agent of live.agents) {
          const walker = walkers.get(agent.id);
          if (!walker || !agent.department_id) continue;
          // Out of CLI quota: tired agents redden, exhausted ones go rest on the break-room sofa.
          const fatigue = agentFatigue(cliUsageRef.current, agent.cli_provider);
          const spot = desiredSpot(
            map,
            {
              id: agent.id,
              poleId: agent.department_id,
              seatIndex: seatIndexOf.get(agent.id) ?? 0,
              status: fatigue === "exhausted" ? "break" : agent.status,
            },
            live.meetingPresence,
            agent.status === "break" || fatigue === "exhausted" ? breakCount++ : 0,
            Date.now(),
            errandsRef.current.errands.get(agent.id),
          );
          const goalKey = `${spot.kind}:${spot.tile.col},${spot.tile.row}`;
          if (goalKey !== walker.goalKey) {
            const here = { col: Math.floor(walker.x / size), row: Math.floor(walker.y / size) };
            const found = findPath(map, here, spot.tile);
            walker.path = found ? smoothPath(map, found) : [spot.tile];
            walker.index = 0;
            walker.goalKey = goalKey;
            walker.spot = spot;
          }
          const before = walker.x;
          const step = stepAlongPath(walker, walker.path, AGENT_SPEED * ticker.deltaTime, size);
          walker.x = step.x;
          walker.y = step.y;
          walker.index = step.index;
          const seated = step.arrived && walker.spot?.kind === "desk";
          // Seated agents sit behind their desk; walking agents stand on the tile.
          const feetY = seated ? (walker.spot!.tile.row + 1) * size + 10 : walker.y + 12;
          walker.node.position.set(walker.x, feetY);
          walker.node.zIndex = feetY;
          if (walker.sprite) {
            const moving = !step.arrived;
            walker.sprite.tint = fatigue === "fresh" ? 0xffffff : 0xff9999;
            walker.sprite.alpha = agent.status === "offline" ? 0.45 : fatigue === "exhausted" ? 0.85 : 1;
            // A light stride bounce so walking reads as walking, not sliding.
            walker.sprite.y = moving ? -Math.abs(Math.sin(performance.now() / 110)) * STEP_BOUNCE : 0;
            const dx = walker.x - before;
            // Face the way you walk sideways; going up/down or standing, face the viewer.
            const facing = !moving || Math.abs(dx) < 0.3 ? walker.frames.D : dx < 0 ? walker.frames.L : walker.frames.R;
            if (facing && walker.sprite.texture !== facing) walker.sprite.texture = facing;
          }
        }

        // QG signature: a wire from you to the agent who just got a task.
        const assigned = new Set(
          live.tasks.filter((task) => task.assigned_agent_id && task.status === "in_progress").map((task) => task.id),
        );
        if (knownAssignments) {
          for (const taskId of assigned) {
            if (knownAssignments.has(taskId)) continue;
            const task = live.tasks.find((candidate) => candidate.id === taskId);
            const walker = task?.assigned_agent_id ? walkers.get(task.assigned_agent_id) : undefined;
            if (walker)
              stretchDelegationWire(app, overlay, pos, { x: walker.x, y: walker.y - 20 }, DELEGATION_WIRE_COLOR);
          }
        }
        knownAssignments = assigned;

        // Red pins above agents waiting for a decision (bobbing so they catch the eye).
        for (const [agentId, walker] of walkers) {
          let pin = pins.get(agentId);
          if (live.pinned.has(agentId)) {
            if (!pin) {
              pin = new Graphics();
              pin.circle(0, 0, 7).fill(PIN_COLOR).stroke({ width: 2, color: 0xffffff });
              pin.moveTo(-3, 5).lineTo(0, 14).lineTo(3, 5).fill(PIN_COLOR);
              overlay.addChild(pin);
              pins.set(agentId, pin);
            }
            pin.position.set(walker.x + 14, walker.node.position.y - 78 + Math.sin(performance.now() / 260) * 3);
          } else if (pin) {
            pin.destroy();
            pins.delete(agentId);
          }
        }

        // Exhausted agents doze on the sofa.
        for (const [agentId, walker] of walkers) {
          const agent = live.agents.find((candidate) => candidate.id === agentId);
          const exhausted = agent ? agentFatigue(cliUsageRef.current, agent.cli_provider) === "exhausted" : false;
          let zzz = snores.get(agentId);
          if (exhausted) {
            if (!zzz) {
              zzz = new Text({
                text: "z z",
                style: new TextStyle({
                  fontSize: 12,
                  fill: 0x5c6680,
                  fontWeight: "bold",
                  fontFamily: "Archivo, system-ui, sans-serif",
                }),
              });
              overlay.addChild(zzz);
              snores.set(agentId, zzz);
            }
            const phase = (performance.now() / 900) % 1;
            zzz.position.set(walker.x + 12, walker.node.position.y - 70 - phase * 10);
            zzz.alpha = 1 - phase;
          } else if (zzz) {
            zzz.destroy();
            snores.delete(agentId);
          }
        }

        // Speech bubbles (e.g. an agent reporting in the CEO office).
        const now = Date.now();
        const liveBubbles = errandsRef.current.bubbles.filter((bubble) => bubble.until > now);
        for (const [agentId, bubble] of bubbleNodes) {
          if (!liveBubbles.some((candidate) => candidate.agentId === agentId)) {
            bubble.destroy({ children: true });
            bubbleNodes.delete(agentId);
          }
        }
        for (const bubble of liveBubbles) {
          const walker = walkers.get(bubble.agentId);
          if (!walker) continue;
          let node = bubbleNodes.get(bubble.agentId);
          if (!node) {
            node = new Container();
            const text = new Text({
              text: bubble.text,
              style: new TextStyle({
                fontSize: 11,
                fill: 0x1e1e1e,
                fontFamily: "Archivo, system-ui, sans-serif",
                wordWrap: true,
                wordWrapWidth: 180,
              }),
            });
            text.anchor.set(0.5, 1);
            const box = new Graphics();
            box
              .roundRect(-text.width / 2 - 8, -text.height - 8, text.width + 16, text.height + 10, 6)
              .fill(0xfafaf7)
              .stroke({ width: 1, color: 0x1e1e1e, alpha: 0.25 });
            box.moveTo(-5, 2).lineTo(0, 8).lineTo(5, 2).fill(0xfafaf7);
            node.addChild(box, text);
            overlay.addChild(node);
            bubbleNodes.set(bubble.agentId, node);
          }
          node.position.set(walker.x, walker.node.position.y - 76);
        }

        // What can the avatar act on right now?
        const next = interactionAt({
          map,
          avatar: pos,
          agents: [...walkers].map(([id, walker]) => ({ id, x: walker.x, y: walker.y })),
          pinnedAgentIds: live.pinned,
          meetingActive: meetingActiveRef.current,
        });
        if (JSON.stringify(next) !== JSON.stringify(promptRef.current)) {
          promptRef.current = next;
          setPrompt(next);
        }
        world.scale.set(zoomRef.current);
        const offset = cameraOffset(
          { width: app.screen.width, height: app.screen.height },
          worldSize,
          pos,
          zoomRef.current,
        );
        world.position.set(offset.x, offset.y);
        avatarDotRef.current?.setAttribute("cx", String(pos.x / map.tileSize));
        avatarDotRef.current?.setAttribute("cy", String(pos.y / map.tileSize));
      });

      if (import.meta.env.DEV) {
        // QA hook (dev builds only): inspect the map and place the avatar on a tile.
        (window as unknown as { __qgWorld?: unknown }).__qgWorld = {
          map,
          teleport: (col: number, row: number) => Object.assign(pos, tileToPixel(map, { col, row })),
          agents: agents.map((agent) => ({ id: agent.id, name: agent.name, poleId: agent.department_id })),
          events: (events: Parameters<typeof applyOfficeEvents>[2]) => {
            errandsRef.current = applyOfficeEvents(map, errandsRef.current, events, () => undefined, Date.now()).state;
          },
        };
      }
      host.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    })();

    return () => {
      disposed = true;
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      try {
        app.destroy(true, { children: true });
      } catch {
        // App may not have finished initialising.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colours tracked by value (themesKey)
  }, [map, themesKey, language, theme]);

  const promptLabel = (() => {
    if (!prompt) return null;
    if (prompt.kind === "pin")
      return t({ ko: "의사결정 확인", en: "Review the decision", fr: "Voir la validation en attente" });
    if (prompt.kind === "meeting")
      return t({ ko: "회의록 보기", en: "Open the meeting minutes", fr: "Ouvrir le compte rendu" });
    if (prompt.kind === "agent") {
      const agent = agents.find((candidate) => candidate.id === prompt.agentId);
      return t({ ko: "대화하기", en: "Talk to", fr: "Discuter avec" }) + (agent ? ` ${agent.name}` : "");
    }
    const dept = departments.find((candidate) => candidate.id === prompt.poleId);
    return (
      t({ ko: "부서 열기", en: "Open the pole", fr: "Ouvrir le pôle" }) + (dept ? ` ${localeName(language, dept)}` : "")
    );
  })();

  return (
    <div className="space-y-4">
      <div className="relative">
        <div
          ref={hostRef}
          className="relative h-[calc(100dvh-140px)] min-h-[420px] w-full overflow-hidden rounded-[var(--qg-radius)] border border-[var(--th-border)]"
          style={{ background: "var(--th-bg-primary)" }}
          aria-label={pickLocale(language, LOCALE_TEXT.hint)}
          tabIndex={0}
        />
        <OfficeMiniMap
          map={map}
          dotRef={avatarDotRef}
          label={t({ ko: "미니맵", en: "Floor map", fr: "Plan de l'étage" })}
          onPick={(tile) => walkToRef.current(tile)}
        />
        <div
          className="absolute left-3 top-3 flex flex-col gap-1"
          role="group"
          aria-label={t({ ko: "확대/축소", en: "Zoom", fr: "Zoom" })}
        >
          <button
            type="button"
            className="qg-icon-btn"
            onClick={() => changeZoom(1)}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            aria-label={t({ ko: "확대", en: "Zoom in", fr: "Zoomer" })}
          >
            <Plus size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="qg-icon-btn"
            onClick={() => changeZoom(-1)}
            disabled={zoom <= ZOOM_LEVELS[0]}
            aria-label={t({ ko: "축소", en: "Zoom out", fr: "Dézoomer" })}
          >
            <Minus size={18} aria-hidden />
          </button>
        </div>
        {coarsePointer && (
          <MovePad
            keys={keysRef.current}
            labels={{
              up: t({ ko: "위", en: "Up", fr: "Haut" }),
              down: t({ ko: "아래", en: "Down", fr: "Bas" }),
              left: t({ ko: "왼쪽", en: "Left", fr: "Gauche" }),
              right: t({ ko: "오른쪽", en: "Right", fr: "Droite" }),
            }}
          />
        )}
        {promptLabel && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <button
              type="button"
              onClick={() => actRef.current()}
              className={`qg-btn pointer-events-auto${prompt?.kind === "pin" ? " qg-btn--pin is-pending" : " qg-btn--primary"}`}
              aria-keyshortcuts="Enter E"
            >
              <kbd className="qg-badge">{t({ ko: "Enter", en: "Enter", fr: "Entrée" })}</kbd>
              {promptLabel}
            </button>
          </div>
        )}
      </div>
      <CliUsagePanel
        cliStatus={cliStatus}
        cliUsage={cliUsage}
        language={language}
        refreshing={refreshing}
        onRefreshUsage={handleRefreshUsage}
        t={t}
      />
    </div>
  );
}

const MINIMAP_COLORS: Record<string, string> = {
  ceo: "#2f5d50",
  meeting: "#2e86ab",
  pole: "#9aa3ad",
  break: "#d9a640",
};

/** Plan of the floor in the corner: rooms, your position, click to walk there. */
function OfficeMiniMap({
  map,
  dotRef,
  label,
  onPick,
}: {
  map: ReturnType<typeof generateOfficeMap>;
  dotRef: React.RefObject<SVGCircleElement | null>;
  label: string;
  onPick: (tile: TilePoint) => void;
}) {
  // Smaller on phones so it never covers the room you are in.
  const width = typeof window !== "undefined" && window.innerWidth < 640 ? 112 : 168;
  const height = Math.round((width * map.rows) / map.cols);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${map.cols} ${map.rows}`}
      width={width}
      height={height}
      className="absolute right-3 top-3 cursor-pointer rounded-[var(--qg-radius)] border border-[var(--th-border-strong)] bg-[var(--th-bg-surface)] shadow-[var(--qg-lift)]"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onPick({
          col: Math.floor(((event.clientX - box.left) / box.width) * map.cols),
          row: Math.floor(((event.clientY - box.top) / box.height) * map.rows),
        });
      }}
    >
      {map.tiles.flatMap((row, r) =>
        row.map((tile, c) =>
          tile === "wall" ? null : (
            <rect key={`${c},${r}`} x={c} y={r} width={1} height={1} fill="var(--th-bg-surface-hover)" />
          ),
        ),
      )}
      {map.rooms.map((room) => (
        <rect
          key={room.id}
          x={room.col + 1}
          y={room.row + 1}
          width={room.width - 2}
          height={room.height - 2}
          fill={MINIMAP_COLORS[room.kind]}
          opacity={0.45}
        />
      ))}
      <circle ref={dotRef} r={1.4} fill="#d7263d" stroke="#fff" strokeWidth={0.4} />
    </svg>
  );
}

/** Touch pad: holding a direction acts like holding the arrow key. */
function MovePad({
  keys,
  labels,
}: {
  keys: Set<string>;
  labels: { up: string; down: string; left: string; right: string };
}) {
  const bind = (code: string) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      event.preventDefault();
      keys.add(code);
    },
    onPointerUp: () => keys.delete(code),
    onPointerLeave: () => keys.delete(code),
    onPointerCancel: () => keys.delete(code),
  });
  return (
    <div className="absolute bottom-20 right-3 grid grid-cols-3 gap-1" style={{ touchAction: "none" }}>
      <span />
      <button type="button" className="qg-icon-btn" aria-label={labels.up} {...bind("ArrowUp")}>
        <ChevronUp size={20} aria-hidden />
      </button>
      <span />
      <button type="button" className="qg-icon-btn" aria-label={labels.left} {...bind("ArrowLeft")}>
        <ChevronLeft size={20} aria-hidden />
      </button>
      <span />
      <button type="button" className="qg-icon-btn" aria-label={labels.right} {...bind("ArrowRight")}>
        <ChevronRight size={20} aria-hidden />
      </button>
      <span />
      <button type="button" className="qg-icon-btn" aria-label={labels.down} {...bind("ArrowDown")}>
        <ChevronDown size={20} aria-hidden />
      </button>
      <span />
    </div>
  );
}
