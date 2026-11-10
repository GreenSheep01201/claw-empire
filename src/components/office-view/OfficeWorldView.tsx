import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { Agent, Department, MeetingPresence, Task } from "../../types";
import { localeName, useI18n } from "../../i18n";
import { buildSpriteMap } from "../AgentAvatar";
import { loadOfficeTiles } from "./officeTiles";
import { DEPT_THEME, LOCALE_TEXT, pickLocale } from "./themes-locale";
import { blendColor } from "./drawing-core";
import { generateOfficeMap } from "./world/officeMap";
import { moveWithCollision } from "./world/collision";
import { cameraOffset, tileToPixel } from "./world/worldGeometry";
import { buildWorldScene, type WorldAgent } from "./world/renderWorld";
import { desiredSpot, findPath, stepAlongPath, type Spot } from "./world/movement";
import { stretchDelegationWire } from "./delegationWire";
import type { TilePoint } from "./world/officeMap";
import { interactionAt, type Interaction } from "./world/interaction";
import type { RoomTheme } from "./model";

interface OfficeWorldViewProps {
  departments: Department[];
  agents: Agent[];
  tasks: Task[];
  meetingPresence?: MeetingPresence[];
  customDeptThemes?: Record<string, RoomTheme>;
  pendingDecisionAgentIds: string[];
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

const AGENT_SPEED = 1.8;
/** Red is reserved for what waits for the CEO's approval. */
const PIN_COLOR = 0xd7263d;
/** QG accent green reserved for the mission route. */
const DELEGATION_WIRE_COLOR = 0x3f8f76;

const AVATAR_SPEED = 3.2;
const AVATAR_RADIUS = 9;
const ZOOM = 1.25;
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const keys = new Set<string>();

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

      const theme = (deptId: string) => customDeptThemes?.[deptId] ?? DEPT_THEME[deptId] ?? DEPT_THEME.dev;
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
          corridorFloor: 0xeeeae2,
          wall: 0x6b7385,
          ceoFloor: 0xe3cfa6,
          meetingFloor: 0xd9e4ea,
          breakFloor: 0xf3e3bd,
          poleFloor: (id) => blendColor(theme(id).floor1, 0xffffff, 0.15),
          poleAccent: (id) => theme(id).accent,
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
      world.scale.set(ZOOM);
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

      const avatar = new Container();
      const pos = tileToPixel(map, map.spawn);
      if (textures.ceo) {
        const sprite = new Sprite(textures.ceo);
        sprite.anchor.set(0.5, 0.85);
        sprite.scale.set(44 / textures.ceo.height);
        avatar.addChild(sprite);
      }
      scene.entities.addChild(avatar);

      const worldSize = { width: map.cols * map.tileSize, height: map.rows * map.tileSize };
      app.ticker.add((ticker) => {
        let dx = 0;
        let dy = 0;
        for (const code of keys) {
          dx += MOVE_KEYS[code][0];
          dy += MOVE_KEYS[code][1];
        }
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
          const spot = desiredSpot(
            map,
            {
              id: agent.id,
              poleId: agent.department_id,
              seatIndex: seatIndexOf.get(agent.id) ?? 0,
              status: agent.status,
            },
            live.meetingPresence,
            agent.status === "break" ? breakCount++ : 0,
          );
          const goalKey = `${spot.kind}:${spot.tile.col},${spot.tile.row}`;
          if (goalKey !== walker.goalKey) {
            const here = { col: Math.floor(walker.x / size), row: Math.floor(walker.y / size) };
            walker.path = findPath(map, here, spot.tile) ?? [spot.tile];
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
            const moving = Math.abs(walker.x - before) > 0.05;
            const facing = !moving ? walker.frames.D : walker.x < before ? walker.frames.L : walker.frames.R;
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
        const offset = cameraOffset({ width: app.screen.width, height: app.screen.height }, worldSize, pos, ZOOM);
        world.position.set(offset.x, offset.y);
      });

      if (import.meta.env.DEV) {
        // QA hook (dev builds only): inspect the map and place the avatar on a tile.
        (window as unknown as { __qgWorld?: unknown }).__qgWorld = {
          map,
          teleport: (col: number, row: number) => Object.assign(pos, tileToPixel(map, { col, row })),
        };
      }
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    })();

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      try {
        app.destroy(true, { children: true });
      } catch {
        // App may not have finished initialising.
      }
    };
  }, [map, customDeptThemes, language]);

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
    <div className="relative">
      <div
        ref={hostRef}
        className="relative h-[calc(100dvh-140px)] min-h-[420px] w-full overflow-hidden rounded-[var(--qg-radius)] border border-[var(--th-border)]"
        style={{ background: "var(--th-bg-primary)" }}
        aria-label={pickLocale(language, LOCALE_TEXT.hint)}
        tabIndex={0}
      />
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
  );
}
