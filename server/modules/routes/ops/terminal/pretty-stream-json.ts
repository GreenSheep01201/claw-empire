export function prettyStreamJson(raw: string, opts: { includeReasoning?: boolean } = {}): string {
  const chunks: string[] = [];
  let sawJson = false;
  let sawClaudeTextDelta = false;
  const includeReasoning = opts.includeReasoning === true;
  let cursorResultText: string | null = null;

  const pushReasoningChunk = (text: string): void => {
    if (!text) return;
    pushMessageChunk(`[reasoning] ${text}`);
  };
  const pushMessageChunk = (text: string): void => {
    if (!text) return;
    if (chunks.length > 0 && !chunks[chunks.length - 1].endsWith("\n")) {
      chunks.push("\n");
    }
    chunks.push(text);
    if (!text.endsWith("\n")) {
      chunks.push("\n");
    }
  };

  const lines = raw.split(/\r?\n/);

  // First pass: check if there's a Cursor-style "result" line with final text.
  // If so, use it as the authoritative output to avoid duplication from
  // streaming assistant deltas + final assistant message + result.
  for (const line of lines) {
    const t = line.trim();
    if (!t || !t.startsWith("{")) continue;
    try {
      const j: any = JSON.parse(t);
      if (j.type === "result" && j.subtype === "success" && typeof j.result === "string" && j.result) {
        cursorResultText = j.result;
      }
    } catch { /* skip */ }
  }

  if (cursorResultText) {
    return cursorResultText.trim();
  }

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith("{")) continue;

    try {
      const j: any = JSON.parse(t);
      sawJson = true;

      if (j.type === "stream_event") {
        const ev = j.event;
        if (ev?.type === "content_block_delta" && ev?.delta?.type === "text_delta") {
          sawClaudeTextDelta = true;
          chunks.push(String(ev.delta.text ?? ""));
          continue;
        }
        if (ev?.type === "content_block_start" && ev?.content_block?.type === "text" && ev?.content_block?.text) {
          chunks.push(String(ev.content_block.text));
          continue;
        }
        continue;
      }

      if (j.type === "assistant" && j.message?.content) {
        let assistantText = "";
        for (const block of j.message.content) {
          if (block.type === "text" && block.text && !sawClaudeTextDelta) {
            assistantText += String(block.text);
          }
        }
        pushMessageChunk(assistantText);
        continue;
      }

      if (j.type === "result" && j.result) {
        pushMessageChunk(String(j.result));
        continue;
      }

      if (j.type === "message" && j.role === "assistant" && j.content) {
        pushMessageChunk(String(j.content));
        continue;
      }

      if (j.type === "item.completed" && j.item) {
        const item = j.item;
        if (item.type === "agent_message" && item.text) {
          pushMessageChunk(String(item.text));
        }
        continue;
      }

      if (j.type === "text") {
        if (j.part?.type === "reasoning" || j.part?.type === "thinking") {
          if (!includeReasoning) continue;
          const reasoningVal =
            typeof j.part?.text === "string" ? j.part.text : typeof j.text === "string" ? j.text : "";
          if (reasoningVal) pushReasoningChunk(String(reasoningVal));
          continue;
        }
        const textVal = typeof j.part?.text === "string" ? j.part.text : typeof j.text === "string" ? j.text : "";
        if (textVal) chunks.push(String(textVal));
        continue;
      }

      if (j.type === "thinking" || j.type === "reasoning") {
        if (includeReasoning) {
          const reasoningVal =
            typeof j.part?.text === "string"
              ? j.part.text
              : typeof j.text === "string"
                ? j.text
                : typeof j.content === "string"
                  ? j.content
                  : "";
          if (reasoningVal) pushReasoningChunk(String(reasoningVal));
        }
        continue;
      }

      if (j.type === "content" && (j.content || j.text)) {
        chunks.push(String(j.content ?? j.text));
        continue;
      }

      if (j.type === "step_finish" || j.type === "step-finish") {
        continue;
      }
      if ((j.type === "tool_use" || j.type === "tool_result") && j.part) {
        continue;
      }

      if (j.role === "assistant") {
        if (typeof j.content === "string") {
          pushMessageChunk(j.content);
        } else if (Array.isArray(j.content)) {
          const parts: string[] = [];
          for (const part of j.content) {
            if (typeof part === "string") {
              parts.push(part);
            } else if (part && typeof part.text === "string") {
              parts.push(part.text);
            }
          }
          pushMessageChunk(parts.join("\n"));
        }
        continue;
      }

      if (typeof j.text === "string" && (j.type === "assistant_message" || j.type === "output_text")) {
        pushMessageChunk(j.text);
        continue;
      }
    } catch {
      // malformed stream-json line
    }
  }

  if (!sawJson) {
    return raw.trim();
  }

  const stitched = chunks.join("");
  const normalized = stitched
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return normalized;
}
