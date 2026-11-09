import type { KeyboardEvent, RefObject } from "react";
import { ClipboardList, FileText, Megaphone, Send } from "lucide-react";
import type { Agent } from "../../types";
import ChatModeHint from "./ChatModeHint";

type ChatMode = "chat" | "task" | "announcement" | "report";
type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface ChatComposerProps {
  mode: ChatMode;
  input: string;
  selectedAgent: Agent | null;
  isDirectiveMode: boolean;
  isAnnouncementMode: boolean;
  tr: Tr;
  getAgentName: (agent: Agent | null | undefined) => string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: ChatMode) => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export default function ChatComposer({
  mode,
  input,
  selectedAgent,
  isDirectiveMode,
  isAnnouncementMode,
  tr,
  getAgentName,
  textareaRef,
  onModeChange,
  onInputChange,
  onSend,
  onKeyDown,
}: ChatComposerProps) {
  const placeholder = isAnnouncementMode
    ? tr(
        "전사 공지 내용을 입력하세요...",
        "Write an announcement...",
        "全体告知内容を入力してください...",
        "请输入公告内容...",
        "Écrire une annonce…",
      )
    : mode === "task"
      ? tr(
          "업무 지시 내용을 입력하세요...",
          "Write a task instruction...",
          "タスク指示内容を入力してください...",
          "请输入任务指示内容...",
          "Décrire la tâche à confier…",
        )
      : mode === "report"
        ? tr(
            "보고 요청 내용을 입력하세요...",
            "Write a report request...",
            "レポート依頼内容を入力してください...",
            "请输入报告请求内容...",
            "Décrire le rapport souhaité…",
          )
        : selectedAgent
          ? tr(
              `${getAgentName(selectedAgent)}에게 메시지 보내기...`,
              `Send a message to ${getAgentName(selectedAgent)}...`,
              `${getAgentName(selectedAgent)}にメッセージを送る...`,
              `向 ${getAgentName(selectedAgent)} 发送消息...`,
              `Écrire à ${getAgentName(selectedAgent)}…`,
            )
          : tr(
              "메시지를 입력하세요...",
              "Type a message...",
              "メッセージを入力してください...",
              "请输入消息...",
              "Écrire un message…",
            );

  return (
    <>
      <div
        className="flex flex-shrink-0 gap-2 border-t border-[var(--th-border)] px-4 pb-1 pt-3"
        role="group"
        aria-label={tr("메시지 유형", "Message type", "メッセージ種別", "消息类型", "Type de message")}
      >
        <button
          type="button"
          onClick={() => onModeChange(mode === "task" ? "chat" : "task")}
          disabled={!selectedAgent}
          aria-pressed={mode === "task"}
          className="qg-choice flex-1 justify-center px-2"
        >
          <ClipboardList size={16} aria-hidden />
          <span>{tr("업무 지시", "Task", "タスク指示", "任务指示", "Tâche")}</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange(mode === "announcement" ? "chat" : "announcement")}
          aria-pressed={mode === "announcement"}
          className="qg-choice flex-1 justify-center px-2"
        >
          <Megaphone size={16} aria-hidden />
          <span>{tr("전사 공지", "Announcement", "全体告知", "全员公告", "Annonce")}</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange(mode === "report" ? "chat" : "report")}
          disabled={!selectedAgent}
          aria-pressed={mode === "report"}
          className="qg-choice flex-1 justify-center px-2"
        >
          <FileText size={16} aria-hidden />
          <span>{tr("보고 요청", "Report", "レポート依頼", "报告请求", "Rapport")}</span>
        </button>
      </div>

      <ChatModeHint mode={mode} isDirectiveMode={isDirectiveMode} tr={tr} />

      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            className="qg-textarea max-h-32 min-h-[44px] flex-1 resize-none overflow-y-auto leading-relaxed"
            style={{ scrollbarWidth: "none" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim()}
            className="qg-btn qg-btn--primary h-11 w-11 flex-shrink-0 !px-0"
            aria-label={tr("전송", "Send", "送信", "发送", "Envoyer")}
          >
            <Send size={16} aria-hidden />
          </button>
        </div>
        <p className="qg-text-muted mt-1.5 px-1 text-[13px]">
          {tr(
            "Enter로 전송, Shift+Enter로 줄바꿈",
            "Press Enter to send, Shift+Enter for a new line",
            "Enterで送信、Shift+Enterで改行",
            "按 Enter 发送，Shift+Enter 换行",
            "Entrée pour envoyer, Maj+Entrée pour aller à la ligne",
          )}
        </p>
      </div>
    </>
  );
}
