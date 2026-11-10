import { Graphics, type Application, type Container } from "pixi.js";

type Point = { x: number; y: number };

const MAX_SAG = 80;
const WIRE_LIFE_FRAMES = 150;

/** Control point of the quadratic curve: midway, pulled down like a hanging wire. */
export function wireSagPoint(from: Point, to: Point): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    x: (from.x + to.x) / 2,
    y: Math.max(from.y, to.y) + Math.min(MAX_SAG, 12 + length * 0.12),
  };
}

/**
 * QG signature: when the CEO hands work to an agent, a wire is stretched from
 * the CEO to that desk, then fades. The mission route is the one place the
 * accent colour is reserved for.
 */
export function stretchDelegationWire(app: Application, layer: Container, from: Point, to: Point, color: number): void {
  const wire = new Graphics();
  const sag = wireSagPoint(from, to);
  wire.moveTo(from.x, from.y).quadraticCurveTo(sag.x, sag.y, to.x, to.y).stroke({ width: 2, color, alpha: 0.9 });
  wire.circle(from.x, from.y, 3).fill(color);
  wire.circle(to.x, to.y, 3).fill(color);
  layer.addChild(wire);

  let life = 0;
  const fade = () => {
    if (wire.destroyed) {
      app.ticker.remove(fade);
      return;
    }
    life += 1;
    // Hold, then fade out over the last third.
    wire.alpha =
      life < WIRE_LIFE_FRAMES * 0.66 ? 1 : Math.max(0, (WIRE_LIFE_FRAMES - life) / (WIRE_LIFE_FRAMES * 0.34));
    if (life >= WIRE_LIFE_FRAMES) {
      app.ticker.remove(fade);
      wire.destroy();
    }
  };
  app.ticker.add(fade);
}
