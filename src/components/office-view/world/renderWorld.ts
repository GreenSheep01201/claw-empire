import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";
import { placeFurniture, placeStretchedFurniture } from "../drawing-tiles";
import { tileKey, TILE_SCALE, WALL_CAP_PX } from "../officeTiles";
import type { MapRoom, OfficeMap } from "./officeMap";
import { mapWallMask, roomAt, tileToPixel } from "./worldGeometry";

export interface WorldPalette {
  corridorFloor: number;
  wall: number;
  ceoFloor: number;
  meetingFloor: number;
  breakFloor: number;
  /** Floor tint per pole id. */
  poleFloor: (poleId: string) => number;
  /** Plaque colour per pole id. */
  poleAccent: (poleId: string) => number;
}

export interface WorldAgent {
  id: string;
  poleId: string;
  name: string;
  texture: Texture | null;
  dimmed: boolean;
}

export interface WorldScene {
  /** Flat floor tiles. */
  floor: Container;
  /** Everything with depth (walls, furniture, characters), sorted by zIndex = feet y. */
  entities: Container;
  agentNodes: Map<string, Container>;
}

const CHAR_H = 52;
const FLOOR_VARIANT = { corridor: 0, ceo: 1, meeting: 2, pole: 2, break: 7 } as const;

function floorTint(room: MapRoom | null, palette: WorldPalette): { variant: number; tint: number } {
  if (!room) return { variant: FLOOR_VARIANT.corridor, tint: palette.corridorFloor };
  if (room.kind === "pole" && room.poleId) return { variant: FLOOR_VARIANT.pole, tint: palette.poleFloor(room.poleId) };
  if (room.kind === "ceo") return { variant: FLOOR_VARIANT.ceo, tint: palette.ceoFloor };
  if (room.kind === "meeting") return { variant: FLOOR_VARIANT.meeting, tint: palette.meetingFloor };
  return { variant: FLOOR_VARIANT.break, tint: palette.breakFloor };
}

function addDepth(entities: Container, node: Container, feetY: number): void {
  node.zIndex = feetY;
  entities.addChild(node);
}

function drawFloors(floor: Container, textures: Record<string, Texture>, map: OfficeMap, palette: WorldPalette): void {
  const size = map.tileSize;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] === "wall") continue;
      const { variant, tint } = floorTint(roomAt(map, col, row), palette);
      const texture = textures[tileKey.floor(variant)];
      if (!texture) continue;
      const tile = new Sprite(texture);
      tile.position.set(col * size, row * size);
      tile.scale.set(TILE_SCALE);
      tile.tint = tint;
      floor.addChild(tile);
    }
  }
}

/**
 * Walls with a walkable tile to their south are seen face-on (cap + face);
 * the others are only seen from above (cap). Each wall sorts by its bottom
 * edge so characters walk in front of or behind it.
 */
function drawWalls(entities: Container, textures: Record<string, Texture>, map: OfficeMap, tint: number): void {
  const size = map.tileSize;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tiles[row][col] !== "wall") continue;
      const mask = mapWallMask(map, col, row);
      const faceOn = map.tiles[row + 1]?.[col] !== undefined && map.tiles[row + 1][col] !== "wall";
      const texture = faceOn ? textures[tileKey.wall(mask)] : textures[tileKey.wallCap(mask)];
      if (!texture) continue;
      const wall = new Sprite(texture);
      wall.scale.set(TILE_SCALE);
      wall.tint = tint;
      const height = texture.height * TILE_SCALE;
      if (faceOn) {
        wall.position.set(col * size, (row + 1) * size - height);
      } else {
        // Cap-only blocks fill their whole tile so thick walls read as solid.
        wall.position.set(col * size, row * size);
        wall.height = size;
        const fill = new Graphics();
        fill.rect(col * size, row * size + WALL_CAP_PX * TILE_SCALE, size, size - WALL_CAP_PX * TILE_SCALE).fill(tint);
        addDepth(entities, fill, (row + 1) * size - 1);
      }
      addDepth(entities, wall, (row + 1) * size);
    }
  }
}

function plaque(room: MapRoom, map: OfficeMap, label: string, color: number): Container {
  const node = new Container();
  const text = new Text({
    text: label,
    style: new TextStyle({
      fontSize: 12,
      fill: 0xffffff,
      fontWeight: "bold",
      fontFamily: "Archivo, system-ui, sans-serif",
    }),
  });
  const width = Math.max(96, Math.ceil(text.width) + 24);
  // Left of the door (doors sit in the middle of the wall).
  const cx = (room.col + 1) * map.tileSize + width / 2 + 8;
  // On the face of the back wall, just above the floor of the first row.
  const y = (room.row + 1) * map.tileSize - 30;
  const bg = new Graphics();
  bg.rect(cx - width / 2 + 1, y + 2, width, 20).fill({ color: 0x000000, alpha: 0.2 });
  bg.rect(cx - width / 2, y, width, 20).fill(color);
  text.anchor.set(0.5, 0.5);
  text.position.set(cx, y + 10);
  node.addChild(bg, text);
  return node;
}

function furnishPole(entities: Container, textures: Record<string, Texture>, map: OfficeMap, room: MapRoom): void {
  const size = map.tileSize;
  for (const seat of room.seats) {
    const { x } = tileToPixel(map, seat);
    const deskBottom = (seat.row + 2) * size;
    const desk = new Container();
    placeFurniture(desk, textures, "DESK/DESK_FRONT", x, deskBottom);
    placeFurniture(desk, textures, "PC/PC_BACK", x + 30, deskBottom - 30, { scale: TILE_SCALE / 2 });
    addDepth(entities, desk, deskBottom);
  }
  const wallFloor = (room.row + 1) * size;
  const left = room.col * size;
  const right = (room.col + room.width) * size;
  const decor = new Container();
  placeFurniture(decor, textures, "BOOKSHELF/BOOKSHELF", left + size + 40, wallFloor + size);
  placeFurniture(decor, textures, "WHITEBOARD/WHITEBOARD", right - size - 48, wallFloor + size - 6);
  addDepth(entities, decor, wallFloor + size);
  const bottom = (room.row + room.height - 1) * size;
  const plants = new Container();
  placeFurniture(plants, textures, "PLANT/PLANT", left + size + 16, bottom);
  placeFurniture(plants, textures, "PLANT_2/PLANT_2", right - size - 16, bottom);
  addDepth(entities, plants, bottom);
}

function furnishMeeting(entities: Container, textures: Record<string, Texture>, map: OfficeMap, room: MapRoom): void {
  const size = map.tileSize;
  const cols = room.seats.map((seat) => seat.col);
  const left = (Math.min(...cols) - 0.5) * size;
  const right = (Math.max(...cols) + 1.5) * size;
  const tableRow = room.seats[0].row + 1;
  const table = new Container();
  placeStretchedFurniture(
    table,
    textures,
    "COFFEE_TABLE/COFFEE_TABLE",
    left,
    tableRow * size - 8,
    right - left,
    size + 8,
    {
      left: 6,
      top: 6,
      right: 6,
      bottom: 8,
    },
  );
  addDepth(entities, table, (tableRow + 1) * size);
  placeFurniture(
    entities,
    textures,
    "WHITEBOARD/WHITEBOARD",
    (room.col + room.width / 2) * size,
    (room.row + 2) * size - 6,
  );
}

function furnishCeo(entities: Container, textures: Record<string, Texture>, map: OfficeMap, room: MapRoom): void {
  const size = map.tileSize;
  const cx = (room.col + 5) * size;
  const deskBottom = (room.row + 5) * size;
  const desk = new Container();
  placeFurniture(desk, textures, "DESK/DESK_FRONT", cx, deskBottom);
  placeFurniture(desk, textures, "PC/PC_FRONT_ON_1", cx - 24, deskBottom - 30);
  addDepth(entities, desk, deskBottom);
  const decor = new Container();
  placeFurniture(
    decor,
    textures,
    "DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF",
    (room.col + room.width - 4) * size,
    (room.row + 2) * size,
  );
  placeFurniture(
    decor,
    textures,
    "LARGE_PLANT/LARGE_PLANT",
    (room.col + room.width - 2) * size,
    (room.row + room.height - 1) * size,
  );
  addDepth(entities, decor, (room.row + 2) * size);
}

function furnishBreak(entities: Container, textures: Record<string, Texture>, map: OfficeMap, room: MapRoom): void {
  const size = map.tileSize;
  const cx = (room.col + room.width / 2) * size;
  const back = (room.row + 2) * size;
  const decor = new Container();
  placeFurniture(decor, textures, "SOFA/SOFA_FRONT", cx - 48, back + 8);
  placeFurniture(decor, textures, "SOFA/SOFA_FRONT", cx + 48, back + 8);
  placeFurniture(decor, textures, "COFFEE/COFFEE", (room.col + 2) * size, back + 8);
  placeFurniture(decor, textures, "LARGE_PLANT/LARGE_PLANT", (room.col + room.width - 2) * size, back + 16);
  addDepth(entities, decor, back + 8);
  const table = new Container();
  placeFurniture(table, textures, "COFFEE_TABLE/COFFEE_TABLE", cx, back + size * 2);
  addDepth(entities, table, back + size * 2);
}

function agentNode(agent: WorldAgent, x: number, feetY: number): Container {
  const node = new Container();
  node.position.set(x, feetY);
  if (agent.texture) {
    const sprite = new Sprite(agent.texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(CHAR_H / agent.texture.height);
    if (agent.dimmed) sprite.alpha = 0.45;
    node.addChild(sprite);
  }
  const name = new Text({
    text: agent.name,
    style: new TextStyle({
      fontSize: 10,
      fill: 0x1e1e1e,
      fontWeight: "bold",
      fontFamily: "Archivo, system-ui, sans-serif",
    }),
  });
  name.anchor.set(0.5, 1);
  name.position.set(0, -CHAR_H - 4);
  const tag = new Graphics();
  tag.roundRect(-name.width / 2 - 5, -CHAR_H - 18, name.width + 10, 15, 3).fill({ color: 0xfafaf7, alpha: 0.92 });
  node.addChild(tag, name);
  node.eventMode = "static";
  node.cursor = "pointer";
  return node;
}

export function buildWorldScene(
  textures: Record<string, Texture>,
  map: OfficeMap,
  palette: WorldPalette,
  agents: WorldAgent[],
  labels: { ceo: string; meeting: string; break: string; pole: (poleId: string) => string },
): WorldScene {
  const floor = new Container();
  const entities = new Container();
  entities.sortableChildren = true;
  drawFloors(floor, textures, map, palette);
  drawWalls(entities, textures, map, palette.wall);

  const agentNodes = new Map<string, Container>();
  for (const room of map.rooms) {
    if (room.kind === "pole" && room.poleId) {
      furnishPole(entities, textures, map, room);
      addDepth(
        entities,
        plaque(room, map, labels.pole(room.poleId), palette.poleAccent(room.poleId)),
        (room.row + 1) * map.tileSize + 1,
      );
      const members = agents.filter((agent) => agent.poleId === room.poleId);
      members.forEach((agent, index) => {
        const seat = room.seats[index];
        if (!seat) return;
        const { x } = tileToPixel(map, seat);
        // Seated behind the desk: feet hidden by it, so sort just above the desk.
        const feetY = (seat.row + 1) * map.tileSize + 10;
        const node = agentNode(agent, x, feetY);
        addDepth(entities, node, feetY);
        agentNodes.set(agent.id, node);
      });
    } else if (room.kind === "meeting") {
      furnishMeeting(entities, textures, map, room);
      addDepth(entities, plaque(room, map, labels.meeting, 0x2e86ab), (room.row + 1) * map.tileSize + 1);
    } else if (room.kind === "ceo") {
      furnishCeo(entities, textures, map, room);
      addDepth(entities, plaque(room, map, labels.ceo, 0x2f5d50), (room.row + 1) * map.tileSize + 1);
    } else {
      furnishBreak(entities, textures, map, room);
      addDepth(entities, plaque(room, map, labels.break, 0xf2c14e), (room.row + 1) * map.tileSize + 1);
    }
  }
  return { floor, entities, agentNodes };
}
