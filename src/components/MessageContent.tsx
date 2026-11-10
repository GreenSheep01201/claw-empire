/**
 * Lightweight markdown renderer for chat messages.
 * Handles: tables, bold, italic, links, inline code, code blocks, headers, lists.
 */

import type { JSX } from "react";

interface MessageContentProps {
  content: string;
  className?: string;
}

/** Parse a markdown table string into header + rows */
function parseTable(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return null;

  const parseCells = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = parseCells(lines[0]);
  // Check line[1] is separator (---|----|---)
  const sep = lines[1];
  if (!/^[\s|:-]+$/.test(sep)) return null;

  const rows = lines.slice(2).map(parseCells);
  return { headers, rows };
}

/** Render inline markdown: bold, italic, code, links */
function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  // Pattern: **bold**, *italic*, `code`, [text](url), @mention
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[([^\]]+)\]\(([^)]+)\))|(@[\w가-힣]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={key++} className="font-bold">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={key++} className="italic">
          {match[4]}
        </em>,
      );
    } else if (match[5]) {
      // `code`
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 bg-[color-mix(in_srgb,currentColor_10%,transparent)] rounded text-[13px] font-mono"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      // [text](url)
      parts.push(
        <a
          key={key++}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:opacity-80"
        >
          {match[8]}
        </a>,
      );
    } else if (match[10]) {
      // @mention
      parts.push(
        <span
          key={key++}
          className="px-1 py-0.5 bg-[color-mix(in_srgb,currentColor_10%,transparent)] rounded font-semibold"
        >
          {match[10]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

export default function MessageContent({ content, className = "" }: MessageContentProps) {
  // Split content into blocks (code blocks, tables, and regular text)
  const blocks: { type: "text" | "code" | "table"; content: string }[] = [];

  // Extract fenced code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let cbMatch: RegExpExecArray | null;

  while ((cbMatch = codeBlockRegex.exec(content)) !== null) {
    if (cbMatch.index > lastIdx) {
      blocks.push({ type: "text", content: content.slice(lastIdx, cbMatch.index) });
    }
    blocks.push({ type: "code", content: cbMatch[2].trimEnd() });
    lastIdx = cbMatch.index + cbMatch[0].length;
  }
  if (lastIdx < content.length) {
    blocks.push({ type: "text", content: content.slice(lastIdx) });
  }

  // Further split text blocks to extract tables
  const finalBlocks: typeof blocks = [];
  for (const block of blocks) {
    if (block.type !== "text") {
      finalBlocks.push(block);
      continue;
    }

    // Look for table patterns (lines starting with |)
    const lines = block.content.split("\n");
    let tableLines: string[] = [];
    let textLines: string[] = [];

    for (const line of lines) {
      if (/^\s*\|/.test(line)) {
        if (textLines.length > 0) {
          finalBlocks.push({ type: "text", content: textLines.join("\n") });
          textLines = [];
        }
        tableLines.push(line);
      } else {
        if (tableLines.length > 0) {
          finalBlocks.push({ type: "table", content: tableLines.join("\n") });
          tableLines = [];
        }
        textLines.push(line);
      }
    }
    if (tableLines.length > 0) {
      finalBlocks.push({ type: "table", content: tableLines.join("\n") });
    }
    if (textLines.length > 0) {
      finalBlocks.push({ type: "text", content: textLines.join("\n") });
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {finalBlocks.map((block, bi) => {
        if (block.type === "code") {
          return (
            <pre
              key={bi}
              className="bg-[color-mix(in_srgb,currentColor_10%,transparent)] border border-[color-mix(in_srgb,currentColor_22%,transparent)] rounded-lg px-3 py-2 text-[13px] font-mono overflow-x-auto whitespace-pre-wrap"
            >
              {block.content}
            </pre>
          );
        }

        if (block.type === "table") {
          const table = parseTable(block.content);
          if (table) {
            return (
              <div
                key={bi}
                className="overflow-x-auto rounded-lg border border-[color-mix(in_srgb,currentColor_22%,transparent)]"
              >
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[color-mix(in_srgb,currentColor_10%,transparent)]">
                      {table.headers.map((h, hi) => (
                        <th
                          key={hi}
                          className="px-2.5 py-1.5 text-left font-semibold border-b border-[color-mix(in_srgb,currentColor_22%,transparent)] whitespace-nowrap"
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className={ri % 2 === 0 ? "" : "bg-[color-mix(in_srgb,currentColor_10%,transparent)]"}
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-2.5 py-1.5 border-b border-[color-mix(in_srgb,currentColor_22%,transparent)] whitespace-nowrap"
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          // Fallback: render as text if not a valid table
          return <span key={bi}>{block.content}</span>;
        }

        // Text block: handle headers, lists, paragraphs
        const textLines = block.content.split("\n");
        return (
          <div key={bi}>
            {textLines.map((line, li) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={li} className="h-1" />;

              // Headers
              if (trimmed.startsWith("### ")) {
                return (
                  <div key={li} className="font-bold text-sm mt-1">
                    {renderInline(trimmed.slice(4))}
                  </div>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <div key={li} className="font-bold text-sm mt-1">
                    {renderInline(trimmed.slice(3))}
                  </div>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <div key={li} className="font-bold mt-1">
                    {renderInline(trimmed.slice(2))}
                  </div>
                );
              }

              // Unordered list
              if (/^[-*]\s/.test(trimmed)) {
                return (
                  <div key={li} className="flex gap-1.5 items-start">
                    <span className="opacity-60 mt-0.5 shrink-0">•</span>
                    <span>{renderInline(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Ordered list
              const olMatch = trimmed.match(/^(\d+)[.)]\s(.*)/);
              if (olMatch) {
                return (
                  <div key={li} className="flex gap-1.5 items-start">
                    <span className="opacity-60 mt-0.5 shrink-0 min-w-[1em] text-right">{olMatch[1]}.</span>
                    <span>{renderInline(olMatch[2])}</span>
                  </div>
                );
              }

              // Horizontal rule
              if (/^[-*_]{3,}$/.test(trimmed)) {
                return <hr key={li} className="border-[color-mix(in_srgb,currentColor_22%,transparent)] my-1" />;
              }

              // Normal paragraph
              return <div key={li}>{renderInline(trimmed)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}
