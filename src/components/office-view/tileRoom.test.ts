import { describe, expect, it } from "vitest";
import { buildRoomTiles, wallMask, wallPieceFrame } from "./tileRoom";

describe("buildRoomTiles", () => {
  it("entoure le sol d'un mur, avec une ligne de corniche au-dessus du mur du haut", () => {
    const grid = buildRoomTiles(4, 5);

    expect(grid.map((row) => row.join(""))).toEqual(["....", "WWWW", "WFFW", "WFFW", "WWWW"]);
  });

  it("peut monter le mur du fond sur plusieurs rangées pour l'effet de profondeur", () => {
    const grid = buildRoomTiles(4, 6, { backWallRows: 2 });

    // "B" = extra face of the back wall, drawn below its cap like in Pixel Agents.
    expect(grid.map((row) => row.join(""))).toEqual(["....", "WWWW", "WBBW", "WFFW", "WFFW", "WWWW"]);
  });

  it("perce une porte dans le mur du haut quand on la demande", () => {
    const grid = buildRoomTiles(5, 4, { doorCol: 2 });

    expect(grid[1].join("")).toBe("WWFWW");
  });
});

describe("wallMask", () => {
  it("additionne N=1, E=2, S=4, O=8 pour les voisins qui sont des murs", () => {
    const grid = buildRoomTiles(4, 5);

    expect(wallMask(grid, 0, 1)).toBe(2 + 4); // coin haut-gauche : mur à l'est et au sud
    expect(wallMask(grid, 1, 1)).toBe(2 + 8); // mur du haut : est + ouest
    expect(wallMask(grid, 0, 2)).toBe(1 + 4); // mur de gauche : nord + sud
    expect(wallMask(grid, 3, 4)).toBe(1 + 8); // coin bas-droite : nord + ouest
  });

  it("vaut 0 pour une case qui n'est pas un mur", () => {
    expect(wallMask(buildRoomTiles(4, 5), 1, 2)).toBe(0);
  });
});

describe("wallPieceFrame", () => {
  it("place la pièce du masque M en colonne M % 4 et ligne M / 4 de la planche 4×4", () => {
    expect(wallPieceFrame(0)).toEqual({ col: 0, row: 0 });
    expect(wallPieceFrame(10)).toEqual({ col: 2, row: 2 });
    expect(wallPieceFrame(15)).toEqual({ col: 3, row: 3 });
  });
});
