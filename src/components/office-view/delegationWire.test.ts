import { describe, expect, it } from "vitest";
import { wireSagPoint } from "./delegationWire";

describe("wireSagPoint", () => {
  it("place le point de contrôle au milieu, abaissé pour que le fil pende", () => {
    const p = wireSagPoint({ x: 0, y: 100 }, { x: 200, y: 100 });

    expect(p.x).toBe(100);
    expect(p.y).toBeGreaterThan(100);
  });

  it("pend davantage quand le fil est plus long, avec un plafond", () => {
    const short = wireSagPoint({ x: 0, y: 0 }, { x: 100, y: 0 });
    const long = wireSagPoint({ x: 0, y: 0 }, { x: 600, y: 0 });
    const huge = wireSagPoint({ x: 0, y: 0 }, { x: 5000, y: 0 });

    expect(long.y).toBeGreaterThan(short.y);
    expect(huge.y).toBeLessThanOrEqual(80);
  });
});
