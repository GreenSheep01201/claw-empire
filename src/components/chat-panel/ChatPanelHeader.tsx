import { Megaphone, Trash2, X } from "lucide-react";
import AgentAvatar from "../AgentAvatar";
import type { Agent } from "../../types";

type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface ChatPanelHeaderProps {
  selectedAgent: Agent | null;
  selectedDeptName?: string | null;
  spriteMap: ReturnType<typeof import("../AgentAvatar").buildSpriteMap>;
  tr: Tr;
  getAgentName: (agent: Agent | null | undefined) => string;
  getRoleLabel: (role: string) => string;
  getStatusLabel: (status: string) => string;
  statusColors: Record<string, string>;
  showAnnouncementBanner: boolean;
  visibleMessagesLength: number;
  onClearMessages?: (agentId?: string) => void;
  onClose: () => void;
}

export default function ChatPanelHeader({
  selectedAgent,
  selectedDeptName,
  spriteMap,
  tr,
  getAgentName,
  getRoleLabel,
  getStatusLabel,
  statusColors,
  showAnnouncementBanner,
  visibleMessagesLength,
  onClearMessages,
  onClose,
}: ChatPanelHeaderProps) {
  const clearLabel = tr(
    "대화 내역 삭제",
    "Clear message history",
    "会話履歴を削除",
    "清除消息记录",
    "Effacer la conversation",
  );

  return (
    <>
      <div className="qg-dialog__header flex-shrink-0 !pl-4">
        {selectedAgent ? (
          <>
            <div className="relative flex-shrink-0">
              <AgentAvatar agent={selectedAgent} spriteMap={spriteMap} size={40} />
              <span
                aria-hidden
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--th-bg-surface)] ${
                  statusColors[selectedAgent.status] ?? "bg-[var(--th-border-strong)]"
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="qg-dialog__title truncate !text-base">{getAgentName(selectedAgent)}</h2>
                <span className="qg-badge">{getRoleLabel(selectedAgent.role)}</span>
              </div>
              <div className="qg-text-muted mt-0.5 flex items-center gap-1.5 text-[13px]">
                <span className="truncate">{selectedDeptName}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{getStatusLabel(selectedAgent.status)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--qg-accent-soft)] text-[var(--qg-accent)]">
              <Megaphone size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="qg-dialog__title truncate !text-base">
                {tr("전사 공지", "Company Announcement", "全体告知", "全员公告", "Annonce à l'équipe")}
              </h2>
              <div className="qg-text-muted mt-0.5 text-[13px]">
                {tr(
                  "모든 에이전트에게 전달됩니다",
                  "Sent to all agents",
                  "すべてのエージェントに送信されます",
                  "将发送给所有代理",
                  "Envoyée à toute l'équipe",
                )}
              </div>
            </div>
          </>
        )}

        <div className="qg-dialog__actions flex-shrink-0">
          {onClearMessages && visibleMessagesLength > 0 && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    selectedAgent
                      ? tr(
                          `${getAgentName(selectedAgent)}와의 대화를 삭제하시겠습니까?`,
                          `Delete conversation with ${getAgentName(selectedAgent)}?`,
                          `${getAgentName(selectedAgent)}との会話を削除しますか？`,
                          `要删除与 ${getAgentName(selectedAgent)} 的对话吗？`,
                          `Effacer la conversation avec ${getAgentName(selectedAgent)} ?`,
                        )
                      : tr(
                          "전사 공지 내역을 삭제하시겠습니까?",
                          "Delete announcement history?",
                          "全体告知履歴を削除しますか？",
                          "要删除全员公告记录吗？",
                          "Effacer l'historique des annonces ?",
                        ),
                  )
                ) {
                  onClearMessages(selectedAgent?.id);
                }
              }}
              className="qg-icon-btn"
              aria-label={clearLabel}
              title={clearLabel}
            >
              <Trash2 size={16} aria-hidden />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="qg-icon-btn"
            aria-label={tr("닫기", "Close", "閉じる", "关闭", "Fermer")}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      {showAnnouncementBanner && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--th-border)] px-4 py-2">
          <span className="qg-badge qg-badge--accent">
            <Megaphone size={16} aria-hidden />
            {tr("전사 공지 모드", "Announcement mode", "全体告知モード", "全员公告模式", "Mode annonce")}
          </span>
          <span className="qg-text-muted min-w-0 truncate text-[13px]">
            {tr(
              "모든 에이전트에게 전달됩니다",
              "Sent to all agents",
              "すべてのエージェントに送信",
              "将发送给所有代理",
              "Envoyée à toute l'équipe",
            )}
          </span>
        </div>
      )}
    </>
  );
}
