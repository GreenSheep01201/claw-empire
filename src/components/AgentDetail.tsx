import { useCallback, useEffect, useMemo, useState } from "react";
import type { OAuthStatus } from "../api";
import * as api from "../api";
import { localeName, useI18n } from "../i18n";
import type { Agent, CliModelInfo, Department, ReasoningLevelOption, SubAgent, SubTask, Task } from "../types";
import AgentAvatar from "./AgentAvatar";
import AgentDetailTabContent from "./agent-detail/AgentDetailTabContent";
import { CLI_LABELS, oauthAccountLabel, roleLabel, STATUS_CONFIG, statusLabel } from "./agent-detail/constants";

interface AgentDetailProps {
  agent: Agent;
  agents: Agent[];
  department: Department | undefined;
  departments: Department[];
  tasks: Task[];
  subAgents: SubAgent[];
  subtasks: SubTask[];
  onClose: () => void;
  onChat: (agent: Agent) => void;
  onAssignTask: (agentId: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onAgentUpdated?: () => void;
}

const CLI_MODEL_OVERRIDE_PROVIDERS: Agent["cli_provider"][] = ["claude", "codex", "gemini", "opencode", "cursor"];
const CODEX_REASONING_FALLBACK_OPTIONS: ReasoningLevelOption[] = [
  { effort: "low", description: "Faster, lower depth" },
  { effort: "medium", description: "Balanced default" },
  { effort: "high", description: "Higher reasoning depth" },
  { effort: "xhigh", description: "Maximum reasoning depth" },
];

export default function AgentDetail({
  agent,
  agents,
  department,
  departments,
  tasks,
  subAgents,
  subtasks,
  onClose,
  onChat,
  onAssignTask,
  onOpenTerminal,
  onAgentUpdated,
}: AgentDetailProps) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<"info" | "tasks" | "alba">("info");
  const [editingCli, setEditingCli] = useState(false);
  const [selectedCli, setSelectedCli] = useState(agent.cli_provider);
  const [selectedOAuthAccountId, setSelectedOAuthAccountId] = useState(agent.oauth_account_id ?? "");
  const [selectedApiProviderId, setSelectedApiProviderId] = useState(agent.api_provider_id ?? "");
  const [selectedApiModel, setSelectedApiModel] = useState(agent.api_model ?? "");
  const [selectedCliModel, setSelectedCliModel] = useState(agent.cli_model ?? "");
  const [selectedCliReasoningLevel, setSelectedCliReasoningLevel] = useState(agent.cli_reasoning_level ?? "");
  const [savingCli, setSavingCli] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [cliModels, setCliModels] = useState<Record<string, CliModelInfo[]>>({});
  const [cliModelsLoading, setCliModelsLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const agentTasks = tasks.filter((task) => task.assigned_agent_id === agent.id);
  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);
  const agentSubAgents = subAgents.filter((subAgent) => subAgent.parentAgentId === agent.id);
  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const oauthProviderKey =
    selectedCli === "copilot" ? "github-copilot" : selectedCli === "antigravity" ? "antigravity" : null;
  const activeOAuthAccounts = useMemo(() => {
    if (!oauthProviderKey || !oauthStatus) return [];
    return (oauthStatus.providers[oauthProviderKey]?.accounts ?? []).filter(
      (account) => account.active && account.status === "active",
    );
  }, [oauthProviderKey, oauthStatus]);
  const requiresOAuthAccount = selectedCli === "copilot" || selectedCli === "antigravity";
  const requiresApiProvider = selectedCli === "api";
  const supportsCliModelOverride = CLI_MODEL_OVERRIDE_PROVIDERS.includes(selectedCli);
  const selectedCliModelOptions = useMemo(() => cliModels[selectedCli] ?? [], [cliModels, selectedCli]);
  const selectedCliModelMeta = useMemo(
    () => selectedCliModelOptions.find((model) => model.slug === selectedCliModel),
    [selectedCliModelOptions, selectedCliModel],
  );
  const codexReasoningOptions = useMemo(() => {
    if (selectedCli !== "codex") return [];
    if (selectedCliModelMeta?.reasoningLevels && selectedCliModelMeta.reasoningLevels.length > 0) {
      return selectedCliModelMeta.reasoningLevels;
    }
    return CODEX_REASONING_FALLBACK_OPTIONS;
  }, [selectedCli, selectedCliModelMeta]);
  const canSaveCli = requiresApiProvider ? false : !requiresOAuthAccount || Boolean(selectedOAuthAccountId);
  const getReasoningDescription = useCallback(
    (effort: string, fallback?: string) => {
      switch (effort) {
        case "low":
          return t({ ko: "빠름, 낮은 깊이", en: "Faster, lower depth", ja: "高速・浅い推論", zh: "更快，较浅推理" });
        case "medium":
          return t({ ko: "균형 기본값", en: "Balanced default", ja: "バランス既定", zh: "均衡默认" });
        case "high":
          return t({ ko: "높은 추론 깊이", en: "Higher reasoning depth", ja: "高い推論深度", zh: "更高推理深度" });
        case "xhigh":
          return t({
            ko: "최대 추론 깊이",
            en: "Maximum reasoning depth",
            ja: "最大推論深度",
            zh: "最高推理深度",
          });
        default:
          return fallback || "";
      }
    },
    [t],
  );

  const xpLevel = Math.floor(agent.stats_xp / 100) + 1;
  const xpProgress = agent.stats_xp % 100;

  useEffect(() => {
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedApiProviderId(agent.api_provider_id ?? "");
    setSelectedApiModel(agent.api_model ?? "");
    setSelectedCliModel(agent.cli_model ?? "");
    setSelectedCliReasoningLevel(agent.cli_reasoning_level ?? "");
  }, [
    agent.id,
    agent.cli_provider,
    agent.oauth_account_id,
    agent.api_provider_id,
    agent.api_model,
    agent.cli_model,
    agent.cli_reasoning_level,
  ]);

  useEffect(() => {
    if (!editingCli || !requiresOAuthAccount) return;
    setOauthLoading(true);
    api
      .getOAuthStatus()
      .then(setOauthStatus)
      .catch((err) => console.error("Failed to load OAuth status:", err))
      .finally(() => setOauthLoading(false));
  }, [editingCli, requiresOAuthAccount]);

  useEffect(() => {
    if (!editingCli || !supportsCliModelOverride || Object.keys(cliModels).length > 0) return;
    let cancelled = false;
    setCliModelsLoading(true);
    api
      .getCliModels()
      .then((models) => {
        if (cancelled) return;
        setCliModels(models);
      })
      .catch((err) => console.error("Failed to load CLI models:", err))
      .finally(() => {
        if (!cancelled) setCliModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingCli, supportsCliModelOverride, cliModels]);

  useEffect(() => {
    if (!requiresOAuthAccount) {
      if (selectedOAuthAccountId) setSelectedOAuthAccountId("");
      return;
    }
    if (activeOAuthAccounts.length === 0) return;
    if (!selectedOAuthAccountId || !activeOAuthAccounts.some((account) => account.id === selectedOAuthAccountId)) {
      setSelectedOAuthAccountId(activeOAuthAccounts[0].id);
    }
  }, [requiresOAuthAccount, activeOAuthAccounts, selectedOAuthAccountId]);

  useEffect(() => {
    if (!supportsCliModelOverride && selectedCliModel) {
      setSelectedCliModel("");
    }
  }, [supportsCliModelOverride, selectedCliModel]);

  useEffect(() => {
    if (selectedCli !== "codex" && selectedCliReasoningLevel) {
      setSelectedCliReasoningLevel("");
      return;
    }
    if (selectedCli === "codex" && selectedCliReasoningLevel) {
      const isValid = codexReasoningOptions.some((level) => level.effort === selectedCliReasoningLevel);
      if (!isValid) setSelectedCliReasoningLevel("");
    }
  }, [selectedCli, selectedCliReasoningLevel, codexReasoningOptions]);

  const handleSaveCli = useCallback(async () => {
    setSavingCli(true);
    try {
      await api.updateAgent(agent.id, {
        cli_provider: selectedCli,
        oauth_account_id: requiresOAuthAccount ? selectedOAuthAccountId || null : null,
        api_provider_id: requiresApiProvider ? selectedApiProviderId || null : null,
        api_model: requiresApiProvider ? selectedApiModel || null : null,
        cli_model: supportsCliModelOverride ? selectedCliModel || null : null,
        cli_reasoning_level: selectedCli === "codex" ? selectedCliReasoningLevel || null : null,
      });
      onAgentUpdated?.();
      setEditingCli(false);
    } catch (error) {
      console.error("Failed to update CLI:", error);
    } finally {
      setSavingCli(false);
    }
  }, [
    agent.id,
    selectedCli,
    requiresOAuthAccount,
    selectedOAuthAccountId,
    requiresApiProvider,
    selectedApiProviderId,
    selectedApiModel,
    supportsCliModelOverride,
    selectedCliModel,
    selectedCliReasoningLevel,
    onAgentUpdated,
  ]);

  const handleCancelCliEdit = useCallback(() => {
    setEditingCli(false);
    setSelectedCli(agent.cli_provider);
    setSelectedOAuthAccountId(agent.oauth_account_id ?? "");
    setSelectedApiProviderId(agent.api_provider_id ?? "");
    setSelectedApiModel(agent.api_model ?? "");
    setSelectedCliModel(agent.cli_model ?? "");
    setSelectedCliReasoningLevel(agent.cli_reasoning_level ?? "");
  }, [
    agent.cli_provider,
    agent.oauth_account_id,
    agent.api_provider_id,
    agent.api_model,
    agent.cli_model,
    agent.cli_reasoning_level,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[calc(100vw-1.5rem)] max-w-[480px] max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div
          className="relative px-6 py-5 border-b border-slate-700"
          style={{
            background: department ? `linear-gradient(135deg, ${department.color}22, transparent)` : undefined,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-700/50 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>

          <div className="flex items-center gap-4">
            <div className="relative">
              <AgentAvatar
                agent={agent}
                agents={agents}
                size={64}
                rounded="2xl"
                className={agent.status === "working" ? "animate-agent-work" : ""}
              />
              <div
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 ${
                  agent.status === "working"
                    ? "bg-blue-500"
                    : agent.status === "idle"
                      ? "bg-green-500"
                      : agent.status === "break"
                        ? "bg-yellow-500"
                        : "bg-slate-500"
                }`}
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{localeName(language, agent)}</h2>
                <span className={`text-xs px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusLabel(statusCfg.label, t)}
                </span>
              </div>
              <div className="text-sm text-slate-400 mt-0.5">
                {department?.icon} {department ? localeName(language, department) : ""} · {roleLabel(agent.role, t)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {editingCli ? (
                  selectedCli === "codex" ? (
                    <div className="space-y-1">
                      <div className="flex w-full min-w-0 items-center gap-1 pb-0.5">
                        <span className="shrink-0">🔧</span>
                        <select
                          value={selectedCli}
                          onChange={(event) => {
                            setSelectedCli(event.target.value as Agent["cli_provider"]);
                            setSelectedCliModel("");
                            setSelectedCliReasoningLevel("");
                          }}
                          className="w-[94px] shrink-0 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                        >
                          {Object.entries(CLI_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {cliModelsLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 로딩...",
                              en: "Loading models...",
                              ja: "モデル読み込み中...",
                              zh: "正在加载模型...",
                            })}
                          </span>
                        ) : selectedCliModelOptions.length > 0 ? (
                          <>
                            <select
                              value={selectedCliModel}
                              onChange={(event) => {
                                const nextModel = event.target.value;
                                setSelectedCliModel(nextModel);
                                const nextMeta = selectedCliModelOptions.find((model) => model.slug === nextModel);
                                setSelectedCliReasoningLevel(nextMeta?.defaultReasoningLevel || "");
                              }}
                              className="w-0 min-w-0 flex-1 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                            >
                              <option value="">
                                {t({
                                  ko: "기본값(설정창 모델)",
                                  en: "Default (Settings model)",
                                  ja: "デフォルト（設定モデル）",
                                  zh: "默认（设置中的模型）",
                                })}
                              </option>
                              {selectedCliModelOptions.map((model) => (
                                <option key={model.slug} value={model.slug}>
                                  {model.displayName || model.slug}
                                </option>
                              ))}
                            </select>
                            {codexReasoningOptions.length > 0 && (
                              <select
                                value={selectedCliReasoningLevel}
                                onChange={(event) => setSelectedCliReasoningLevel(event.target.value)}
                                className="w-0 min-w-0 flex-1 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">
                                  {t({
                                    ko: "기본값(설정창 추론)",
                                    en: "Default (Settings reasoning)",
                                    ja: "デフォルト（設定推論）",
                                    zh: "默认（设置中的推理）",
                                  })}
                                </option>
                                {codexReasoningOptions.map((level) => (
                                  <option key={level.effort} value={level.effort}>
                                    {level.effort}
                                    {getReasoningDescription(level.effort, level.description)
                                      ? ` (${getReasoningDescription(level.effort, level.description)})`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 목록이 없습니다",
                              en: "No model list available",
                              ja: "モデル一覧がありません",
                              zh: "暂无模型列表",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-slate-400">
                          {t({
                            ko: "알바생 모델은 설정창 값을 따릅니다",
                            en: "Sub-agent model follows Settings",
                            ja: "サブエージェントモデルは設定値を使用",
                            zh: "子代理模型沿用设置值",
                          })}
                        </span>
                        <button
                          disabled={savingCli || !canSaveCli}
                          onClick={() => {
                            void handleSaveCli();
                          }}
                          className="text-[10px] px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {savingCli ? "..." : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
                        </button>
                        <button
                          onClick={handleCancelCliEdit}
                          className="text-[10px] px-1.5 py-0.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                        >
                          {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      <span>🔧</span>
                      <select
                        value={selectedCli}
                        onChange={(event) => {
                          setSelectedCli(event.target.value as Agent["cli_provider"]);
                          setSelectedCliModel("");
                          setSelectedCliReasoningLevel("");
                        }}
                        className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                      >
                        {Object.entries(CLI_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {requiresOAuthAccount &&
                        (oauthLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "계정 로딩...",
                              en: "Loading accounts...",
                              ja: "アカウント読み込み中...",
                              zh: "正在加载账号...",
                            })}
                          </span>
                        ) : activeOAuthAccounts.length > 0 ? (
                          <select
                            value={selectedOAuthAccountId}
                            onChange={(event) => setSelectedOAuthAccountId(event.target.value)}
                            className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500 max-w-[170px]"
                          >
                            {activeOAuthAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {oauthAccountLabel(account)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-amber-300">
                            {t({
                              ko: "활성 OAuth 계정 없음",
                              en: "No active OAuth account",
                              ja: "有効な OAuth アカウントなし",
                              zh: "没有可用的 OAuth 账号",
                            })}
                          </span>
                        ))}
                      {requiresApiProvider && (
                        <span className="text-[10px] text-amber-300">
                          {t({
                            ko: "⚙️ 설정 > API 탭에서 모델을 배정하세요",
                            en: "⚙️ Assign models in Settings > API tab",
                            ja: "⚙️ 設定 > API タブでモデルを割り当ててください",
                            zh: "⚙️ 请在设置 > API 标签页中分配模型",
                          })}
                        </span>
                      )}
                      {supportsCliModelOverride &&
                        (cliModelsLoading ? (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 로딩...",
                              en: "Loading models...",
                              ja: "モデル読み込み中...",
                              zh: "正在加载模型...",
                            })}
                          </span>
                        ) : selectedCliModelOptions.length > 0 ? (
                          <>
                            <select
                              value={selectedCliModel}
                              onChange={(event) => {
                                const nextModel = event.target.value;
                                setSelectedCliModel(nextModel);
                              }}
                              className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none focus:border-blue-500 max-w-[210px]"
                            >
                              <option value="">
                                {t({
                                  ko: "기본값(설정창 모델)",
                                  en: "Default (Settings model)",
                                  ja: "デフォルト（設定モデル）",
                                  zh: "默认（设置中的模型）",
                                })}
                              </option>
                              {selectedCliModelOptions.map((model) => (
                                <option key={model.slug} value={model.slug}>
                                  {model.displayName || model.slug}
                                </option>
                              ))}
                            </select>
                            <span className="text-[10px] text-slate-400">
                              {t({
                                ko: "알바생 모델은 설정창 값을 따릅니다",
                                en: "Sub-agent model follows Settings",
                                ja: "サブエージェントモデルは設定値を使用",
                                zh: "子代理模型沿用设置值",
                              })}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {t({
                              ko: "모델 목록이 없습니다",
                              en: "No model list available",
                              ja: "モデル一覧がありません",
                              zh: "暂无模型列表",
                            })}
                          </span>
                        ))}
                      <button
                        disabled={savingCli || !canSaveCli}
                        onClick={() => {
                          void handleSaveCli();
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                      >
                        {savingCli ? "..." : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
                      </button>
                      <button
                        onClick={handleCancelCliEdit}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors"
                      >
                        {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    onClick={() => setEditingCli(true)}
                    className="flex items-center gap-1 hover:text-slate-300 transition-colors"
                    title={t({
                      ko: "클릭하여 CLI 변경",
                      en: "Click to change CLI",
                      ja: "クリックして CLI を変更",
                      zh: "点击更改 CLI",
                    })}
                  >
                    🔧{" "}
                    {agent.cli_provider === "api" && agent.api_model
                      ? `API: ${agent.api_model}`
                      : agent.cli_model &&
                          CLI_MODEL_OVERRIDE_PROVIDERS.includes(agent.cli_provider) &&
                          agent.cli_provider !== "api"
                        ? `${CLI_LABELS[agent.cli_provider] ?? agent.cli_provider} · ${agent.cli_model}${agent.cli_provider === "codex" && agent.cli_reasoning_level ? ` (${agent.cli_reasoning_level})` : ""}`
                        : agent.cli_provider === "codex" && agent.cli_reasoning_level
                          ? `${CLI_LABELS[agent.cli_provider] ?? agent.cli_provider} · (${agent.cli_reasoning_level})`
                          : (CLI_LABELS[agent.cli_provider] ?? agent.cli_provider)}
                    <span className="text-[9px] text-slate-600 ml-0.5">✏️</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-yellow-400 font-bold">Lv.{xpLevel}</span>
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500">{agent.stats_xp} XP</span>
          </div>
        </div>

        <div className="flex border-b border-slate-700">
          {[
            { key: "info", label: t({ ko: "정보", en: "Info", ja: "情報", zh: "信息" }) },
            {
              key: "tasks",
              label: `${t({ ko: "업무", en: "Tasks", ja: "タスク", zh: "任务" })} (${agentTasks.length})`,
            },
            {
              key: "alba",
              label: `${t({ ko: "알바생", en: "Sub-agents", ja: "サブエージェント", zh: "子代理" })} (${agentSubAgents.length})`,
            },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key as typeof tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === tabItem.key ? "text-blue-400 border-b-2 border-blue-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto max-h-[40vh]">
          <AgentDetailTabContent
            tab={tab}
            t={t}
            language={language}
            agent={agent}
            departments={departments}
            agentTasks={agentTasks}
            agentSubAgents={agentSubAgents}
            subtasksByTask={subtasksByTask}
            expandedTaskId={expandedTaskId}
            setExpandedTaskId={setExpandedTaskId}
            onChat={onChat}
            onAssignTask={onAssignTask}
            onOpenTerminal={onOpenTerminal}
          />
        </div>
      </div>
    </div>
  );
}
