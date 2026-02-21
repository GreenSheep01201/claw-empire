import { describe, expect, it } from "vitest";
import {
  compactMeetingPromptText,
  formatMeetingTranscriptForPrompt,
  type MeetingTranscriptLine,
} from "./meeting-prompt-utils.ts";

describe("meeting prompt utils", () => {
  it("compacts long context and respects max budget", () => {
    const source = `${"A".repeat(180)} ${"B".repeat(180)}`;
    const compacted = compactMeetingPromptText(source, 150);
    expect(compacted.length).toBeLessThanOrEqual(150);
    expect(compacted.includes(" … ")).toBe(true);
  });

  it("falls back to hard truncate when maxChars is too small", () => {
    const source = "x".repeat(400);
    const compacted = compactMeetingPromptText(source, 60);
    expect(compacted.length).toBe(60);
    expect(compacted.includes(" … ")).toBe(false);
  });

  it("preserves newlines when context already fits in budget", () => {
    const source = "line-1\n  line-2\n\nline-3";
    const compacted = compactMeetingPromptText(source, 200);
    expect(compacted).toBe("line-1\n  line-2\n\nline-3");
  });

  it("formats empty transcript", () => {
    const rendered = formatMeetingTranscriptForPrompt([], {
      maxTurns: 12,
      maxLineChars: 80,
      maxTotalChars: 400,
      summarize: (text) => text,
    });
    expect(rendered).toBe("(none)");
  });

  it("drops duplicate turns, keeps original numbering, and avoids redundant summarize calls", () => {
    const transcript: MeetingTranscriptLine[] = [
      { speaker: "A", department: "dev", role: "member", content: "same" },
      { speaker: "A", department: "dev", role: "member", content: "same" },
      { speaker: "B", department: "ops", role: "member", content: "next" },
    ];

    let summarizeCalls = 0;
    const rendered = formatMeetingTranscriptForPrompt(transcript, {
      maxTurns: 12,
      maxLineChars: 80,
      maxTotalChars: 400,
      summarize: (text) => {
        summarizeCalls += 1;
        return text;
      },
    });

    expect(rendered).toContain("(compressed: omitted 1 repetitive turn)");
    expect(rendered).toContain("1. A (dev member): same");
    expect(rendered).toContain("3. B (ops member): next");
    expect(summarizeCalls).toBe(2);
  });

  it("omits turns for budget while keeping original numbering and stays within budget", () => {
    const transcript: MeetingTranscriptLine[] = Array.from({ length: 8 }, (_, i) => ({
      speaker: `S${i + 1}`,
      department: "dev",
      role: "member",
      content: `message-${i + 1}-${"x".repeat(25)}`,
    }));

    const rendered = formatMeetingTranscriptForPrompt(transcript, {
      maxTurns: 8,
      maxLineChars: 120,
      maxTotalChars: 260,
      summarize: (text) => text,
    });

    expect(rendered.length).toBeLessThanOrEqual(260);
    expect(rendered).toContain("(compressed: omitted");

    const bodyLines = rendered
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line));
    const numbers = bodyLines.map((line) => Number(line.match(/^\d+/)?.[0] ?? "0"));
    expect(numbers[0]).toBeGreaterThan(1);
    for (let i = 1; i < numbers.length; i += 1) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    }
  });

  it("does not collapse distinct turns that share the same summarized text", () => {
    const transcript: MeetingTranscriptLine[] = [
      { speaker: "A", department: "dev", role: "member", content: "alpha-one" },
      { speaker: "A", department: "dev", role: "member", content: "alpha-two" },
      { speaker: "A", department: "dev", role: "lead", content: "alpha-three" },
    ];

    const rendered = formatMeetingTranscriptForPrompt(transcript, {
      maxTurns: 12,
      maxLineChars: 80,
      maxTotalChars: 600,
      summarize: () => "alpha",
    });

    const bodyLines = rendered
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line));
    expect(bodyLines.length).toBe(3);
    expect(rendered).toContain("(dev member): alpha");
    expect(rendered).toContain("(dev lead): alpha");
  });

  it("enforces total budget even when only headers remain", () => {
    const transcript: MeetingTranscriptLine[] = Array.from({ length: 50 }, () => ({
      speaker: "A",
      department: "dev",
      role: "member",
      content: "same-content",
    }));

    const rendered = formatMeetingTranscriptForPrompt(transcript, {
      maxTurns: 40,
      maxLineChars: 120,
      maxTotalChars: 120,
      summarize: () => "same",
    });

    expect(rendered.length).toBeLessThanOrEqual(120);
  });
});
