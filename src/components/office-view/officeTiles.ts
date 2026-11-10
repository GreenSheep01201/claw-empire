import { Assets, Rectangle, Texture } from "pixi.js";

/**
 * Pixel Agents (MIT) floor / wall / furniture sprites, see
 * public/office-assets/pixel-agents/NOTICE.md. Source pixels are 16 px;
 * the office draws them at TILE_SCALE.
 */
const BASE = "/office-assets/pixel-agents";
const SOURCE_TILE = 16;
export const TILE_SCALE = 2;
/** Source pixel rows of a wall piece that form its cap (top edge + wall top). */
export const WALL_CAP_PX = 8;

const FURNITURE_FILES = [
  "DESK/DESK_FRONT",
  "PC/PC_FRONT_ON_1",
  "PC/PC_FRONT_ON_2",
  "PC/PC_FRONT_ON_3",
  "PC/PC_FRONT_OFF",
  "PC/PC_BACK",
  "WOODEN_CHAIR/WOODEN_CHAIR_BACK",
  "WOODEN_CHAIR/WOODEN_CHAIR_FRONT",
  "HANGING_PLANT/HANGING_PLANT",
  "SMALL_PAINTING_2/SMALL_PAINTING_2",
  "BOOKSHELF/BOOKSHELF",
  "DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF",
  "PLANT/PLANT",
  "PLANT_2/PLANT_2",
  "LARGE_PLANT/LARGE_PLANT",
  "CACTUS/CACTUS",
  "CLOCK/CLOCK",
  "WHITEBOARD/WHITEBOARD",
  "SMALL_PAINTING/SMALL_PAINTING",
  "LARGE_PAINTING/LARGE_PAINTING",
  "BIN/BIN",
  "COFFEE/COFFEE",
  "COFFEE_TABLE/COFFEE_TABLE",
  "SOFA/SOFA_FRONT",
  "SOFA/SOFA_BACK",
  "SOFA/SOFA_SIDE",
  "TABLE_FRONT/TABLE_FRONT",
  "CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT",
  "CUSHIONED_CHAIR/CUSHIONED_CHAIR_SIDE",
  "SMALL_TABLE/SMALL_TABLE_FRONT",
  "WOODEN_CHAIR/WOODEN_CHAIR_SIDE",
  "HANGING_PLANT/HANGING_PLANT",
  "SMALL_PAINTING_2/SMALL_PAINTING_2",
  "POT/POT",
] as const;

export type FurnitureKey = (typeof FURNITURE_FILES)[number];

export const tileKey = {
  floor: (variant: number) => `pa:floor:${variant}`,
  wall: (mask: number) => `pa:wall:${mask}`,
  wallCap: (mask: number) => `pa:wall:cap:${mask}`,
  wallFace: (mask: number) => `pa:wall:face:${mask}`,
  furniture: (file: FurnitureKey) => `pa:furn:${file}`,
};

function pixelated(texture: Texture): Texture {
  texture.source.scaleMode = "nearest";
  return texture;
}

/** Loads every office tile texture into `textures`; missing files are skipped. */
export async function loadOfficeTiles(textures: Record<string, Texture>): Promise<void> {
  const loads: Promise<void>[] = [];

  for (let variant = 0; variant <= 8; variant++) {
    loads.push(
      Assets.load<Texture>(`${BASE}/floors/floor_${variant}.png`)
        .then((texture) => {
          textures[tileKey.floor(variant)] = pixelated(texture);
        })
        .catch(() => {}),
    );
  }

  loads.push(
    Assets.load<Texture>(`${BASE}/walls/wall_0.png`)
      .then((sheet) => {
        pixelated(sheet);
        for (let mask = 0; mask < 16; mask++) {
          const frame = new Rectangle(
            (mask % 4) * SOURCE_TILE,
            Math.floor(mask / 4) * SOURCE_TILE * 2,
            SOURCE_TILE,
            SOURCE_TILE * 2,
          );
          textures[tileKey.wall(mask)] = new Texture({ source: sheet.source, frame });
        }
        // Split pieces: an 8 px cap (top edge + wall top) and the flat face below it,
        // so a taller back wall can stretch its face without a seam.
        for (let mask = 0; mask < 16; mask++) {
          const x = (mask % 4) * SOURCE_TILE;
          const y = Math.floor(mask / 4) * SOURCE_TILE * 2;
          textures[tileKey.wallCap(mask)] = new Texture({
            source: sheet.source,
            frame: new Rectangle(x, y, SOURCE_TILE, WALL_CAP_PX),
          });
          textures[tileKey.wallFace(mask)] = new Texture({
            source: sheet.source,
            frame: new Rectangle(x, y + WALL_CAP_PX, SOURCE_TILE, SOURCE_TILE * 2 - WALL_CAP_PX),
          });
        }
      })
      .catch(() => {}),
  );

  for (const file of FURNITURE_FILES) {
    loads.push(
      Assets.load<Texture>(`${BASE}/furniture/${file}.png`)
        .then((texture) => {
          textures[tileKey.furniture(file)] = pixelated(texture);
        })
        .catch(() => {}),
    );
  }

  await Promise.all(loads);
}
