import type { MapRoom, OfficeMap, TilePoint } from "./officeMap";

type Size = { width: number; height: number };
type Point = { x: number; y: number };

/** The room whose interior (walls excluded) contains the tile, or null (corridor, spine, wall). */
export function roomAt(map: OfficeMap, col: number, row: number): MapRoom | null {
  return (
    map.rooms.find(
      (room) => col > room.col && col < room.col + room.width - 1 && row > room.row && row < room.row + room.height - 1,
    ) ?? null
  );
}

/** Pixel Agents wall bitmask (N=1, E=2, S=4, W=8) on the whole floor. */
export function mapWallMask(map: OfficeMap, col: number, row: number): number {
  const isWall = (c: number, r: number) => map.tiles[r]?.[c] === "wall";
  if (!isWall(col, row)) return 0;
  let mask = 0;
  if (isWall(col, row - 1)) mask |= 1;
  if (isWall(col + 1, row)) mask |= 2;
  if (isWall(col, row + 1)) mask |= 4;
  if (isWall(col - 1, row)) mask |= 8;
  return mask;
}

export function tileToPixel(map: OfficeMap, tile: TilePoint): Point {
  return { x: tile.col * map.tileSize + map.tileSize / 2, y: tile.row * map.tileSize + map.tileSize / 2 };
}

/**
 * World container offset that centres `target` (world px) in the viewport at
 * `zoom`, clamped so the camera never shows beyond the map; a map smaller than
 * the viewport is centred instead.
 */
export function cameraOffset(viewport: Size, world: Size, target: Point, zoom: number): Point {
  const axis = (view: number, size: number, focus: number) => {
    const scaled = size * zoom;
    if (scaled <= view) return Math.round((view - scaled) / 2);
    const wanted = view / 2 - focus * zoom;
    return Math.round(Math.min(0, Math.max(view - scaled, wanted)));
  };
  return { x: axis(viewport.width, world.width, target.x), y: axis(viewport.height, world.height, target.y) };
}
