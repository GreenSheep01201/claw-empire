import type { OfficeMap } from "./officeMap";
import { roomAt } from "./worldGeometry";

export type Interaction =
  | { kind: "pin"; agentId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "meeting" }
  | { kind: "pole"; poleId: string }
  | null;

export interface InteractionInput {
  map: OfficeMap;
  avatar: { x: number; y: number };
  agents: { id: string; x: number; y: number }[];
  /** Agents with a decision waiting for the CEO. */
  pinnedAgentIds: Set<string>;
  meetingActive: boolean;
}

/** How close (in tiles) the avatar must be to talk to an agent. */
const REACH_TILES = 1.6;

/** What the avatar can act on right now: pin > agent > live meeting room > pole room. */
export function interactionAt({ map, avatar, agents, pinnedAgentIds, meetingActive }: InteractionInput): Interaction {
  const reach = REACH_TILES * map.tileSize;
  let nearest: { id: string; distance: number } | null = null;
  for (const agent of agents) {
    const distance = Math.hypot(agent.x - avatar.x, agent.y - avatar.y);
    if (distance <= reach && (!nearest || distance < nearest.distance)) nearest = { id: agent.id, distance };
  }
  if (nearest && pinnedAgentIds.has(nearest.id)) return { kind: "pin", agentId: nearest.id };
  const pinned = agents.find(
    (agent) => pinnedAgentIds.has(agent.id) && Math.hypot(agent.x - avatar.x, agent.y - avatar.y) <= reach,
  );
  if (pinned) return { kind: "pin", agentId: pinned.id };
  if (nearest) return { kind: "agent", agentId: nearest.id };

  const room = roomAt(map, Math.floor(avatar.x / map.tileSize), Math.floor(avatar.y / map.tileSize));
  if (room?.kind === "meeting" && meetingActive) return { kind: "meeting" };
  if (room?.kind === "pole" && room.poleId) return { kind: "pole", poleId: room.poleId };
  return null;
}
