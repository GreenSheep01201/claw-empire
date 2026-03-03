import type { Dispatch, SetStateAction } from "react";
import AgentSelect from "../../AgentSelect";
import type { Agent, MessengerChannelType, MessengerChannelsConfig, WorkflowPackKey } from "../../../types";
import type { ChannelSettingsTabProps } from "../types";
import { CHANNEL_META, channelTargetHint, isWorkflowPackKey } from "./constants";
import type { ChatEditorState } from "./state";
import { MESSENGER_CHANNELS } from "../../../types";

type WorkflowPackOption = {
  key: WorkflowPackKey;
  name: string;
  enabled: boolean;
};

type ChatEditorModalProps = {
  t: ChannelSettingsTabProps["t"];
  editor: ChatEditorState;
  setEditor: Dispatch<SetStateAction<ChatEditorState>>;
  closeEditorModal: () => void;
  handleSaveEditor: () => void;
  channelsConfig: MessengerChannelsConfig;
  agents: Agent[];
  agentsLoading: boolean;
  workflowPackOptions: WorkflowPackOption[];
  workflowPacksLoading: boolean;
  editorError: string | null;
  discordChannels: Array<{
    id: string;
    name: string;
    guildId: string;
    guildName: string;
    type: number;
  }>;
  discordChannelsLoading: boolean;
  discordChannelsError: string | null;
};

export default function ChatEditorModal({
  t,
  editor,
  setEditor,
  closeEditorModal,
  handleSaveEditor,
  channelsConfig,
  agents,
  agentsLoading,
  workflowPackOptions,
  workflowPacksLoading,
  editorError,
  discordChannels,
  discordChannelsLoading,
  discordChannelsError,
}: ChatEditorModalProps) {
  const discordSelectedChannel =
    editor.channel === "discord" ? discordChannels.find((entry) => entry.id === editor.targetId.trim()) : null;

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center px-4">
      <button className="absolute inset-0 bg-slate-950/70" onClick={closeEditorModal} aria-label="close modal" />
      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">
            {editor.mode === "create"
              ? t({ ko: "새 채팅 추가", en: "Add Chat", ja: "チャット追加", zh: "新增聊天" })
              : t({ ko: "채팅 편집", en: "Edit Chat", ja: "チャット編集", zh: "编辑聊天" })}
          </h4>
          <button
            onClick={closeEditorModal}
            className="px-2 py-1 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            {t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t({ ko: "메신저", en: "Messenger", ja: "メッセンジャー", zh: "消息渠道" })}
            </label>
            <select
              value={editor.channel}
              onChange={(e) => {
                const nextChannel = e.target.value as MessengerChannelType;
                setEditor((prev) => ({
                  ...prev,
                  channel: nextChannel,
                  token: channelsConfig[nextChannel].token ?? "",
                  receiveEnabled: channelsConfig[nextChannel].receiveEnabled !== false,
                }));
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {MESSENGER_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CHANNEL_META[channel].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t({ ko: "활성 여부", en: "Enabled", ja: "有効", zh: "启用" })}
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 h-[38px]">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(e) => setEditor((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="accent-blue-500"
              />
              {editor.enabled
                ? t({ ko: "활성", en: "Enabled", ja: "有効", zh: "启用" })
                : t({ ko: "비활성", en: "Disabled", ja: "無効", zh: "禁用" })}
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t({ ko: "토큰", en: "Token", ja: "トークン", zh: "令牌" })}
          </label>
          <input
            type="password"
            value={editor.token}
            onChange={(e) => setEditor((prev) => ({ ...prev, token: e.target.value }))}
            placeholder={t({
              ko: `${CHANNEL_META[editor.channel].label} 토큰 입력`,
              en: `Enter ${CHANNEL_META[editor.channel].label} token`,
              ja: `${CHANNEL_META[editor.channel].label} トークンを入力`,
              zh: `输入 ${CHANNEL_META[editor.channel].label} 令牌`,
            })}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t({ ko: "채팅 이름", en: "Chat Name", ja: "チャット名", zh: "聊天名称" })}
            </label>
            <input
              value={editor.name}
              onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t({
                ko: "예: 디자인팀 알림",
                en: "e.g. Design Alerts",
                ja: "例: デザイン通知",
                zh: "例如：设计组通知",
              })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t({ ko: "채널/대상 ID", en: "Channel/Target ID", ja: "チャンネル/対象 ID", zh: "频道/目标 ID" })}
            </label>
            {editor.channel === "discord" && discordChannels.length > 0 && (
              <select
                value={discordSelectedChannel ? discordSelectedChannel.id : ""}
                onChange={(e) => {
                  const nextTargetId = e.target.value;
                  setEditor((prev) => {
                    const matched = discordChannels.find((entry) => entry.id === nextTargetId);
                    return {
                      ...prev,
                      targetId: nextTargetId,
                      name: matched && !prev.name.trim() ? `${matched.guildName} #${matched.name}` : prev.name,
                    };
                  });
                }}
                className="mb-2 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">
                  {t({
                    ko: "조회된 Discord 채널 선택 (선택 사항)",
                    en: "Choose detected Discord channel (optional)",
                    ja: "検出されたDiscordチャネルを選択（任意）",
                    zh: "选择检测到的 Discord 频道（可选）",
                  })}
                </option>
                {discordChannels.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.guildName} / #{entry.name} ({entry.id})
                  </option>
                ))}
              </select>
            )}
            <input
              value={editor.targetId}
              onChange={(e) => {
                const nextTargetId = e.target.value;
                setEditor((prev) => {
                  const matched =
                    prev.channel === "discord"
                      ? discordChannels.find((entry) => entry.id === nextTargetId.trim())
                      : undefined;
                  return {
                    ...prev,
                    targetId: nextTargetId,
                    name: matched && !prev.name.trim() ? `${matched.guildName} #${matched.name}` : prev.name,
                  };
                });
              }}
              placeholder={channelTargetHint(editor.channel)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            {editor.channel === "discord" && (
              <div className="mt-1 space-y-1">
                {discordChannelsLoading && (
                  <div className="text-[11px] text-blue-300">
                    {t({
                      ko: "Discord 채널 목록 조회 중...",
                      en: "Loading Discord channels...",
                      ja: "Discordチャネルを読み込み中...",
                      zh: "正在加载 Discord 频道...",
                    })}
                  </div>
                )}
                {!discordChannelsLoading && !discordChannelsError && editor.token.trim() && (
                  <div className="text-[11px] text-slate-500">
                    {discordChannels.length > 0
                      ? t({
                          ko: `${discordChannels.length}개 채널을 자동으로 불러왔습니다.`,
                          en: `Loaded ${discordChannels.length} channels automatically.`,
                          ja: `${discordChannels.length} 件のチャネルを自動取得しました。`,
                          zh: `已自动加载 ${discordChannels.length} 个频道。`,
                        })
                      : t({
                          ko: "조회된 Discord 채널이 없습니다. Bot 권한/서버 참여 상태를 확인하세요.",
                          en: "No Discord channels found. Check bot permissions and server membership.",
                          ja: "取得できるDiscordチャネルがありません。Bot権限とサーバー参加状態を確認してください。",
                          zh: "未找到可用 Discord 频道。请检查 Bot 权限和服务器加入状态。",
                        })}
                  </div>
                )}
                {discordChannelsError && <div className="text-[11px] text-red-400">{discordChannelsError}</div>}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t({ ko: "대화 Agent", en: "Conversation Agent", ja: "担当Agent", zh: "对话 Agent" })}
          </label>
          <AgentSelect
            agents={agents}
            value={editor.agentId}
            onChange={(agentId) => setEditor((prev) => ({ ...prev, agentId: agentId || "" }))}
            placeholder={t({
              ko: "대화 Agent 선택",
              en: "Select Agent",
              ja: "担当エージェント選択",
              zh: "选择对话 Agent",
            })}
            className={agentsLoading ? "pointer-events-none opacity-60" : ""}
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {t({ ko: "워크플로우 팩", en: "Workflow Pack", ja: "ワークフローパック", zh: "工作流包" })}
          </label>
          <select
            value={editor.workflowPackKey}
            onChange={(e) =>
              setEditor((prev) => ({
                ...prev,
                workflowPackKey: isWorkflowPackKey(e.target.value) ? e.target.value : "development",
              }))
            }
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {workflowPackOptions.map((pack) => (
              <option key={pack.key} value={pack.key} disabled={!pack.enabled && pack.key !== editor.workflowPackKey}>
                {pack.name}
                {!pack.enabled ? ` (${t({ ko: "비활성", en: "disabled", ja: "無効", zh: "禁用" })})` : ""}
              </option>
            ))}
          </select>
          {workflowPacksLoading && (
            <div className="mt-1 text-[11px] text-slate-500">
              {t({
                ko: "팩 목록 불러오는 중...",
                en: "Loading packs...",
                ja: "パックを読み込み中...",
                zh: "正在加载工作流包...",
              })}
            </div>
          )}
        </div>

        {editor.channel === "telegram" && (
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={editor.receiveEnabled}
              onChange={(e) => setEditor((prev) => ({ ...prev, receiveEnabled: e.target.checked }))}
              className="accent-blue-500"
            />
            {t({
              ko: "텔레그램 직접 수신 활성화",
              en: "Enable direct Telegram receive",
              ja: "Telegram 直接受信を有効化",
              zh: "启用 Telegram 直接接收",
            })}
          </label>
        )}

        {editorError && <div className="text-xs text-red-400">{editorError}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={closeEditorModal}
            className="px-3 py-1.5 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
          </button>
          <button
            onClick={handleSaveEditor}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
          >
            {t({ ko: "확인", en: "Confirm", ja: "確認", zh: "确认" })}
          </button>
        </div>
      </div>
    </div>
  );
}
