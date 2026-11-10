import type { RefObject } from "react";
import { Megaphone, MessagesSquare, PenLine, Zap } from "lucide-react";
import type { Agent, Message } from "../../types";
import type { DecisionOption } from "../chat/decision-request";
import AgentAvatar from "../AgentAvatar";
import MessageContent from "../MessageContent";

type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface StreamingMessageLike {
  message_id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar: string;
  content: string;
}

interface ChatMessageListProps {
  selectedAgent: Agent | null;
  visibleMessages: Message[];
  agents: Agent[];
  spriteMap: ReturnType<typeof import("../AgentAvatar").buildSpriteMap>;
  locale: string;
  tr: Tr;
  getAgentName: (agent: Agent | null | undefined) => string;
  decisionRequestByMessage: Map<string, { options: DecisionOption[] }>;
  decisionReplyKey: string | null;
  onDecisionOptionReply: (message: Message, option: DecisionOption) => void;
  onDecisionManualDraft: (option: DecisionOption) => void;
  streamingMessage?: StreamingMessageLike | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

function formatTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

const AGENT_BUBBLE =
  "rounded-2xl rounded-bl-sm border border-[var(--th-border)] bg-[var(--th-bg-primary)] text-[var(--th-text-primary)]";
const CEO_BUBBLE = "rounded-2xl rounded-br-sm bg-[var(--qg-accent)] text-[var(--qg-accent-ink)]";
const META_TEXT = "qg-text-muted px-1 text-[13px]";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className={`flex items-center gap-1 px-4 py-3 ${AGENT_BUBBLE}`}>
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-[var(--th-text-muted)]"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-[var(--th-text-muted)]"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-[var(--th-text-muted)]"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}

function normalizeMessageSenderName(msg: Message): string {
  return typeof msg.sender_name === "string" ? msg.sender_name.trim() : "";
}

function normalizeMessageSenderAvatar(msg: Message): string {
  const avatar = typeof msg.sender_avatar === "string" ? msg.sender_avatar.trim() : "";
  return avatar || "🤖";
}

function buildFallbackSenderAgent(msg: Message): Agent | undefined {
  const displayName = normalizeMessageSenderName(msg) || msg.sender_id || "";
  if (!displayName) return undefined;
  return {
    id: msg.sender_id || `msg-sender-${msg.id}`,
    name: displayName,
    name_ko: displayName,
    name_ja: displayName,
    name_zh: displayName,
    department_id: null,
    role: "junior",
    cli_provider: "api",
    avatar_emoji: normalizeMessageSenderAvatar(msg),
    personality: null,
    status: "idle",
    current_task_id: null,
    stats_tasks_done: 0,
    stats_xp: 0,
    created_at: msg.created_at,
  };
}

interface DecisionRequestBlockProps {
  msg: Message;
  options: DecisionOption[];
  decisionReplyKey: string | null;
  tr: Tr;
  onDecisionOptionReply: (message: Message, option: DecisionOption) => void;
  onDecisionManualDraft: (option: DecisionOption) => void;
}

function DecisionRequestBlock({
  msg,
  options,
  decisionReplyKey,
  tr,
  onDecisionOptionReply,
  onDecisionManualDraft,
}: DecisionRequestBlockProps) {
  return (
    <div className="qg-card !p-3">
      <p className="text-[13px] font-semibold text-[var(--th-text-heading)]">
        {tr("의사결정 요청", "Decision request", "意思決定リクエスト", "决策请求", "Décision à prendre")}
      </p>
      <div className="mt-2 space-y-1.5">
        {options.map((option) => {
          const key = `${msg.id}:${option.number}`;
          const isBusy = decisionReplyKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDecisionOptionReply(msg, option)}
              disabled={isBusy}
              className="qg-choice"
            >
              {isBusy
                ? tr("전송 중...", "Sending...", "送信中...", "发送中...", "Envoi…")
                : `${option.number}. ${option.label}`}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onDecisionManualDraft(options[0])}
        className="qg-btn qg-btn--sm qg-btn--ghost mt-2"
      >
        <PenLine size={16} aria-hidden />
        {tr("직접 답변 작성", "Write custom reply", "カスタム返信を作成", "编写自定义回复", "Rédiger ma réponse")}
      </button>
    </div>
  );
}

export default function ChatMessageList({
  selectedAgent,
  visibleMessages,
  agents,
  spriteMap,
  locale,
  tr,
  getAgentName,
  decisionRequestByMessage,
  decisionReplyKey,
  onDecisionOptionReply,
  onDecisionManualDraft,
  streamingMessage,
  messagesEndRef,
}: ChatMessageListProps) {
  const isStreamingForAgent = Boolean(
    streamingMessage && selectedAgent && streamingMessage.agent_id === selectedAgent.id,
  );

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {visibleMessages.length === 0 ? (
        <div className="qg-empty flex h-full flex-col items-center justify-center gap-3">
          <MessagesSquare size={32} aria-hidden className="text-[var(--th-text-muted)]" />
          <div>
            <p className="font-semibold text-[var(--th-text-secondary)]">
              {tr(
                "대화를 시작해보세요! 👋",
                "Start a conversation! 👋",
                "会話を始めましょう! 👋",
                "开始对话吧! 👋",
                "Commencez la conversation",
              )}
            </p>
            <p className="mt-1 text-sm">
              {selectedAgent
                ? tr(
                    `${getAgentName(selectedAgent)}에게 메시지를 보내보세요`,
                    `Send a message to ${getAgentName(selectedAgent)}`,
                    `${getAgentName(selectedAgent)}にメッセージを送ってみましょう`,
                    `给 ${getAgentName(selectedAgent)} 发送一条消息吧`,
                    `Écrivez un message à ${getAgentName(selectedAgent)}`,
                  )
                : tr(
                    "전체 에이전트에게 공지를 보내보세요",
                    "Send an announcement to all agents",
                    "すべてのエージェントに告知を送ってみましょう",
                    "给所有代理发送一条公告吧",
                    "Envoyez une annonce à toute l'équipe",
                  )}
            </p>
          </div>
        </div>
      ) : (
        <>
          {visibleMessages.map((msg) => {
            const isCeo = msg.sender_type === "ceo";
            const isDirective = msg.message_type === "directive";
            const isAnnouncement = msg.message_type === "announcement";
            const isSystem = msg.sender_type === "system" || isAnnouncement || isDirective;

            const senderAgent =
              msg.sender_agent ?? agents.find((agent) => agent.id === msg.sender_id) ?? buildFallbackSenderAgent(msg);
            const senderNameFromPayload = normalizeMessageSenderName(msg);
            const ceoLabel = tr("CEO", "CEO", "CEO", "CEO", "Vous");
            const senderName = isCeo
              ? ceoLabel
              : isSystem
                ? tr("시스템", "System", "システム", "系统", "Système")
                : getAgentName(senderAgent) ||
                  senderNameFromPayload ||
                  tr("알 수 없음", "Unknown", "不明", "未知", "Inconnu");
            const decisionRequest = decisionRequestByMessage.get(msg.id);
            const decisionBlock = decisionRequest ? (
              <DecisionRequestBlock
                msg={msg}
                options={decisionRequest.options}
                decisionReplyKey={decisionReplyKey}
                tr={tr}
                onDecisionOptionReply={onDecisionOptionReply}
                onDecisionManualDraft={onDecisionManualDraft}
              />
            ) : null;

            if (msg.sender_type === "agent" && msg.receiver_type === "all") {
              return (
                <div key={msg.id} className="flex items-end gap-2">
                  <AgentAvatar agent={senderAgent} spriteMap={spriteMap} size={28} />
                  <div className="flex max-w-[75%] flex-col gap-1">
                    <span className={META_TEXT}>{senderName}</span>
                    <div className={`${AGENT_BUBBLE} px-4 py-2.5 text-sm`}>
                      <MessageContent content={msg.content} />
                    </div>
                    {decisionBlock}
                    <span className={META_TEXT}>{formatTime(msg.created_at, locale)}</span>
                  </div>
                </div>
              );
            }

            if (isSystem || msg.receiver_type === "all") {
              return (
                <div key={msg.id} className="flex flex-col items-center gap-1">
                  {isDirective ? (
                    <span className="qg-badge qg-badge--accent">
                      <Zap size={16} aria-hidden />
                      {tr("업무지시", "Directive", "業務指示", "业务指示", "Directive")}
                    </span>
                  ) : isAnnouncement ? (
                    <span className="qg-badge">
                      <Megaphone size={16} aria-hidden />
                      {tr("전사 공지", "Announcement", "全体告知", "全员公告", "Annonce à l'équipe")}
                    </span>
                  ) : null}
                  <div className="max-w-[85%] rounded-[var(--qg-radius)] border border-dashed border-[var(--th-border-strong)] px-4 py-2.5 text-center text-sm text-[var(--th-text-secondary)]">
                    <MessageContent content={msg.content} />
                  </div>
                  <span className={META_TEXT}>{formatTime(msg.created_at, locale)}</span>
                </div>
              );
            }

            if (isCeo) {
              return (
                <div key={msg.id} className="flex flex-col items-end gap-1">
                  <span className={META_TEXT}>{ceoLabel}</span>
                  <div className={`max-w-[80%] px-4 py-2.5 text-sm ${CEO_BUBBLE}`}>
                    <MessageContent content={msg.content} />
                  </div>
                  <span className={META_TEXT}>{formatTime(msg.created_at, locale)}</span>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-end gap-2">
                <AgentAvatar agent={senderAgent} spriteMap={spriteMap} size={28} />
                <div className="flex max-w-[75%] flex-col gap-1">
                  <span className={META_TEXT}>{senderName}</span>
                  <div className={`${AGENT_BUBBLE} px-4 py-2.5 text-sm`}>
                    <MessageContent content={msg.content} />
                  </div>
                  {decisionBlock}
                  <span className={META_TEXT}>{formatTime(msg.created_at, locale)}</span>
                </div>
              </div>
            );
          })}

          {isStreamingForAgent && streamingMessage?.content && (
            <div className="flex items-end gap-2">
              <AgentAvatar agent={selectedAgent ?? undefined} spriteMap={spriteMap} size={28} />
              <div className="flex max-w-[75%] flex-col gap-1">
                <span className={META_TEXT}>{getAgentName(selectedAgent)}</span>
                <div className={`${AGENT_BUBBLE} px-4 py-2.5 text-sm`}>
                  <MessageContent content={streamingMessage.content} />
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--qg-accent)] align-text-bottom"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedAgent && selectedAgent.status === "working" && !isStreamingForAgent && (
            <div className="flex items-end gap-2">
              <AgentAvatar agent={selectedAgent} spriteMap={spriteMap} size={28} />
              <TypingIndicator />
            </div>
          )}
        </>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
