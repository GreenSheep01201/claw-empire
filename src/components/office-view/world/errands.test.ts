import { describe, expect, it } from "vitest";
import { generateOfficeMap } from "./officeMap";
import { applyOfficeEvents, type ErrandState } from "./errands";
import { desiredSpot } from "./movement";

const map = generateOfficeMap({
  poles: [
    { id: "reequal", seats: 1 },
    { id: "atomic", seats: 1 },
  ],
});
const ceo = map.rooms.find((room) => room.kind === "ceo")!;
const atomic = map.rooms.find((room) => room.poleId === "atomic")!;
const seatOf = (agentId: string) =>
  agentId === "a1" ? map.rooms.find((r) => r.poleId === "reequal")!.seats[0] : atomic.seats[0];
const empty: ErrandState = { errands: new Map(), bubbles: [] };

describe("le bureau du CEO", () => {
  it("a des places visiteurs devant le bureau, sur le sol de la salle", () => {
    expect(ceo.seats.length).toBeGreaterThanOrEqual(4);
    for (const seat of ceo.seats) {
      expect(seat.row).toBeGreaterThan(ceo.row);
      expect(seat.row).toBeLessThan(ceo.row + ceo.height - 1);
    }
  });
});

describe("applyOfficeEvents", () => {
  it("envoie l'agent voir son collègue d'un autre pôle, puis marque la livraison comme traitée", () => {
    const result = applyOfficeEvents(
      map,
      empty,
      { deliveries: [{ id: "d1", fromAgentId: "a1", toAgentId: "a2" }], calls: [] },
      seatOf,
      1_000,
    );

    const errand = result.state.errands.get("a1")!;
    expect(errand.kind).toBe("visit");
    // Stands next to the colleague's seat, inside the other pole's room.
    expect(Math.abs(errand.tile.col - atomic.seats[0].col) + Math.abs(errand.tile.row - atomic.seats[0].row)).toBe(1);
    expect(errand.until).toBeGreaterThan(1_000);
    expect(result.processedDeliveryIds).toEqual(["d1"]);
  });

  it("fait venir l'agent au bureau du CEO, le fait parler, puis le renvoie", () => {
    const arrive = applyOfficeEvents(
      map,
      empty,
      { deliveries: [], calls: [{ id: "c1", fromAgentId: "a1", seatIndex: 1, action: "arrive" }] },
      seatOf,
      0,
    );
    expect(arrive.state.errands.get("a1")).toMatchObject({ kind: "ceo", tile: ceo.seats[1] });
    // Ends on its own if the dismiss event never arrives.
    expect(arrive.state.errands.get("a1")!.until).toBe(120_000);

    const speak = applyOfficeEvents(
      map,
      arrive.state,
      {
        deliveries: [],
        calls: [{ id: "c2", fromAgentId: "a1", seatIndex: 1, action: "speak", line: "Le plan est prêt." }],
      },
      seatOf,
      10,
    );
    expect(speak.state.bubbles).toEqual([{ agentId: "a1", text: "Le plan est prêt.", until: 10 + 4_500 }]);

    const dismiss = applyOfficeEvents(
      map,
      speak.state,
      { deliveries: [], calls: [{ id: "c3", fromAgentId: "a1", seatIndex: 1, action: "dismiss" }] },
      seatOf,
      20,
    );
    expect(dismiss.state.errands.has("a1")).toBe(false);
    expect(dismiss.processedCallIds).toEqual(["c3"]);
  });

  it("oublie les bulles et les visites expirées", () => {
    const state: ErrandState = {
      errands: new Map([["a1", { kind: "visit", tile: atomic.seats[0], until: 50 }]]),
      bubbles: [{ agentId: "a1", text: "…", until: 50 }],
    };
    const result = applyOfficeEvents(map, state, { deliveries: [], calls: [] }, seatOf, 100);
    expect(result.state.errands.size).toBe(0);
    expect(result.state.bubbles).toEqual([]);
  });
});

describe("desiredSpot avec une course en cours", () => {
  it("la course passe avant le bureau et la pause", () => {
    const errand = { kind: "visit" as const, tile: atomic.seats[0], until: 5_000 };
    expect(
      desiredSpot(map, { id: "a1", poleId: "reequal", seatIndex: 0, status: "break" }, [], 0, 1_000, errand),
    ).toEqual({ kind: "visit", tile: atomic.seats[0] });
  });
});
