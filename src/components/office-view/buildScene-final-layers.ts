import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from "pixi.js";
import type { Task } from "../../types";
import { CEO_SIZE, DESK_H, type Delivery } from "./model";
import { stretchDelegationWire } from "./delegationWire";

/** QG accent green (cutting-mat) reserved for the mission route. */
const DELEGATION_WIRE_COLOR = 0x3f8f76;

interface BuildFinalLayersParams {
  app: Application;
  textures: Record<string, Texture>;
  tasks: Task[];
  ceoPosRef: MutableRefObject<{ x: number; y: number }>;
  agentPosRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  deliveriesRef: MutableRefObject<Delivery[]>;
  deliveryLayerRef: MutableRefObject<Container | null>;
  highlightRef: MutableRefObject<Graphics | null>;
  ceoSpriteRef: MutableRefObject<Container | null>;
  crownRef: MutableRefObject<Text | null>;
  prevAssignRef: MutableRefObject<Set<string>>;
  setSceneRevision: Dispatch<SetStateAction<number>>;
}

export function buildFinalLayers({
  app,
  textures,
  tasks,
  ceoPosRef,
  agentPosRef,
  deliveriesRef,
  deliveryLayerRef,
  highlightRef,
  ceoSpriteRef,
  crownRef,
  prevAssignRef,
  setSceneRevision,
}: BuildFinalLayersParams): void {
  const deliveryLayer = new Container();
  app.stage.addChild(deliveryLayer);
  deliveryLayerRef.current = deliveryLayer;

  deliveriesRef.current = deliveriesRef.current.filter((delivery) => !delivery.sprite.destroyed);
  for (const delivery of deliveriesRef.current) {
    deliveryLayer.addChild(delivery.sprite);
  }

  const highlight = new Graphics();
  app.stage.addChild(highlight);
  highlightRef.current = highlight;

  const ceoCharacter = new Container();
  if (textures.ceo) {
    const sprite = new Sprite(textures.ceo);
    sprite.anchor.set(0.5, 0.5);
    const scale = CEO_SIZE / Math.max(sprite.texture.width, sprite.texture.height);
    sprite.scale.set(scale);
    ceoCharacter.addChild(sprite);
  } else {
    const fallback = new Graphics();
    fallback.circle(0, 0, 18).fill(0xff4d4d);
    ceoCharacter.addChild(fallback);
  }

  const crown = new Text({ text: "👑", style: new TextStyle({ fontSize: 14 }) });
  crown.anchor.set(0.5, 1);
  crown.position.set(0, -CEO_SIZE / 2 + 2);
  ceoCharacter.addChild(crown);
  crownRef.current = crown;

  const nameBadge = new Graphics();
  nameBadge.roundRect(-16, CEO_SIZE / 2 + 1, 32, 11, 3).fill({ color: 0xf0d888, alpha: 0.9 });
  ceoCharacter.addChild(nameBadge);
  const nameText = new Text({
    text: "CEO",
    style: new TextStyle({ fontSize: 7, fill: 0x5a4020, fontWeight: "bold", fontFamily: "monospace" }),
  });
  nameText.anchor.set(0.5, 0.5);
  nameText.position.set(0, CEO_SIZE / 2 + 6.5);
  ceoCharacter.addChild(nameText);

  ceoCharacter.position.set(ceoPosRef.current.x, ceoPosRef.current.y);
  app.stage.addChild(ceoCharacter);
  ceoSpriteRef.current = ceoCharacter;

  const currentAssign = new Set(
    tasks.filter((task) => task.assigned_agent_id && task.status === "in_progress").map((task) => task.id),
  );
  const newAssigns = [...currentAssign].filter((id) => !prevAssignRef.current.has(id));
  prevAssignRef.current = currentAssign;

  for (const taskId of newAssigns) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task?.assigned_agent_id) continue;
    const target = agentPosRef.current.get(task.assigned_agent_id);
    if (!target) continue;

    stretchDelegationWire(app, deliveryLayer, ceoPosRef.current, target, DELEGATION_WIRE_COLOR);

    // A task card (fiche) travels along the wire to the agent's desk.
    const deliverySprite = new Container();
    const card = new Graphics();
    card.rect(-7, -9, 14, 18).fill(0xfafaf7).stroke({ width: 1, color: 0x1e1e1e, alpha: 0.6 });
    card.rect(-7, -9, 14, 4).fill(DELEGATION_WIRE_COLOR);
    card.rect(-4, -2, 8, 1).fill({ color: 0x1e1e1e, alpha: 0.5 });
    card.rect(-4, 1, 6, 1).fill({ color: 0x1e1e1e, alpha: 0.5 });
    deliverySprite.addChild(card);
    deliverySprite.position.set(ceoPosRef.current.x, ceoPosRef.current.y);
    deliveryLayer.addChild(deliverySprite);

    deliveriesRef.current.push({
      sprite: deliverySprite,
      fromX: ceoPosRef.current.x,
      fromY: ceoPosRef.current.y,
      toX: target.x,
      toY: target.y + DESK_H,
      progress: 0,
    });
  }

  setSceneRevision((prev) => prev + 1);
}
