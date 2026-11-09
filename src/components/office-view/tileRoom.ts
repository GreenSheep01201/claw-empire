/**
 * Tile grid of one office room for the 3/4 RPG rendering.
 *
 * Row 0 is left empty: the top wall sprites are two tiles tall and their cap
 * overhangs into it. Wall autotiling follows Pixel Agents (MIT): each wall tile
 * picks one of 16 pieces from a 4×4 sheet by its 4-bit neighbour mask.
 */

/** "." = empty (cap overhang), "W" = wall, "B" = extra back-wall face, "F" = floor. */
export type RoomTile = "." | "W" | "B" | "F";

export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

export function buildRoomTiles(
  cols: number,
  rows: number,
  options: { doorCol?: number; backWallRows?: number } = {},
): RoomTile[][] {
  const backWallRows = Math.max(1, options.backWallRows ?? 1);
  const grid: RoomTile[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: RoomTile[] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0) row.push(".");
      else if (r === 1 || r === rows - 1 || c === 0 || c === cols - 1) row.push("W");
      else if (r <= backWallRows) row.push("B");
      else row.push("F");
    }
    grid.push(row);
  }
  if (options.doorCol !== undefined && options.doorCol > 0 && options.doorCol < cols - 1 && rows > 2) {
    grid[1][options.doorCol] = "F";
  }
  return grid;
}

export function wallMask(grid: RoomTile[][], col: number, row: number): number {
  if (grid[row]?.[col] !== "W") return 0;
  const isWall = (c: number, r: number) => grid[r]?.[c] === "W";
  let mask = 0;
  if (isWall(col, row - 1)) mask |= WALL_N;
  if (isWall(col + 1, row)) mask |= WALL_E;
  if (isWall(col, row + 1)) mask |= WALL_S;
  if (isWall(col - 1, row)) mask |= WALL_W;
  return mask;
}

export function wallPieceFrame(mask: number): { col: number; row: number } {
  return { col: mask % 4, row: Math.floor(mask / 4) };
}
