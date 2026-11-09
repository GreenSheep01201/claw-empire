import { isWalkableTile, type OfficeMap } from "./officeMap";

type Point = { x: number; y: number };

/** True when a square of half-size `radius` centred on (x, y) only covers walkable tiles. */
function fits(map: OfficeMap, x: number, y: number, radius: number): boolean {
  const size = map.tileSize;
  const left = Math.floor((x - radius) / size);
  const right = Math.floor((x + radius - 1e-6) / size);
  const top = Math.floor((y - radius) / size);
  const bottom = Math.floor((y + radius - 1e-6) / size);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      if (!isWalkableTile(map, col, row)) return false;
    }
  }
  return true;
}

/**
 * Moves an avatar by (dx, dy) in pixels. Each axis is resolved on its own, so
 * walking diagonally into a wall slides along it instead of stopping dead.
 */
export function moveWithCollision(map: OfficeMap, from: Point, dx: number, dy: number, radius: number): Point {
  let { x, y } = from;
  if (dx !== 0 && fits(map, x + dx, y, radius)) x += dx;
  if (dy !== 0 && fits(map, x, y + dy, radius)) y += dy;
  return { x, y };
}
