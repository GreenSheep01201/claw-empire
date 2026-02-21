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
  const cleaned = trimmed.replace(/[^\S\r\n\u2028\u2029]+/g, " ");
  if (cleaned.length <= maxChars) return cleaned;

  const sep = DEFAULT_SEPARATOR;
  const sepLen = sep.length;
  const minHead = 80;
  const minTail = 40;
  const minTotal = minHead + sepLen + minTail;

  if (maxChars < minTotal) return cleaned.slice(0, maxChars);

  const available = maxChars - sepLen;
  const maxHead = available - minTail;
  const headSize = Math.min(Math.max(minHead, Math.floor(available * 0.72)), maxHead);
  const tailSize = available - headSize;

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
  let droppedEmptySummaryTurns = 0;

  for (let i = 0; i < recent.length; i += 1) {
    const turn = recent[i];
    // Intentionally dedupe by normalized original content hash (not summarized text),
    // so distinct turns that collapse to the same short summary are still preserved.
    const sig = buildDuplicateSignature(turn);
    if (seen.has(sig)) {
      droppedDuplicateTurns += 1;
      continue;
    }
    seen.add(sig);

    const summarized = normalizeSummarizedTurn(opts.summarize(turn.content, maxLineChars), maxLineChars);
    if (!summarized) {
      droppedEmptySummaryTurns += 1;
      continue;
    }

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
  if (droppedEmptySummaryTurns > 0) {
    baseHeader.push(`(compressed: omitted ${droppedEmptySummaryTurns} empty-summary ${turnNoun(droppedEmptySummaryTurns)})`);
  }

  const bodyLinesAll = uniqueEntries.map((entry) => (
    `${entry.originalTurnNumber}. ${entry.speaker} (${entry.department} ${entry.role}): ${entry.summarized}`
  ));

  let startIndex = 0;

  // NOTE: This scan is O(m²) in the number of retained lines because it
  // may re-render while incrementing `startIndex` one by one. In practice,
  // m is bounded by MEETING_TRANSCRIPT_MAX_TURNS (default 12), so this keeps
  // the implementation simple and predictable for current runtime limits.
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
