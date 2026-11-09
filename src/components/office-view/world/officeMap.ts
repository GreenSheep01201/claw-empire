/**
 * The walkable office floor, generated from the user's poles.
 *
 *   ┌──────────── CEO office ────────────┬──── meeting room ────┐   top band
 *   ├────────────────── corridor ────────┴──────────────────────┤
 *   │ spine │ pole │ pole │ pole                                 │   pole bands (3 per band)
 *   │       ├──────────── corridor ─────────────────────────────┤
 *   │       │ pole │ …                                           │
 *   │       ├──────────── corridor ─────────────────────────────┤
 *   │       │ break room                                        │   last band
 *   └───────┴───────────────────────────────────────────────────┘
 *
 * Rooms sit side by side and share walls. Every room opens on the corridor
 * above it (the top band opens downwards), and a vertical spine on the left
 * links all corridors, so the whole floor is one connected walk.
 */

export type MapTile = "wall" | "floor" | "door";

export type RoomKind = "ceo" | "meeting" | "pole" | "break";

export interface TilePoint {
  col: number;
  row: number;
}

export interface MapRoom {
  id: string;
  kind: RoomKind;
  poleId?: string;
  /** Outer rectangle in tiles, walls included. */
  col: number;
  row: number;
  width: number;
  height: number;
  /** Door tiles (walkable) in the room's wall. */
  door: TilePoint[];
  /** Where an agent sits (pole: one per agent, meeting: table seats, break: rest spots). */
  seats: TilePoint[];
}

export interface OfficeMap {
  cols: number;
  rows: number;
  tileSize: number;
  tiles: MapTile[][];
  rooms: MapRoom[];
  spawn: TilePoint;
}

export interface OfficeMapInput {
  poles: { id: string; seats: number }[];
  tileSize?: number;
}

const DESK_COLS = 3;
/** A desk is 3 tiles wide plus one tile of aisle. */
const DESK_SLOT_W = 4;
/** Seat row, desk row, aisle row. */
const DESK_ROW_H = 3;
const POLES_PER_BAND = 3;
const CORRIDOR_H = 3;
const SPINE_W = 3;
const DOOR_W = 2;
const MEETING_SEATS = 6;
const BREAK_SPOTS = 4;

const POLE_INTERIOR_W = DESK_COLS * DESK_SLOT_W + 1;
const TOP_BAND_INTERIOR_H = 7;
const BREAK_INTERIOR_H = 5;

interface RoomDraft {
  id: string;
  kind: RoomKind;
  poleId?: string;
  width: number;
  height: number;
  seatCount: number;
  doorSide: "top" | "bottom";
}

function poleRoomHeight(seats: number): number {
  const deskRows = Math.max(1, Math.ceil(seats / DESK_COLS));
  // One free row under the back wall for wall decor, then the desk rows.
  return 2 + 1 + deskRows * DESK_ROW_H + 1;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function isWalkableTile(map: Pick<OfficeMap, "tiles">, col: number, row: number): boolean {
  const tile = map.tiles[row]?.[col];
  return tile === "floor" || tile === "door";
}

export function generateOfficeMap({ poles, tileSize = 32 }: OfficeMapInput): OfficeMap {
  const topBand: RoomDraft[] = [
    { id: "ceo", kind: "ceo", width: 18, height: TOP_BAND_INTERIOR_H + 2, seatCount: 0, doorSide: "bottom" },
    {
      id: "meeting",
      kind: "meeting",
      width: 14,
      height: TOP_BAND_INTERIOR_H + 2,
      seatCount: MEETING_SEATS,
      doorSide: "bottom",
    },
  ];
  const poleBands: RoomDraft[][] = chunk(poles, POLES_PER_BAND).map((band) =>
    band.map((pole) => ({
      id: `pole:${pole.id}`,
      kind: "pole" as const,
      poleId: pole.id,
      width: POLE_INTERIOR_W + 2,
      height: poleRoomHeight(pole.seats),
      seatCount: pole.seats,
      doorSide: "top" as const,
    })),
  );
  const breakBand: RoomDraft[] = [
    {
      id: "break",
      kind: "break",
      width: 16,
      height: BREAK_INTERIOR_H + 2,
      seatCount: BREAK_SPOTS,
      doorSide: "top",
    },
  ];
  const lowerBands = [...poleBands, breakBand];

  // Width: the widest band; lower bands start after the spine.
  const bandWidth = (band: RoomDraft[]) => band.reduce((sum, room) => sum + room.width - 1, 1);
  const cols = Math.max(bandWidth(topBand), ...lowerBands.map((band) => SPINE_W + 1 + bandWidth(band) - 1));

  const placed: MapRoom[] = [];
  const corridors: { top: number; bottom: number }[] = [];
  let rowCursor = 0;

  const placeBand = (band: RoomDraft[], startCol: number) => {
    const height = Math.max(...band.map((room) => room.height));
    let colCursor = startCol;
    band.forEach((draft, index) => {
      const isLast = index === band.length - 1;
      const width = isLast ? cols - colCursor : draft.width;
      placed.push(layoutRoom(draft, colCursor, rowCursor, width, height));
      colCursor += width - 1;
    });
    rowCursor += height;
  };

  placeBand(topBand, 0);
  for (const band of lowerBands) {
    corridors.push({ top: rowCursor, bottom: rowCursor + CORRIDOR_H - 1 });
    rowCursor += CORRIDOR_H;
    // Lower bands share their top wall row with the corridor's bottom edge.
    placeBand(band, SPINE_W + 1);
  }
  const rows = rowCursor;

  const tiles: MapTile[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "wall"));
  const carve = (col: number, row: number, tile: MapTile) => {
    if (row > 0 && row < rows - 1 && col > 0 && col < cols - 1) tiles[row][col] = tile;
  };

  for (const room of placed) {
    for (let row = room.row + 1; row < room.row + room.height - 1; row++) {
      for (let col = room.col + 1; col < room.col + room.width - 1; col++) carve(col, row, "floor");
    }
  }
  for (const corridor of corridors) {
    for (let row = corridor.top; row <= corridor.bottom; row++) {
      for (let col = 1; col < cols - 1; col++) carve(col, row, "floor");
    }
  }
  const spineTop = corridors[0]?.top ?? 0;
  const spineBottom = corridors[corridors.length - 1]?.bottom ?? 0;
  for (let row = spineTop; row <= spineBottom; row++) {
    for (let col = 1; col <= SPINE_W; col++) carve(col, row, "floor");
  }
  for (const room of placed) {
    for (const door of room.door) carve(door.col, door.row, "door");
  }

  const firstCorridor = corridors[0];
  const spawn = firstCorridor
    ? { col: Math.floor(cols / 2), row: firstCorridor.top + 1 }
    : { col: placed[0].col + 2, row: placed[0].row + 2 };

  return { cols, rows, tileSize, tiles, rooms: placed, spawn };
}

function layoutRoom(draft: RoomDraft, col: number, row: number, width: number, height: number): MapRoom {
  const doorCol = col + Math.floor((width - DOOR_W) / 2);
  const doorRow = draft.doorSide === "top" ? row : row + height - 1;
  const door = Array.from({ length: DOOR_W }, (_, i) => ({ col: doorCol + i, row: doorRow }));
  return {
    id: draft.id,
    kind: draft.kind,
    poleId: draft.poleId,
    col,
    row,
    width,
    height,
    door,
    seats: roomSeats(draft, col, row, width, height),
  };
}

function roomSeats(draft: RoomDraft, col: number, row: number, width: number, height: number): TilePoint[] {
  const seats: TilePoint[] = [];
  if (draft.kind === "pole") {
    for (let i = 0; i < draft.seatCount; i++) {
      const deskCol = i % DESK_COLS;
      const deskRow = Math.floor(i / DESK_COLS);
      // Seat in the middle of its 3-wide desk slot; the desk is the row below.
      seats.push({ col: col + 2 + deskCol * DESK_SLOT_W + 1, row: row + 3 + deskRow * DESK_ROW_H });
    }
  } else if (draft.kind === "meeting") {
    // Three seats on each side of a table centred in the room.
    const centerCol = col + Math.floor(width / 2);
    const tableRow = row + Math.floor(height / 2);
    for (let i = 0; i < 3; i++) {
      seats.push({ col: centerCol - 2 + i * 2, row: tableRow - 1 });
      seats.push({ col: centerCol - 2 + i * 2, row: tableRow + 1 });
    }
  } else if (draft.kind === "break") {
    for (let i = 0; i < draft.seatCount; i++) {
      seats.push({ col: col + 3 + i * 3, row: row + height - 3 });
    }
  }
  return seats;
}
