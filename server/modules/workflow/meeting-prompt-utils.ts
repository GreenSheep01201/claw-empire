import { createHash } from "node:crypto";

export interface MeetingTranscriptLine {
  speaker: string;
  department: string;
  role: string;
  content: string;
}

const DEFAULT_SEPARATOR = " … ";

function turnNoun(count: number): string {
  return count === 1 ? "turn" : "turns";
}

function buildDuplicateSignature(turn: MeetingTranscriptLine): string {
  const normalized = turn.content.replace(/\s+/g, " ").trim();
  const contentHash = createHash("sha256").update(normalized).digest("hex");
  return `${turn.speaker}|${turn.department}|${turn.role}|${contentHash}`;
}

function normalizeSummarizedTurn(text: string, maxChars: number): string {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  if (maxChars <= 1) return "…".slice(0, maxChars);
  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

export function compactMeetingPromptText(text: string, maxChars: number): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  if (maxChars <= 0) return "";
  // Keep original formatting/newlines when already within budget.
  if (trimmed.length <= maxChars) return trimmed;

  // For over-budget context, compact only non-line-break whitespace.
  const cleaned = trimmed.replace(/[^\S\r\n]+/g, " ");
  if (cleaned.length <= maxChars) return cleaned;

  const sep = DEFAULT_SEPARATOR;
  const sepLen = sep.length;
  const minHead = 80;
  const minTail = 40;
  const minTotal = minHead + sepLen + minTail;

  if (maxChars < minTotal) return cleaned.slice(0, maxChars);

  const available = maxChars - sepLen;
  let headSize = Math.max(minHead, Math.floor(available * 0.72));
  if (headSize > available - minTail) {
    headSize = available - minTail;
  }
  let tailSize = available - headSize;
  if (tailSize < minTail) {
    tailSize = minTail;
    headSize = available - tailSize;
  }

  return `${cleaned.slice(0, headSize).trimEnd()}${sep}${cleaned.slice(-tailSize).trimStart()}`;
}

export function formatMeetingTranscriptForPrompt(
  transcript: MeetingTranscriptLine[],
  opts: {
    maxTurns: number;
    maxLineChars: number;
    maxTotalChars: number;
    summarize: (text: string, maxChars: number) => string;
  },
): string {
  if (transcript.length === 0) return "(none)";

  const maxTurns = Math.max(1, opts.maxTurns);
  const maxLineChars = Math.max(24, opts.maxLineChars);
  const maxTotalChars = Math.max(120, opts.maxTotalChars);

  const recent = transcript.slice(-maxTurns);
  const omittedEarlierTurns = Math.max(0, transcript.length - recent.length);

  const uniqueEntries: Array<{
    speaker: string;
    department: string;
    role: string;
    summarized: string;
    originalTurnNumber: number;
  }> = [];
  const seen = new Set<string>();
  let droppedDuplicateTurns = 0;

  for (let i = 0; i < recent.length; i += 1) {
    const turn = recent[i];
    const sig = buildDuplicateSignature(turn);
    if (seen.has(sig)) {
      droppedDuplicateTurns += 1;
      continue;
    }
    seen.add(sig);

    const summarized = normalizeSummarizedTurn(opts.summarize(turn.content, maxLineChars), maxLineChars);
    uniqueEntries.push({
      speaker: turn.speaker,
      department: turn.department,
      role: turn.role,
      summarized,
      originalTurnNumber: omittedEarlierTurns + i + 1,
    });
  }

  const baseHeader: string[] = [];
  if (omittedEarlierTurns > 0) {
    baseHeader.push(`(compressed: omitted ${omittedEarlierTurns} earlier ${turnNoun(omittedEarlierTurns)})`);
  }
  if (droppedDuplicateTurns > 0) {
    baseHeader.push(`(compressed: omitted ${droppedDuplicateTurns} repetitive ${turnNoun(droppedDuplicateTurns)})`);
  }

  const bodyLinesAll = uniqueEntries.map((entry) => (
    `${entry.originalTurnNumber}. ${entry.speaker} (${entry.department} ${entry.role}): ${entry.summarized}`
  ));

  let startIndex = 0;

  while (true) {
    const droppedByBudgetTurns = startIndex;
    const header = [...baseHeader];
    if (droppedByBudgetTurns > 0) {
      header.push(`(compressed: omitted ${droppedByBudgetTurns} ${turnNoun(droppedByBudgetTurns)} for token budget)`);
    }

    const remainingLines = bodyLinesAll.slice(startIndex);
    const body = remainingLines.length > 0 ? remainingLines.join("\n") : "(none)";
    const rendered = header.length > 0 ? `${header.join("\n")}\n${body}` : body;

    if (rendered.length <= maxTotalChars) {
      return rendered;
    }

    if (startIndex >= bodyLinesAll.length) {
      return rendered.slice(0, maxTotalChars);
    }

    startIndex += 1;
  }
}
