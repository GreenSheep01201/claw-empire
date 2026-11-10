import { describe, expect, it } from "vitest";
import { generateOfficeMap, isWalkableTile } from "./officeMap";
import { desiredSpot, findPath, hasLineOfSight, smoothPath, stepAlongPath } from "./movement";

const map = generateOfficeMap({
  poles: [
    { id: "reequal", seats: 2 },
    { id: "atomic", seats: 1 },
  ],
});
const room = (id: string) => map.rooms.find((candidate) => candidate.id === id)!;

describe("findPath", () => {
  it("relie un siège de pôle à la salle de pause sans traverser de mur", () => {
    const from = room("pole:reequal").seats[0];
    const to = room("break").seats[0];
    const path = findPath(map, from, to)!;

    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    for (const tile of path) expect(isWalkableTile(map, tile.col, tile.row)).toBe(true);
    for (let i = 1; i < path.length; i++) {
      const step = Math.abs(path[i].col - path[i - 1].col) + Math.abs(path[i].row - path[i - 1].row);
      expect(step).toBe(1);
    }
  });

  it("passe par la porte de la salle", () => {
    const path = findPath(map, room("pole:reequal").seats[0], map.spawn)!;
    const doors = room("pole:reequal").door;
    expect(path.some((tile) => doors.some((door) => door.col === tile.col && door.row === tile.row))).toBe(true);
  });

  it("renvoie null quand la destination est un mur", () => {
    expect(findPath(map, map.spawn, { col: 0, row: 0 })).toBeNull();
  });
});

describe("stepAlongPath", () => {
  const path = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
  ];

  it("avance de la distance demandée en suivant les cases", () => {
    const walker = { x: 16, y: 16, index: 0 };
    const next = stepAlongPath(walker, path, 40, 32);
    // 32 px to reach (1,0), then 8 px down towards (1,1).
    expect(next).toEqual({ x: 48, y: 24, index: 1, arrived: false });
  });

  it("s'arrête pile sur la dernière case", () => {
    const next = stepAlongPath({ x: 16, y: 16, index: 0 }, path, 500, 32);
    expect(next).toEqual({ x: 48, y: 48, index: 2, arrived: true });
  });
});

describe("desiredSpot", () => {
  it("met un agent au travail à son bureau", () => {
    expect(desiredSpot(map, { id: "a1", poleId: "reequal", seatIndex: 1, status: "working" }, [], 0)).toEqual({
      kind: "desk",
      tile: room("pole:reequal").seats[1],
    });
  });

  it("envoie un agent en pause dans la salle de pause", () => {
    expect(desiredSpot(map, { id: "a1", poleId: "reequal", seatIndex: 0, status: "break" }, [], 2).kind).toBe("break");
  });

  it("assoit un agent en réunion à son siège de la table tant que la réunion dure", () => {
    const presence = [{ agent_id: "a1", seat_index: 3, until: 2_000 }];
    expect(
      desiredSpot(map, { id: "a1", poleId: "reequal", seatIndex: 0, status: "working" }, presence, 0, 1_000),
    ).toEqual({
      kind: "meeting",
      tile: room("meeting").seats[3],
    });
    expect(
      desiredSpot(map, { id: "a1", poleId: "reequal", seatIndex: 0, status: "working" }, presence, 0, 3_000).kind,
    ).toBe("desk");
  });
});

describe("smoothPath", () => {
  it("ne garde que les extrémités d'un trajet en ligne droite", () => {
    const straight = [0, 1, 2, 3, 4].map((col) => ({ col: map.spawn.col - 2 + col, row: map.spawn.row }));
    expect(smoothPath(map, straight)).toEqual([straight[0], straight[4]]);
  });

  it("ne coupe jamais à travers un mur", () => {
    const from = room("pole:reequal").seats[0];
    const path = findPath(map, from, room("break").seats[0])!;
    const smooth = smoothPath(map, path);
    expect(smooth.length).toBeLessThan(path.length);
    expect(smooth[0]).toEqual(path[0]);
    expect(smooth[smooth.length - 1]).toEqual(path[path.length - 1]);
    for (let i = 1; i < smooth.length; i++) {
      expect(hasLineOfSight(map, smooth[i - 1], smooth[i])).toBe(true);
    }
  });
});
