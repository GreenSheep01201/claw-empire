import { useCallback, useEffect, useMemo, useState } from "react";
import type { OAuthStatus } from "../api";
import * as api from "../api";
import { localeName, useI18n } from "../i18n";
import type {
  Agent,
  CliModelInfo,
  Department,
  ReasoningLevelOption,
  SubAgent,
  SubTask,
  Task,
  WorkflowPackKey,
} from "../types";
import { Pencil, Wrench } from "lucide-react";
import AgentAvatar from "./AgentAvatar";
import Dialog from "./ui/Dialog";
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
  activeOfficeWorkflowPack: WorkflowPackKey;
  onClose: () => void;
  onChat: (agent: Agent) => void;
  onAssignTask: (agentId: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onAgentUpdated?: () => void;
}

const CLI_MODEL_OVERRIDE_PROVIDERS: Agent["cli_provider"][] = ["claude", "codex", "gemini", "opencode", "kimi"];
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
  activeOfficeWorkflowPack,
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
  const [savingPlanningLead, setSavingPlanningLead] = useState(false);
  const [actsAsPlanningLead, setActsAsPlanningLead] = useState(Number(agent.acts_as_planning_leader ?? 0) === 1);

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
          return t({
            ko: "빠름, 낮은 깊이",
            en: "Faster, lower depth",
            ja: "高速・浅い推論",
            zh: "更快，较浅推理",
            fr: "Plus rapide, moins approfondi",
          });
        case "medium":
          return t({
            ko: "균형 기본값",
            en: "Balanced default",
            ja: "バランス既定",
            zh: "均衡默认",
            fr: "Équilibré (par défaut)",
          });
        case "high":
          return t({
            ko: "높은 추론 깊이",
            en: "Higher reasoning depth",
            ja: "高い推論深度",
            zh: "更高推理深度",
            fr: "Réflexion plus poussée",
          });
        case "xhigh":
          return t({
            ko: "최대 추론 깊이",
            en: "Maximum reasoning depth",
            ja: "最大推論深度",
            zh: "最高推理深度",
            fr: "Réflexion maximale",
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
    setActsAsPlanningLead(Number(agent.acts_as_planning_leader ?? 0) === 1);
  }, [
    agent.id,
    agent.cli_provider,
    agent.oauth_account_id,
    agent.api_provider_id,
    agent.api_model,
    agent.cli_model,
    agent.cli_reasoning_level,
    agent.acts_as_planning_leader,
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

  const resolvePackLabel = useCallback(
    (packKey: WorkflowPackKey) => {
      switch (packKey) {
        case "development":
          return t({ ko: "개발", en: "Development", ja: "開発", zh: "开发", fr: "Développement" });
        case "novel":
          return t({ ko: "소설", en: "Novel", ja: "小説", zh: "小说", fr: "Roman" });
        case "report":
          return t({ ko: "리포트", en: "Report", ja: "レポート", zh: "报告", fr: "Rapport" });
        case "video_preprod":
          return t({
            ko: "영상 프리프로덕션",
            en: "Video Pre-production",
            ja: "動画プリプロ",
            zh: "视频前期",
            fr: "Préproduction vidéo",
          });
        case "web_research_report":
          return t({
            ko: "웹 리서치 리포트",
            en: "Web Research Report",
            ja: "Webリサーチ",
            zh: "网页调研报告",
            fr: "Rapport de veille web",
          });
        case "roleplay":
          return t({ ko: "역할놀이", en: "Roleplay", ja: "ロールプレイ", zh: "角色扮演", fr: "Jeu de rôle" });
        default:
          return packKey;
      }
    },
    [t],
  );

  const handlePlanningLeadToggle = useCallback(
    async (nextChecked: boolean) => {
      if (agent.role !== "team_leader" || savingPlanningLead) return;
      const previous = actsAsPlanningLead;
      setActsAsPlanningLead(nextChecked);
      setSavingPlanningLead(true);

      try {
        await api.updateAgent(agent.id, {
          acts_as_planning_leader: nextChecked ? 1 : 0,
          workflow_pack_key: activeOfficeWorkflowPack,
        });
        onAgentUpdated?.();
      } catch (error) {
        if (
          nextChecked &&
          api.isApiRequestError(error) &&
          error.status === 409 &&
          error.code === "planning_leader_exists"
        ) {
          const details = (error.details ?? {}) as {
            existing_leader?: { name?: string | null; name_ko?: string | null };
            pack_key?: WorkflowPackKey | null;
          };
          const existingLeaderName = String(
            details.existing_leader?.name_ko ||
              details.existing_leader?.name ||
              t({ ko: "기존 리더", en: "current leader", fr: "le responsable actuel" }),
          ).trim();
          const packKey = details.pack_key ?? activeOfficeWorkflowPack;
          const packLabel = resolvePackLabel(packKey);
          const confirmed = window.confirm(
            t({
              ko: `이미 ${existingLeaderName}가 ${packLabel} 오피스팩의 리더입니다. 변경하시겠습니까?`,
              en: `${existingLeaderName} is already the leader for the ${packLabel} office pack. Change leader?`,
              ja: `${existingLeaderName}さんが既に${packLabel}オフィスパックのリーダーです。変更しますか？`,
              zh: `${existingLeaderName} 已是 ${packLabel} 办公包负责人。要变更吗？`,
              fr: `${existingLeaderName} pilote déjà la planification du pack ${packLabel}. Le remplacer ?`,
            }),
          );
          if (confirmed) {
            try {
              await api.updateAgent(agent.id, {
                acts_as_planning_leader: 1,
                workflow_pack_key: activeOfficeWorkflowPack,
                force_planning_leader_override: true,
              });
              onAgentUpdated?.();
              return;
            } catch (overrideError) {
              console.error("Failed to override planning lead:", overrideError);
            }
          }
        } else {
          console.error("Failed to update planning lead:", error);
        }
        setActsAsPlanningLead(previous);
      } finally {
        setSavingPlanningLead(false);
      }
    },
    [
      activeOfficeWorkflowPack,
      agent.id,
      agent.role,
      actsAsPlanningLead,
      onAgentUpdated,
      resolvePackLabel,
      savingPlanningLead,
      t,
    ],
  );

  return (
    <Dialog
      open
      size="sm"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={localeName(language, agent)}
      titleAdornment={
        <span className={`qg-badge ${agent.status === "working" ? "qg-badge--accent" : ""}`}>
          {statusLabel(statusCfg.label, t)}
        </span>
      }
    >
      <div
        className="relative rounded-md border p-4"
        style={{
          borderColor: "var(--th-border)",
          background: department ? `linear-gradient(135deg, ${department.color}22, transparent)` : undefined,
        }}
      >
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
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2"
              style={{
                borderColor: "var(--th-bg-surface)",
                background:
                  agent.status === "working"
                    ? "var(--qg-accent)"
                    : agent.status === "idle"
                      ? "var(--th-text-secondary)"
                      : agent.status === "break"
                        ? "transparent"
                        : "var(--th-text-muted)",
                boxShadow: agent.status === "break" ? "inset 0 0 0 2px var(--th-text-secondary)" : undefined,
              }}
            />
          </div>

          <div className="flex-1">
            <div className="text-sm qg-text-secondary">
              {department?.icon} {department ? localeName(language, department) : ""} · {roleLabel(agent.role, t)}
            </div>
            {agent.role === "team_leader" && (
              <label className="mt-1 inline-flex items-center gap-1.5 text-[13px] qg-text-secondary">
                <input
                  type="checkbox"
                  checked={actsAsPlanningLead}
                  disabled={savingPlanningLead}
                  onChange={(event) => {
                    void handlePlanningLeadToggle(event.target.checked);
                  }}
                  className="h-4 w-4 disabled:opacity-60"
                  style={{ accentColor: "var(--qg-accent)" }}
                />
                <span>
                  {t({
                    ko: "Lead (기획 리더)",
                    en: "Lead (Planning lead)",
                    ja: "Lead（企画リード）",
                    zh: "Lead（企划负责人）",
                    fr: "Responsable de la planification",
                  })}
                </span>
                {savingPlanningLead && (
                  <span className="qg-text-muted">
                    {t({ ko: "저장중...", en: "Saving...", ja: "保存中...", zh: "保存中...", fr: "Enregistrement…" })}
                  </span>
                )}
              </label>
            )}
            <div className="text-[13px] qg-text-muted mt-1">
              {editingCli ? (
                selectedCli === "codex" ? (
                  <div className="space-y-1">
                    <div className="flex w-full min-w-0 items-center gap-1 pb-0.5">
                      <Wrench size={16} aria-hidden="true" className="shrink-0" />
                      <select
                        value={selectedCli}
                        onChange={(event) => {
                          setSelectedCli(event.target.value as Agent["cli_provider"]);
                          setSelectedCliModel("");
                          setSelectedCliReasoningLevel("");
                        }}
                        aria-label={t({ ko: "CLI 도구", en: "CLI provider", fr: "Fournisseur IA" })}
                        className="qg-select w-[120px] shrink-0"
                        style={{ height: 32 }}
                      >
                        {Object.entries(CLI_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {cliModelsLoading ? (
                        <span className="qg-text-muted">
                          {t({
                            ko: "모델 로딩...",
                            en: "Loading models...",
                            ja: "モデル読み込み中...",
                            zh: "正在加载模型...",
                            fr: "Chargement des modèles…",
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
                            aria-label={t({ ko: "모델", en: "Model", fr: "Modèle" })}
                            className="qg-select w-0 min-w-0 flex-1"
                            style={{ height: 32 }}
                          >
                            <option value="">
                              {t({
                                ko: "기본값(설정창 모델)",
                                en: "Default (Settings model)",
                                ja: "デフォルト（設定モデル）",
                                zh: "默认（设置中的模型）",
                                fr: "Par défaut (modèle des réglages)",
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
                              aria-label={t({ ko: "추론 수준", en: "Reasoning level", fr: "Niveau de réflexion" })}
                              className="qg-select w-0 min-w-0 flex-1"
                              style={{ height: 32 }}
                            >
                              <option value="">
                                {t({
                                  ko: "기본값(설정창 추론)",
                                  en: "Default (Settings reasoning)",
                                  ja: "デフォルト（設定推論）",
                                  zh: "默认（设置中的推理）",
                                  fr: "Par défaut (réflexion des réglages)",
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
                        <span className="qg-text-muted">
                          {t({
                            ko: "모델 목록이 없습니다",
                            en: "No model list available",
                            ja: "モデル一覧がありません",
                            zh: "暂无模型列表",
                            fr: "Aucun modèle disponible",
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="qg-text-muted">
                        {t({
                          ko: "알바생 모델은 설정창 값을 따릅니다",
                          en: "Sub-agent model follows Settings",
                          ja: "サブエージェントモデルは設定値を使用",
                          zh: "子代理模型沿用设置值",
                          fr: "Les sous-agents utilisent le modèle des réglages",
                        })}
                      </span>
                      <button
                        disabled={savingCli || !canSaveCli}
                        onClick={() => {
                          void handleSaveCli();
                        }}
                        type="button"
                        className="qg-btn qg-btn--sm qg-btn--primary"
                      >
                        {savingCli ? "…" : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })}
                      </button>
                      <button onClick={handleCancelCliEdit} type="button" className="qg-btn qg-btn--sm qg-btn--ghost">
                        {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <Wrench size={16} aria-hidden="true" />
                    <select
                      value={selectedCli}
                      onChange={(event) => {
                        setSelectedCli(event.target.value as Agent["cli_provider"]);
                        setSelectedCliModel("");
                        setSelectedCliReasoningLevel("");
                      }}
                      aria-label={t({ ko: "CLI 도구", en: "CLI provider", fr: "Fournisseur IA" })}
                      className="qg-select"
                      style={{ height: 32 }}
                    >
                      {Object.entries(CLI_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {requiresOAuthAccount &&
                      (oauthLoading ? (
                        <span className="qg-text-muted">
                          {t({
                            ko: "계정 로딩...",
                            en: "Loading accounts...",
                            ja: "アカウント読み込み中...",
                            zh: "正在加载账号...",
                            fr: "Chargement des comptes…",
                          })}
                        </span>
                      ) : activeOAuthAccounts.length > 0 ? (
                        <select
                          value={selectedOAuthAccountId}
                          onChange={(event) => setSelectedOAuthAccountId(event.target.value)}
                          aria-label={t({ ko: "OAuth 계정", en: "OAuth account", fr: "Compte OAuth" })}
                          className="qg-select max-w-[170px]"
                          style={{ height: 32 }}
                        >
                          {activeOAuthAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {oauthAccountLabel(account)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="qg-text-secondary">
                          {t({
                            ko: "활성 OAuth 계정 없음",
                            en: "No active OAuth account",
                            ja: "有効な OAuth アカウントなし",
                            zh: "没有可用的 OAuth 账号",
                            fr: "Aucun compte OAuth actif",
                          })}
                        </span>
                      ))}
                    {requiresApiProvider && (
                      <span className="qg-text-secondary">
                        {t({
                          ko: "설정 > API 탭에서 모델을 배정하세요",
                          en: "Assign models in Settings > API tab",
                          ja: "設定 > API タブでモデルを割り当ててください",
                          zh: "请在设置 > API 标签页中分配模型",
                          fr: "Attribuez les modèles dans Réglages > API",
                        })}
                      </span>
                    )}
                    {supportsCliModelOverride &&
                      (cliModelsLoading ? (
                        <span className="qg-text-muted">
                          {t({
                            ko: "모델 로딩...",
                            en: "Loading models...",
                            ja: "モデル読み込み中...",
                            zh: "正在加载模型...",
                            fr: "Chargement des modèles…",
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
                            aria-label={t({ ko: "모델", en: "Model", fr: "Modèle" })}
                            className="qg-select max-w-[210px]"
                            style={{ height: 32 }}
                          >
                            <option value="">
                              {t({
                                ko: "기본값(설정창 모델)",
                                en: "Default (Settings model)",
                                ja: "デフォルト（設定モデル）",
                                zh: "默认（设置中的模型）",
                                fr: "Par défaut (modèle des réglages)",
                              })}
                            </option>
                            {selectedCliModelOptions.map((model) => (
                              <option key={model.slug} value={model.slug}>
                                {model.displayName || model.slug}
                              </option>
                            ))}
                          </select>
                          <span className="qg-text-muted">
                            {t({
                              ko: "알바생 모델은 설정창 값을 따릅니다",
                              en: "Sub-agent model follows Settings",
                              ja: "サブエージェントモデルは設定値を使用",
                              zh: "子代理模型沿用设置值",
                              fr: "Les sous-agents utilisent le modèle des réglages",
                            })}
                          </span>
                        </>
                      ) : (
                        <span className="qg-text-muted">
                          {t({
                            ko: "모델 목록이 없습니다",
                            en: "No model list available",
                            ja: "モデル一覧がありません",
                            zh: "暂无模型列表",
                            fr: "Aucun modèle disponible",
                          })}
                        </span>
                      ))}
                    <button
                      disabled={savingCli || !canSaveCli}
                      onClick={() => {
                        void handleSaveCli();
                      }}
                      type="button"
                      className="qg-btn qg-btn--sm qg-btn--primary"
                    >
                      {savingCli ? "…" : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })}
                    </button>
                    <button onClick={handleCancelCliEdit} type="button" className="qg-btn qg-btn--sm qg-btn--ghost">
                      {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={() => setEditingCli(true)}
                  type="button"
                  className="qg-btn qg-btn--sm qg-btn--ghost -ml-2.5"
                  title={t({
                    ko: "클릭하여 CLI 변경",
                    en: "Click to change CLI",
                    ja: "クリックして CLI を変更",
                    zh: "点击更改 CLI",
                    fr: "Cliquer pour changer de fournisseur IA",
                  })}
                >
                  <Wrench size={16} aria-hidden="true" />
                  {agent.cli_provider === "api" && agent.api_model
                    ? `API: ${agent.api_model}`
                    : agent.cli_model &&
                        CLI_MODEL_OVERRIDE_PROVIDERS.includes(agent.cli_provider) &&
                        agent.cli_provider !== "api"
                      ? `${CLI_LABELS[agent.cli_provider] ?? agent.cli_provider} · ${agent.cli_model}${agent.cli_provider === "codex" && agent.cli_reasoning_level ? ` (${agent.cli_reasoning_level})` : ""}`
                      : agent.cli_provider === "codex" && agent.cli_reasoning_level
                        ? `${CLI_LABELS[agent.cli_provider] ?? agent.cli_provider} · (${agent.cli_reasoning_level})`
                        : (CLI_LABELS[agent.cli_provider] ?? agent.cli_provider)}
                  <Pencil size={16} aria-hidden="true" className="qg-text-muted" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: "var(--th-text-heading)" }}>
            {t({ ko: "Lv.", en: "Lv.", fr: "Niv. " })}
            {xpLevel}
          </span>
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--th-bg-surface-hover)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${xpProgress}%`, background: "var(--qg-accent)" }}
            />
          </div>
          <span className="text-[13px] qg-text-muted">{agent.stats_xp} XP</span>
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-3 gap-1.5"
        role="group"
        aria-label={t({ ko: "상세 보기", en: "Details view", fr: "Affichage" })}
      >
        {[
          { key: "info", label: t({ ko: "정보", en: "Info", ja: "情報", zh: "信息", fr: "Profil" }) },
          {
            key: "tasks",
            label: `${t({ ko: "업무", en: "Tasks", ja: "タスク", zh: "任务", fr: "Tâches" })} (${agentTasks.length})`,
          },
          {
            key: "alba",
            label: `${t({ ko: "알바생", en: "Sub-agents", ja: "サブエージェント", zh: "子代理", fr: "Sous-agents" })} (${agentSubAgents.length})`,
          },
        ].map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            aria-pressed={tab === tabItem.key}
            onClick={() => setTab(tabItem.key as typeof tab)}
            className="qg-choice justify-center"
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
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
    </Dialog>
  );
}
