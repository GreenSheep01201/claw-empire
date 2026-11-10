import { describe, expect, it } from "vitest";
import { moveWithCollision } from "./collision";
import type { OfficeMap } from "./officeMap";

// 5×5 tiles of 10 px: a walled box with one interior wall tile at (2,2).
const map: OfficeMap = {
  cols: 5,
  rows: 5,
  tileSize: 10,
  tiles: [
    ["wall", "wall", "wall", "wall", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "floor", "wall", "floor", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "wall", "wall", "wall", "wall"],
  ],
  rooms: [],
  spawn: { col: 1, row: 1 },
};

describe("moveWithCollision", () => {
  it("avance librement sur le sol", () => {
    expect(moveWithCollision(map, { x: 15, y: 15 }, 5, 0, 3)).toEqual({ x: 20, y: 15 });
  });

  it("s'arrête contre un mur", () => {
    const next = moveWithCollision(map, { x: 15, y: 25 }, 6, 0, 3);
    expect(next.x).toBeLessThanOrEqual(17);
    expect(next.y).toBe(25);
  });

  it("glisse le long du mur quand on avance en diagonale", () => {
    const next = moveWithCollision(map, { x: 15, y: 25 }, 6, 4, 3);
    expect(next.x).toBeLessThanOrEqual(17);
    expect(next.y).toBe(29);
  });

  it("ne sort jamais de l'enceinte", () => {
    const next = moveWithCollision(map, { x: 15, y: 15 }, -20, -20, 3);
    expect(next.x).toBeGreaterThanOrEqual(13);
    expect(next.y).toBeGreaterThanOrEqual(13);
  });
});
