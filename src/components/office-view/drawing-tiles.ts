import { type Container, NineSliceSprite, Sprite, type Texture } from "pixi.js";
import { tileKey, TILE_SCALE, type FurnitureKey } from "./officeTiles";

/** Places a furniture sprite with its bottom-centre at (x, y). */
export function placeFurniture(
  parent: Container,
  textures: Record<string, Texture>,
  file: FurnitureKey,
  x: number,
  y: number,
  options: { tint?: number; scale?: number } = {},
): Sprite | null {
  const texture = textures[tileKey.furniture(file)];
  if (!texture) return null;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(options.scale ?? TILE_SCALE);
  if (options.tint !== undefined) sprite.tint = options.tint;
  sprite.position.set(Math.round(x), Math.round(y));
  parent.addChild(sprite);
  return sprite;
}

/**
 * Furniture stretched by nine-slice (borders in source pixels stay crisp), e.g.
 * a long meeting table from the coffee table sprite. (x, y) is the top-left;
 * width/height are in screen pixels.
 */
export function placeStretchedFurniture(
  parent: Container,
  textures: Record<string, Texture>,
  file: FurnitureKey,
  x: number,
  y: number,
  width: number,
  height: number,
  insets: { left: number; top: number; right: number; bottom: number },
): NineSliceSprite | null {
  const texture = textures[tileKey.furniture(file)];
  if (!texture) return null;
  const sprite = new NineSliceSprite({
    texture,
    leftWidth: insets.left,
    topHeight: insets.top,
    rightWidth: insets.right,
    bottomHeight: insets.bottom,
  });
  sprite.width = width / TILE_SCALE;
  sprite.height = height / TILE_SCALE;
  sprite.scale.set(TILE_SCALE);
  sprite.position.set(Math.round(x), Math.round(y));
  parent.addChild(sprite);
  return sprite;
}
