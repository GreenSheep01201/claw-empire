import { describe, expect, it } from "vitest";
import { generateOfficeMap } from "./officeMap";
import { interactionAt } from "./interaction";
import { tileToPixel } from "./worldGeometry";

const map = generateOfficeMap({ poles: [{ id: "reequal", seats: 2 }] });
const pole = map.rooms.find((room) => room.kind === "pole")!;
const meeting = map.rooms.find((room) => room.kind === "meeting")!;
const seat = tileToPixel(map, pole.seats[0]);
const agents = [{ id: "a1", x: seat.x, y: seat.y }];
const inPoleFarFromAgents = tileToPixel(map, { col: pole.col + pole.width - 3, row: pole.row + pole.height - 2 });

describe("interactionAt", () => {
  it("ne propose rien dans le couloir", () => {
    expect(
      interactionAt({
        map,
        avatar: tileToPixel(map, map.spawn),
        agents,
        pinnedAgentIds: new Set(),
        meetingActive: false,
      }),
    ).toBeNull();
  });

  it("propose d'ouvrir le pôle quand on est dans sa salle", () => {
    expect(
      interactionAt({ map, avatar: inPoleFarFromAgents, agents, pinnedAgentIds: new Set(), meetingActive: false }),
    ).toEqual({ kind: "pole", poleId: "reequal" });
  });

  it("propose de discuter quand on s'approche d'un agent", () => {
    const near = { x: seat.x + 20, y: seat.y + 20 };
    expect(interactionAt({ map, avatar: near, agents, pinnedAgentIds: new Set(), meetingActive: false })).toEqual({
      kind: "agent",
      agentId: "a1",
    });
  });

  it("donne la priorité à l'épingle rouge d'un agent qui attend une validation", () => {
    const near = { x: seat.x + 20, y: seat.y + 20 };
    expect(interactionAt({ map, avatar: near, agents, pinnedAgentIds: new Set(["a1"]), meetingActive: false })).toEqual(
      {
        kind: "pin",
        agentId: "a1",
      },
    );
  });

  it("propose le compte rendu dans la salle de réunion seulement pendant une réunion", () => {
    const inside = tileToPixel(map, { col: meeting.col + 2, row: meeting.row + 2 });
    expect(interactionAt({ map, avatar: inside, agents, pinnedAgentIds: new Set(), meetingActive: true })).toEqual({
      kind: "meeting",
    });
    expect(interactionAt({ map, avatar: inside, agents, pinnedAgentIds: new Set(), meetingActive: false })).toBeNull();
  });
});
