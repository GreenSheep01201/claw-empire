import { useCallback, type RefObject } from "react";
import type { Message } from "../../types";
import type { DecisionOption } from "../chat/decision-request";
import { isPromiseLike, type ChatMode } from "./model";

type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface UseDecisionReplyHandlersParams {
  tr: Tr;
  onSendMessage: (
    content: string,
    receiverType: "agent" | "department" | "all",
    receiverId?: string,
    messageType?: string,
  ) => void | Promise<void>;
  setDecisionReplyKey: (value: string | null | ((prev: string | null) => string | null)) => void;
  setMode: (mode: ChatMode) => void;
  setInput: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useDecisionReplyHandlers({
  tr,
  onSendMessage,
  setDecisionReplyKey,
  setMode,
  setInput,
  textareaRef,
}: UseDecisionReplyHandlersParams) {
  const handleDecisionOptionReply = useCallback(
    (msg: Message, option: DecisionOption) => {
      const receiverId = msg.sender_id;
      if (!receiverId) return;

      const replyContent = tr(
        `[의사결정 회신] ${option.number}번으로 진행해 주세요. (${option.label})`,
        `[Decision Reply] Please proceed with option ${option.number}. (${option.label})`,
        `[意思決定返信] ${option.number}番で進めてください。(${option.label})`,
        `[决策回复] 请按选项 ${option.number} 推进。（${option.label}）`,
        `[Réponse à la décision] Merci de poursuivre avec l'option ${option.number}. (${option.label})`,
      );
      const key = `${msg.id}:${option.number}`;
      setDecisionReplyKey(key);
      const sendResult = onSendMessage(replyContent, "agent", receiverId, "chat");
      if (isPromiseLike(sendResult)) {
        sendResult.finally(() => setDecisionReplyKey((prev) => (prev === key ? null : prev)));
        return;
      }
      setDecisionReplyKey(null);
    },
    [onSendMessage, setDecisionReplyKey, tr],
  );

  const handleDecisionManualDraft = useCallback(
    (option: DecisionOption) => {
      setMode("chat");
      setInput(
        tr(
          `${option.number}번으로 진행해 주세요. 추가 코멘트: `,
          `Please proceed with option ${option.number}. Additional note: `,
          `${option.number}番で進めてください。追記事項: `,
          `请按选项 ${option.number} 推进。补充说明：`,
          `Merci de poursuivre avec l'option ${option.number}. Précision : `,
        ),
      );
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [setInput, setMode, textareaRef, tr],
  );

  return { handleDecisionOptionReply, handleDecisionManualDraft };
}
