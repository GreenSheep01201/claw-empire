import { describe, expect, it } from "vitest";
import { generateOfficeMap } from "./officeMap";
import { cameraOffset, mapWallMask, roomAt, screenToTile, stepZoom, tileToPixel, ZOOM_LEVELS } from "./worldGeometry";

const map = generateOfficeMap({ poles: [{ id: "reequal", seats: 2 }] });

describe("roomAt", () => {
  it("retrouve la salle d'une case de sol, et rien dans le couloir", () => {
    const pole = map.rooms.find((room) => room.kind === "pole")!;
    expect(roomAt(map, pole.col + 2, pole.row + 2)?.id).toBe(pole.id);
    expect(roomAt(map, map.spawn.col, map.spawn.row)).toBeNull();
  });
});

describe("mapWallMask", () => {
  it("combine les voisins murs N=1, E=2, S=4, O=8 sur toute la carte", () => {
    // Coin haut-gauche du bâtiment : mur à l'est et au sud.
    expect(mapWallMask(map, 0, 0)).toBe(2 + 4);
  });

  it("vaut 0 hors des murs", () => {
    expect(mapWallMask(map, map.spawn.col, map.spawn.row)).toBe(0);
  });
});

describe("tileToPixel", () => {
  it("donne le centre de la case en pixels", () => {
    expect(tileToPixel(map, { col: 2, row: 3 })).toEqual({ x: 2 * 32 + 16, y: 3 * 32 + 16 });
  });
});

describe("cameraOffset", () => {
  it("centre la cible dans la fenêtre", () => {
    expect(cameraOffset({ width: 400, height: 300 }, { width: 2000, height: 2000 }, { x: 1000, y: 1000 }, 1)).toEqual({
      x: -800,
      y: -850,
    });
  });

  it("ne montre jamais au-delà des bords de la carte", () => {
    expect(cameraOffset({ width: 400, height: 300 }, { width: 2000, height: 2000 }, { x: 10, y: 10 }, 1)).toEqual({
      x: 0,
      y: 0,
    });
    expect(cameraOffset({ width: 400, height: 300 }, { width: 2000, height: 2000 }, { x: 1990, y: 1990 }, 1)).toEqual({
      x: -1600,
      y: -1700,
    });
  });

  it("centre la carte quand elle est plus petite que la fenêtre", () => {
    expect(cameraOffset({ width: 800, height: 600 }, { width: 400, height: 200 }, { x: 0, y: 0 }, 1)).toEqual({
      x: 200,
      y: 200,
    });
  });

  it("tient compte du zoom", () => {
    expect(cameraOffset({ width: 400, height: 300 }, { width: 2000, height: 2000 }, { x: 1000, y: 1000 }, 2)).toEqual({
      x: -1800,
      y: -1850,
    });
  });
});

describe("screenToTile", () => {
  it("retrouve la case visée en tenant compte de la caméra et du zoom", () => {
    // World shifted by (-100, -50) on screen and drawn at 2×: screen (164, 78) is world (132, 64).
    expect(screenToTile(map, { x: 164, y: 78 }, { x: -100, y: -50 }, 2)).toEqual({ col: 4, row: 2 });
  });
});

describe("stepZoom", () => {
  it("passe au cran de zoom suivant ou précédent, sans dépasser les bornes", () => {
    expect(stepZoom(0.75, 1)).toBe(1);
    expect(stepZoom(0.75, -1)).toBe(0.6);
    expect(stepZoom(ZOOM_LEVELS[0], -1)).toBe(ZOOM_LEVELS[0]);
    expect(stepZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 1)).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  });

  it("se cale sur le cran le plus proche d'une valeur libre", () => {
    expect(stepZoom(0.8, 1)).toBe(1);
  });
});
