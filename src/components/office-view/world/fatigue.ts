import type { CliUsageEntry } from "../../../api";

export type Fatigue = "fresh" | "tired" | "exhausted";

/** Same thresholds as the original office: 80 % of a quota window tires an agent, 100 % wears it out. */
const TIRED_AT = 0.8;
const EXHAUSTED_AT = 1;

export function agentFatigue(usage: Record<string, CliUsageEntry> | null, provider: string | undefined): Fatigue {
  if (!usage || !provider) return "fresh";
  const peak = (usage[provider]?.windows ?? []).reduce((max, window) => Math.max(max, window.utilization), 0);
  if (peak >= EXHAUSTED_AT) return "exhausted";
  if (peak >= TIRED_AT) return "tired";
  return "fresh";
}
