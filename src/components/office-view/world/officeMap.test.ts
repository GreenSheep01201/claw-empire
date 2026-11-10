import { describe, expect, it } from "vitest";
import { generateOfficeMap, isWalkableTile, type OfficeMap } from "./officeMap";

const poles = [
  { id: "reequal", seats: 4 },
  { id: "atomic", seats: 2 },
  { id: "ubtp", seats: 3 },
  { id: "finance", seats: 1 },
];

function reachableFrom(map: OfficeMap, start: { col: number; row: number }): Set<string> {
  const seen = new Set<string>([`${start.col},${start.row}`]);
  const queue = [start];
  while (queue.length > 0) {
    const { col, row } = queue.shift()!;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { col: col + dc, row: row + dr };
      const key = `${next.col},${next.row}`;
      if (!seen.has(key) && isWalkableTile(map, next.col, next.row)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("generateOfficeMap", () => {
  const map = generateOfficeMap({ poles });

  it("crée une salle par pôle, plus le bureau du CEO, la salle de réunion et la salle de pause", () => {
    const kinds = map.rooms.map((room) => room.kind).sort();
    expect(kinds).toEqual(["break", "ceo", "meeting", "pole", "pole", "pole", "pole"]);
    expect(map.rooms.filter((room) => room.kind === "pole").map((room) => room.poleId)).toEqual(
      poles.map((pole) => pole.id),
    );
  });

  it("rend tout le sol accessible depuis le point d'apparition : aucune salle n'est murée", () => {
    const reachable = reachableFrom(map, map.spawn);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (isWalkableTile(map, col, row)) expect(reachable.has(`${col},${row}`)).toBe(true);
      }
    }
  });

  it("donne à chaque agent un siège sur le sol de sa salle", () => {
    for (const pole of poles) {
      const room = map.rooms.find((candidate) => candidate.poleId === pole.id)!;
      expect(room.seats).toHaveLength(pole.seats);
      for (const seat of room.seats) {
        expect(isWalkableTile(map, seat.col, seat.row)).toBe(true);
        expect(seat.col).toBeGreaterThan(room.col);
        expect(seat.col).toBeLessThan(room.col + room.width - 1);
        expect(seat.row).toBeGreaterThan(room.row);
        expect(seat.row).toBeLessThan(room.row + room.height - 1);
      }
    }
  });

  it("ne superpose jamais deux salles (elles peuvent partager un mur)", () => {
    const interiors = map.rooms.map((room) => ({
      left: room.col + 1,
      right: room.col + room.width - 2,
      top: room.row + 1,
      bottom: room.row + room.height - 2,
    }));
    for (let i = 0; i < interiors.length; i++) {
      for (let j = i + 1; j < interiors.length; j++) {
        const a = interiors[i];
        const b = interiors[j];
        const overlap = a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
        expect(overlap).toBe(false);
      }
    }
  });

  it("ferme le bureau par un mur extérieur et place le point d'apparition sur le sol", () => {
    for (let col = 0; col < map.cols; col++) {
      expect(map.tiles[0][col]).toBe("wall");
      expect(map.tiles[map.rows - 1][col]).toBe("wall");
    }
    expect(isWalkableTile(map, map.spawn.col, map.spawn.row)).toBe(true);
  });

  it("reste valide sans aucun pôle", () => {
    const empty = generateOfficeMap({ poles: [] });
    expect(empty.rooms.map((room) => room.kind).sort()).toEqual(["break", "ceo", "meeting"]);
    expect(isWalkableTile(empty, empty.spawn.col, empty.spawn.row)).toBe(true);
  });

  it("sépare les salles voisines par une rue de 3 cases, sur toute leur hauteur", () => {
    const sameBand = (a: { row: number }, b: { row: number }) => a.row === b.row;
    const rooms = [...map.rooms].sort((a, b) => a.row - b.row || a.col - b.col);
    let pairs = 0;
    for (let i = 0; i < rooms.length - 1; i++) {
      const left = rooms[i];
      const right = rooms[i + 1];
      if (!sameBand(left, right)) continue;
      pairs++;
      const gapStart = left.col + left.width;
      expect(right.col - gapStart).toBeGreaterThanOrEqual(3);
      const height = Math.min(left.height, right.height);
      // Inside the building: the outer wall (row 0) stays closed.
      for (let row = Math.max(1, left.row); row < left.row + height; row++) {
        for (let col = gapStart; col < right.col; col++) {
          expect(isWalkableTile(map, col, row)).toBe(true);
        }
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(2);
  });
});
