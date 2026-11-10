import { useEffect, useMemo, useRef } from "react";
import { Application, Assets, Container, Sprite, type Texture } from "pixi.js";
import type { Agent, Department } from "../../types";
import { localeName, useI18n } from "../../i18n";
import { buildSpriteMap } from "../AgentAvatar";
import { loadOfficeTiles } from "./officeTiles";
import { DEPT_THEME, LOCALE_TEXT, pickLocale } from "./themes-locale";
import { blendColor } from "./drawing-core";
import { generateOfficeMap } from "./world/officeMap";
import { moveWithCollision } from "./world/collision";
import { cameraOffset, tileToPixel } from "./world/worldGeometry";
import { buildWorldScene, type WorldAgent } from "./world/renderWorld";
import type { RoomTheme } from "./model";

interface OfficeWorldViewProps {
  departments: Department[];
  agents: Agent[];
  customDeptThemes?: Record<string, RoomTheme>;
  onSelectAgent: (agent: Agent) => void;
}

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
  customDeptThemes,
  onSelectAgent,
}: OfficeWorldViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { language } = useI18n();
  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;

  const map = useMemo(
    () =>
      generateOfficeMap({
        poles: departments.map((dept) => ({
          id: dept.id,
          seats: agents.filter((agent) => agent.department_id === dept.id).length,
        })),
      }),
    [departments, agents],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const app = new Application();
    const keys = new Set<string>();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping() || !MOVE_KEYS[event.code]) return;
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

      const textures: Record<string, Texture> = {};
      const spriteMap = buildSpriteMap(agents);
      await Promise.all([
        loadOfficeTiles(textures),
        Assets.load<Texture>("/sprites/ceo-lobster.png")
          .then((t) => (textures.ceo = t))
          .catch(() => {}),
        ...[...new Set(spriteMap.values())].map((num) =>
          Assets.load<Texture>(`/sprites/${num}-D-1.png`)
            .then((t) => (textures[`${num}-D-1`] = t))
            .catch(() => {}),
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
      world.addChild(scene.floor, scene.entities);
      app.stage.addChild(world);

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
        const offset = cameraOffset({ width: app.screen.width, height: app.screen.height }, worldSize, pos, ZOOM);
        world.position.set(offset.x, offset.y);
      });

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
  }, [map, agents, departments, customDeptThemes, language]);

  return (
    <div
      ref={hostRef}
      className="relative h-[calc(100dvh-140px)] min-h-[420px] w-full overflow-hidden rounded-[var(--qg-radius)] border border-[var(--th-border)]"
      style={{ background: "var(--th-bg-primary)" }}
      aria-label={pickLocale(language, LOCALE_TEXT.hint)}
      tabIndex={0}
    />
  );
}
