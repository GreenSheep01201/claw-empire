import { describe, expect, it } from "vitest";
import { agentFatigue } from "./fatigue";

const usage = {
  claude: {
    windows: [
      { label: "5-hour", utilization: 0.5, resetsAt: null },
      { label: "7-day", utilization: 0.85, resetsAt: null },
    ],
    error: null,
  },
  codex: { windows: [{ label: "Primary", utilization: 1, resetsAt: null }], error: null },
  gemini: { windows: [{ label: "2.5 Pro", utilization: 0.2, resetsAt: null }], error: null },
};

describe("agentFatigue", () => {
  it("suit la fenêtre de quota la plus chargée du fournisseur de l'agent", () => {
    expect(agentFatigue(usage, "gemini")).toBe("fresh");
    expect(agentFatigue(usage, "claude")).toBe("tired");
    expect(agentFatigue(usage, "codex")).toBe("exhausted");
  });

  it("reste en forme sans données d'usage ou sans fournisseur", () => {
    expect(agentFatigue(null, "claude")).toBe("fresh");
    expect(agentFatigue(usage, undefined)).toBe("fresh");
    expect(agentFatigue(usage, "kimi")).toBe("fresh");
  });
});
