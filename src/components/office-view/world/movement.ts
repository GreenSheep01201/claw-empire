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

/** Clearance kept around a walker so straight lines don't graze wall corners (in tiles). */
const LOS_MARGIN = 0.3;
const LOS_STEP = 0.2;

/** True when a walker can go straight from one tile centre to the other without touching a wall. */
export function hasLineOfSight(map: OfficeMap, from: TilePoint, to: TilePoint): boolean {
  const ax = from.col + 0.5;
  const ay = from.row + 0.5;
  const bx = to.col + 0.5;
  const by = to.row + 0.5;
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / LOS_STEP));
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps;
    const y = ay + ((by - ay) * i) / steps;
    for (const [ox, oy] of [
      [-LOS_MARGIN, -LOS_MARGIN],
      [LOS_MARGIN, -LOS_MARGIN],
      [-LOS_MARGIN, LOS_MARGIN],
      [LOS_MARGIN, LOS_MARGIN],
    ]) {
      if (!isWalkableTile(map, Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
  }
  return true;
}

/** Drops waypoints a walker can skip in a straight line, so it turns only at real corners. */
export function smoothPath(map: OfficeMap, path: TilePoint[]): TilePoint[] {
  if (path.length <= 2) return path;
  const smooth = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let next = anchor + 1;
    for (let candidate = path.length - 1; candidate > anchor + 1; candidate--) {
      if (hasLineOfSight(map, path[anchor], path[candidate])) {
        next = candidate;
        break;
      }
    }
    smooth.push(path[next]);
    anchor = next;
  }
  return smooth;
}
