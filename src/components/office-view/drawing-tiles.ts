import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { buildRoomTiles, wallMask } from "./tileRoom";
import { tileKey, TILE_PX, TILE_SCALE, WALL_CAP_PX, type FurnitureKey } from "./officeTiles";

export interface TileRoomSpec {
  x: number;
  y: number;
  cols: number;
  rows: number;
  doorCol?: number;
  /** Rows of back-wall face below its cap (1 = cap + one face row). */
  backWallRows?: number;
  floorVariant?: number;
  floorTint: number;
  wallTint: number;
}

/** True once the Pixel Agents sheets are loaded; callers fall back to the procedural look otherwise. */
export function hasOfficeTiles(textures: Record<string, Texture>): boolean {
  return Boolean(textures[tileKey.wall(0)] && textures[tileKey.floor(0)]);
}

/**
 * Draws floor and back/side walls into `room` and returns the front (bottom)
 * wall layer, which the caller adds last so it sits in front of the agents.
 */
export function drawTileRoom(room: Container, textures: Record<string, Texture>, spec: TileRoomSpec): Container {
  const grid = buildRoomTiles(spec.cols, spec.rows, { doorCol: spec.doorCol, backWallRows: spec.backWallRows });
  const backRows = Math.max(1, spec.backWallRows ?? 1);
  const floorTexture = textures[tileKey.floor(spec.floorVariant ?? 0)];
  const front = new Container();

  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      const tile = grid[r][c];
      const tx = spec.x + c * TILE_PX;
      const ty = spec.y + r * TILE_PX;
      if (tile === "F" && floorTexture) {
        const floor = new Sprite(floorTexture);
        floor.position.set(tx, ty);
        floor.scale.set(TILE_SCALE);
        floor.tint = spec.floorTint;
        room.addChild(floor);
      } else if (tile === "W" && r === 1 && grid[2]?.[c] === "B") {
        drawTallBackWall(room, textures, wallMask(grid, c, r), tx, ty, backRows, spec.wallTint);
      } else if (tile === "W" && r === spec.rows - 1 && c > 0 && c < spec.cols - 1) {
        // Front wall: in 3/4 view we look over it, so only its cap shows.
        if (floorTexture) {
          const under = new Sprite(floorTexture);
          under.position.set(tx, ty);
          under.scale.set(TILE_SCALE);
          under.tint = spec.floorTint;
          room.addChild(under);
        }
        const capTexture = textures[tileKey.wallCap(wallMask(grid, c, r))];
        if (!capTexture) continue;
        const cap = new Sprite(capTexture);
        cap.position.set(tx, ty + TILE_PX - WALL_CAP_PX * TILE_SCALE);
        cap.scale.set(TILE_SCALE);
        cap.tint = spec.wallTint;
        front.addChild(cap);
      } else if (tile === "W") {
        const texture = textures[tileKey.wall(wallMask(grid, c, r))];
        if (!texture) continue;
        const wall = new Sprite(texture);
        // Wall pieces are two tiles tall, anchored to the bottom of their tile.
        wall.position.set(tx, ty + TILE_PX - texture.height * TILE_SCALE);
        wall.scale.set(TILE_SCALE);
        wall.tint = spec.wallTint;
        room.addChild(wall);
      }
    }
  }
  // Soft contact shadow where the back wall meets the floor sells the depth.
  const shadow = new Graphics();
  const shadowY = spec.y + (backRows + 1) * TILE_PX;
  shadow.rect(spec.x + TILE_PX, shadowY, (spec.cols - 2) * TILE_PX, 6).fill({ color: 0x000000, alpha: 0.16 });
  shadow.rect(spec.x + TILE_PX, shadowY + 6, (spec.cols - 2) * TILE_PX, 4).fill({ color: 0x000000, alpha: 0.07 });
  room.addChild(shadow);
  return front;
}

/** Cap overhanging the row above, then one face stretched down over `backRows` tiles. */
function drawTallBackWall(
  room: Container,
  textures: Record<string, Texture>,
  mask: number,
  tx: number,
  ty: number,
  backRows: number,
  tint: number,
): void {
  const capTexture = textures[tileKey.wallCap(mask)];
  const faceTexture = textures[tileKey.wallFace(mask)];
  if (!capTexture || !faceTexture) return;
  const capTop = ty - TILE_PX;
  const cap = new Sprite(capTexture);
  cap.position.set(tx, capTop);
  cap.scale.set(TILE_SCALE);
  cap.tint = tint;
  room.addChild(cap);

  const faceTop = capTop + WALL_CAP_PX * TILE_SCALE;
  const faceBottom = ty + backRows * TILE_PX;
  const face = new Sprite(faceTexture);
  face.position.set(tx, faceTop);
  face.scale.set(TILE_SCALE, (faceBottom - faceTop) / faceTexture.height);
  face.tint = tint;
  room.addChild(face);
}

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
 * Desk seen from the front with the monitor's back towards the viewer: the
 * agent sits behind it facing down. Returned as one node so the ticker can
 * hide it (e.g. when the agent naps).
 */
export function drawSpriteDesk(
  parent: Container,
  textures: Record<string, Texture>,
  x: number,
  deskY: number,
): Container {
  const desk = new Container();
  placeFurniture(desk, textures, "DESK/DESK_FRONT", x, deskY + 30);
  // Half-size monitor on the desk corner so the agent's face stays visible.
  placeFurniture(desk, textures, "PC/PC_BACK", x + 30, deskY - 2, { scale: TILE_SCALE / 2 });
  parent.addChild(desk);
  return desk;
}
