import { isWalkableTile, type OfficeMap, type TilePoint } from "./officeMap";

/** Shortest 4-way walk between two tiles (BFS), endpoints included; null if unreachable. */
export function findPath(map: OfficeMap, from: TilePoint, to: TilePoint): TilePoint[] | null {
  if (!isWalkableTile(map, to.col, to.row) || !isWalkableTile(map, from.col, from.row)) return null;
  const key = (tile: TilePoint) => tile.row * map.cols + tile.col;
  const previous = new Map<number, TilePoint | null>([[key(from), null]]);
  const queue: TilePoint[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current.col === to.col && current.row === to.row) {
      const path: TilePoint[] = [];
      for (let node: TilePoint | null = current; node; node = previous.get(key(node)) ?? null) path.push(node);
      return path.reverse();
    }
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { col: current.col + dc, row: current.row + dr };
      if (previous.has(key(next)) || !isWalkableTile(map, next.col, next.row)) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  return null;
}

export interface WalkerPosition {
  x: number;
  y: number;
  /** Index of the last path tile reached. */
  index: number;
}

/** Moves `distance` px along the path from the walker's position, tile centre to tile centre. */
export function stepAlongPath(
  walker: WalkerPosition,
  path: TilePoint[],
  distance: number,
  tileSize: number,
): WalkerPosition & { arrived: boolean } {
  let { x, y, index } = walker;
  let left = distance;
  while (index < path.length - 1 && left > 0) {
    const target = path[index + 1];
    const tx = target.col * tileSize + tileSize / 2;
    const ty = target.row * tileSize + tileSize / 2;
    const gap = Math.hypot(tx - x, ty - y);
    if (gap <= left) {
      x = tx;
      y = ty;
      left -= gap;
      index += 1;
    } else {
      x += ((tx - x) / gap) * left;
      y += ((ty - y) / gap) * left;
      left = 0;
    }
  }
  return { x, y, index, arrived: index >= path.length - 1 };
}

export interface PlacedAgent {
  id: string;
  poleId: string;
  /** Position of the agent among its pole's seats. */
  seatIndex: number;
  status: "idle" | "working" | "break" | "offline";
}

export interface MeetingSeat {
  agent_id: string;
  seat_index: number;
  until: number;
}

export type Spot = { kind: "desk" | "meeting" | "break" | "visit" | "ceo"; tile: TilePoint };

export interface Errand {
  kind: "visit" | "ceo";
  tile: TilePoint;
  until: number;
}

/** Where the agent should be right now: an errand wins, then a live meeting, a break, otherwise its desk. */
export function desiredSpot(
  map: OfficeMap,
  agent: PlacedAgent,
  presence: MeetingSeat[],
  breakIndex: number,
  now = Date.now(),
  errand?: Errand,
): Spot {
  if (errand && errand.until > now) return { kind: errand.kind, tile: errand.tile };
  const pole = map.rooms.find((room) => room.kind === "pole" && room.poleId === agent.poleId);
  const desk = pole?.seats[agent.seatIndex] ?? map.spawn;
  const meetingSeats = map.rooms.find((room) => room.kind === "meeting")?.seats ?? [];
  const meeting = presence.find((seat) => seat.agent_id === agent.id && seat.until > now);
  if (meeting && meetingSeats.length > 0) {
    return { kind: "meeting", tile: meetingSeats[meeting.seat_index % meetingSeats.length] };
  }
  const breakSpots = map.rooms.find((room) => room.kind === "break")?.seats ?? [];
  if (agent.status === "break" && breakSpots.length > 0) {
    return { kind: "break", tile: breakSpots[breakIndex % breakSpots.length] };
  }
  return { kind: "desk", tile: desk };
}
