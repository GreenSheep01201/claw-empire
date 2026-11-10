import type { OfficeMap, TilePoint } from "./officeMap";
import type { Errand } from "./movement";

export interface SpeechBubble {
  agentId: string;
  text: string;
  until: number;
}

export interface ErrandState {
  errands: Map<string, Errand>;
  bubbles: SpeechBubble[];
}

export interface OfficeEvents {
  deliveries: { id: string; fromAgentId: string; toAgentId: string }[];
  calls: {
    id: string;
    fromAgentId: string;
    seatIndex: number;
    action?: "arrive" | "speak" | "dismiss";
    line?: string;
  }[];
}

/** Time an agent spends on a visit to a colleague, walking included. */
const VISIT_MS = 9_000;
const BUBBLE_MS = 4_500;
/** Safety net: a CEO-office visit ends on its own if the dismiss event never comes. */
const CEO_VISIT_MAX_MS = 120_000;

/**
 * Turns incoming office events into agent errands and speech bubbles, drops
 * what has expired, and reports which events were consumed so the app can
 * clear them (each event plays once).
 */
export function applyOfficeEvents(
  map: OfficeMap,
  state: ErrandState,
  events: OfficeEvents,
  seatOf: (agentId: string) => TilePoint | undefined,
  now: number,
): { state: ErrandState; processedDeliveryIds: string[]; processedCallIds: string[] } {
  const errands = new Map([...state.errands].filter(([, errand]) => errand.until > now));
  const bubbles = state.bubbles.filter((bubble) => bubble.until > now);
  const processedDeliveryIds: string[] = [];
  const processedCallIds: string[] = [];

  for (const delivery of events.deliveries) {
    processedDeliveryIds.push(delivery.id);
    const colleague = seatOf(delivery.toAgentId);
    if (!colleague) continue;
    // Stand in the free row just behind the colleague's seat.
    errands.set(delivery.fromAgentId, {
      kind: "visit",
      tile: { col: colleague.col, row: colleague.row - 1 },
      until: now + VISIT_MS,
    });
  }

  const visitorSeats = map.rooms.find((room) => room.kind === "ceo")?.seats ?? [];
  for (const call of events.calls) {
    processedCallIds.push(call.id);
    const action = call.action ?? "arrive";
    if (action === "dismiss") {
      errands.delete(call.fromAgentId);
      continue;
    }
    if (action === "arrive" && visitorSeats.length > 0) {
      errands.set(call.fromAgentId, {
        kind: "ceo",
        tile: visitorSeats[call.seatIndex % visitorSeats.length],
        until: now + CEO_VISIT_MAX_MS,
      });
    }
    if (action === "speak" && call.line) {
      bubbles.push({ agentId: call.fromAgentId, text: call.line, until: now + BUBBLE_MS });
    }
  }

  return { state: { errands, bubbles }, processedDeliveryIds, processedCallIds };
}
