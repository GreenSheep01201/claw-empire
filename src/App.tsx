import { useState, useRef, useMemo, useCallback } from "react";
import type { DecisionInboxItem } from "./components/chat/decision-inbox";
import { useWebSocket } from "./hooks/useWebSocket";
import type {
  Department,
  Agent,
  Task,
  Message,
  CompanyStats,
  CompanySettings,
  CliStatusMap,
  SubTask,
  MeetingPresence,
  SubAgent,
  CrossDeptDelivery,
  CeoOfficeCall,
  OfficePackProfile,
  RoomTheme,
  WorkflowPackKey,
} from "./types";
import type { TaskReportDetail } from "./api";
import * as api from "./api";
import { detectBrowserLanguage, normalizeLanguage } from "./i18n";
import { useTheme } from "./ThemeContext";
import { ROOM_THEMES_STORAGE_KEY, UPDATE_BANNER_DISMISS_STORAGE_KEY } from "./app/constants";
import {
  detectRuntimeOs,
  isForceUpdateBannerEnabled,
  mergeSettingsWithDefaults,
  readStoredRoomThemes,
} from "./app/utils";
import type { OAuthCallbackResult, RuntimeOs, RoomThemeMap, TaskPanelTab, View } from "./app/types";
import { useRealtimeSync } from "./app/useRealtimeSync";
import { useAppLabels } from "./app/useAppLabels";
import AppLoadingScreen from "./app/AppLoadingScreen";
import AppMainLayout from "./app/AppMainLayout";
import AppOverlays from "./app/AppOverlays";
import { useAppActions } from "./app/useAppActions";
import { useActiveMeetingTaskId } from "./app/useActiveMeetingTaskId";
import { useUpdateStatusPolling } from "./app/useUpdateStatusPolling";
import { useAppViewEffects } from "./app/useAppViewEffects";
import { useAppBootstrapData } from "./app/useAppBootstrapData";
import { useLiveSyncScheduler } from "./app/useLiveSyncScheduler";
import { resolvePackAgentViews, resolvePackDepartmentsForDisplay } from "./app/office-pack-display";
import {
  buildOfficePackPresentation,
  buildOfficePackStarterAgents,
  getOfficePackMeta,
  normalizeOfficeWorkflowPack,
  resolveOfficePackSeedProvider,
} from "./app/office-workflow-pack";

export type { OAuthCallbackResult } from "./app/types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const initialRoomThemes = useMemo(() => readStoredRoomThemes(), []);
  const hasLocalRoomThemesRef = useRef<boolean>(initialRoomThemes.hasStored);

  const [view, setView] = useState<View>("office");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(() =>
    mergeSettingsWithDefaults({ language: detectBrowserLanguage() }),
  );
  const [cliStatus, setCliStatus] = useState<CliStatusMap | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [taskPanel, setTaskPanel] = useState<{ taskId: string; tab: TaskPanelTab } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set());
  const [crossDeptDeliveries, setCrossDeptDeliveries] = useState<CrossDeptDelivery[]>([]);
  const [ceoOfficeCalls, setCeoOfficeCalls] = useState<CeoOfficeCall[]>([]);
  const [meetingPresence, setMeetingPresence] = useState<MeetingPresence[]>([]);
  const [oauthResult, setOauthResult] = useState<OAuthCallbackResult | null>(null);
  const [taskReport, setTaskReport] = useState<TaskReportDetail | null>(null);
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [showAgentStatus, setShowAgentStatus] = useState(false);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [showDecisionInbox, setShowDecisionInbox] = useState(false);
  const [decisionInboxLoading, setDecisionInboxLoading] = useState(false);
  const [decisionInboxItems, setDecisionInboxItems] = useState<DecisionInboxItem[]>([]);
  const [decisionReplyBusyKey, setDecisionReplyBusyKey] = useState<string | null>(null);
  const [activeRoomThemeTargetId, setActiveRoomThemeTargetId] = useState<string | null>(null);
  const [customRoomThemes, setCustomRoomThemes] = useState<RoomThemeMap>(() => initialRoomThemes.themes);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [officePackBootstrappingLabel, setOfficePackBootstrappingLabel] = useState<string | null>(null);
  const [runtimeOs] = useState<RuntimeOs>(() => detectRuntimeOs());
  const [forceUpdateBanner] = useState<boolean>(() => isForceUpdateBannerEnabled());
  const [updateStatus, setUpdateStatus] = useState<api.UpdateStatus | null>(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY) ?? "";
  });
  const [streamingMessage, setStreamingMessage] = useState<{
    message_id: string;
    agent_id: string;
    agent_name: string;
    agent_avatar: string;
    content: string;
  } | null>(null);

  const viewRef = useRef<View>("office");
  viewRef.current = view;
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;
  const subAgentsRef = useRef<SubAgent[]>(subAgents);
  subAgentsRef.current = subAgents;
  const codexThreadToSubAgentIdRef = useRef<Map<string, string>>(new Map());
  const codexThreadBindingTsRef = useRef<Map<string, number>>(new Map());
  const subAgentStreamTailRef = useRef<Map<string, string>>(new Map());
  const activeChatRef = useRef<{ showChat: boolean; agentId: string | null }>({ showChat: false, agentId: null });
  activeChatRef.current = { showChat, agentId: chatAgent?.id ?? null };
  const officePackBootstrapReqRef = useRef(0);

  const readHydratedPackSet = (source: CompanySettings): Set<string> => {
    const raw = source.officePackHydratedPacks;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set(raw.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0));
  };

  const getPackLabelByLanguage = (packKey: WorkflowPackKey, language: string): string => {
    const label = getOfficePackMeta(packKey).label;
    const lang = normalizeLanguage(language);
    if (lang === "ko") return label.ko || label.en;
    if (lang === "ja") return label.ja || label.en;
    if (lang === "zh") return label.zh || label.en;
    return label.en;
  };

  const maybeBuildSeedProfileForPack = (
    packKey: WorkflowPackKey,
    sourceSettings: CompanySettings,
  ): OfficePackProfile | null => {
    if (packKey === "development") return null;

    const existingProfile = sourceSettings.officePackProfiles?.[packKey];
    if (existingProfile?.departments?.length && existingProfile?.agents?.length) {
      return null;
    }

    const locale = normalizeLanguage(sourceSettings.language) as "ko" | "en" | "ja" | "zh";
    const presentation = buildOfficePackPresentation({
      packKey,
      locale,
      departments,
      agents,
      customRoomThemes,
    });
    if (presentation.departments.length <= 0) return null;

    const starterDrafts = buildOfficePackStarterAgents({
      packKey,
      departments: presentation.departments,
      targetCount: 8,
      locale,
    });
    if (starterDrafts.length <= 0) return null;

    const now = Date.now();
    const seededAgents: Agent[] = starterDrafts.map((draft, index) => ({
      id: `${packKey}-seed-${index + 1}`,
      name: draft.name,
      name_ko: draft.name_ko,
      name_ja: draft.name_ja,
      name_zh: draft.name_zh,
      department_id: draft.department_id,
      role: draft.role,
      acts_as_planning_leader: draft.acts_as_planning_leader,
      cli_provider: resolveOfficePackSeedProvider({
        packKey,
        departmentId: draft.department_id,
        role: draft.role,
        seedIndex: index + 1,
        seedOrderInDepartment: draft.seed_order_in_department,
      }),
      avatar_emoji: draft.avatar_emoji,
      sprite_number: draft.sprite_number,
      personality: draft.personality,
      status: "idle",
      current_task_id: null,
      stats_tasks_done: 0,
      stats_xp: 0,
      created_at: now + index,
    }));

    return {
      departments: presentation.departments,
      agents: seededAgents,
      updated_at: now,
    };
  };

  const handleOfficeWorkflowPackChange = (packKey: WorkflowPackKey) => {
    const previousPack = settings.officeWorkflowPack ?? "development";
    const previousProfiles = settings.officePackProfiles;
    const currentHydratedSet = readHydratedPackSet(settings);
    const shouldShowBootstrap = packKey !== "development" && !currentHydratedSet.has(packKey);
    const seedProfile = shouldShowBootstrap ? maybeBuildSeedProfileForPack(packKey, settings) : null;
    const nextOfficePackProfiles = seedProfile
      ? {
          ...(settings.officePackProfiles ?? {}),
          [packKey]: seedProfile,
        }
      : settings.officePackProfiles;
    const patchPayload: Record<string, unknown> = { officeWorkflowPack: packKey };
    if (seedProfile) {
      patchPayload.officePackProfiles = nextOfficePackProfiles;
    }
    const reqId = ++officePackBootstrapReqRef.current;
    if (shouldShowBootstrap) {
      setOfficePackBootstrappingLabel(getPackLabelByLanguage(packKey, settings.language));
    } else {
      setOfficePackBootstrappingLabel(null);
    }
    setSettings((prev) => ({
      ...prev,
      officeWorkflowPack: packKey,
      ...(seedProfile ? { officePackProfiles: nextOfficePackProfiles } : {}),
    }));
    api
      .saveSettingsPatch(patchPayload)
      .then(async () => {
        const [nextDepartments, nextAgents, nextSettingsRaw] = await Promise.all([
          api.getDepartments({ workflowPackKey: packKey }),
          api.getAgents({ includeSeed: packKey !== "development" }),
          api.getSettings(),
        ]);
        setDepartments(nextDepartments);
        setAgents(nextAgents);
        setSettings(mergeSettingsWithDefaults(nextSettingsRaw));
        const clearNotice = () => {
          if (officePackBootstrapReqRef.current !== reqId) return;
          setOfficePackBootstrappingLabel(null);
        };
        if (shouldShowBootstrap) {
          setTimeout(clearNotice, 650);
        } else {
          clearNotice();
        }
      })
      .catch((error) => {
        console.error("Save office workflow pack failed:", error);
        if (officePackBootstrapReqRef.current === reqId) {
          setOfficePackBootstrappingLabel(null);
        }
        setSettings((prev) =>
          prev.officeWorkflowPack === packKey
            ? {
                ...prev,
                officeWorkflowPack: previousPack,
                ...(seedProfile ? { officePackProfiles: previousProfiles } : {}),
              }
            : prev,
        );
      });
  };

  const { connected, on } = useWebSocket();
  const shouldIncludeSeedAgents = useCallback(
    () => normalizeOfficeWorkflowPack(settings.officeWorkflowPack ?? "development") !== "development",
    [settings.officeWorkflowPack],
  );
  const scheduleLiveSync = useLiveSyncScheduler({
    setTasks,
    setAgents,
    setStats,
    setDecisionInboxItems,
    shouldIncludeSeedAgents,
  });

  useAppBootstrapData({
    initialRoomThemes,
    hasLocalRoomThemesRef,
    setDepartments,
    setAgents,
    setTasks,
    setStats,
    setSettings,
    setSubtasks,
    setMeetingPresence,
    setDecisionInboxItems,
    setCustomRoomThemes,
    setLoading,
  });

  useUpdateStatusPolling(setUpdateStatus);
  useAppViewEffects({
    view,
    cliStatus,
    setView,
    setOauthResult,
    setCliStatus,
    setMobileNavOpen,
    setMeetingPresence,
  });

  useRealtimeSync({
    on,
    scheduleLiveSync,
    agentsRef,
    tasksRef,
    subAgentsRef,
    viewRef,
    activeChatRef,
    codexThreadToSubAgentIdRef,
    codexThreadBindingTsRef,
    subAgentStreamTailRef,
    setAgents,
    setMessages,
    setUnreadAgentIds,
    setTaskReport,
    setCrossDeptDeliveries,
    setCeoOfficeCalls,
    setMeetingPresence,
    setSubtasks,
    setSubAgents,
    setStreamingMessage,
  });

  const actions = useAppActions({
    agents,
    settings,
    scheduleLiveSync,
    setSettings,
    setAgents,
    setDepartments,
    setTasks,
    setStats,
    setMessages,
    setChatAgent,
    setShowChat,
    setUnreadAgentIds,
    setShowDecisionInbox,
    setDecisionInboxLoading,
    setDecisionInboxItems,
    setDecisionReplyBusyKey,
    setCliStatus,
  });

  const activeMeetingTaskId = useActiveMeetingTaskId(meetingPresence);

  const labels = useAppLabels({
    view,
    settings,
    departments,
    theme,
    runtimeOs,
    forceUpdateBanner,
    updateStatus,
    dismissedUpdateVersion,
  });

  const activePackKey = normalizeOfficeWorkflowPack(settings.officeWorkflowPack ?? "development");
  const activePackProfile =
    activePackKey === "development" ? null : (settings.officePackProfiles?.[activePackKey] ?? null);
  const isHydratedOfficePack = useMemo(() => {
    if (activePackKey === "development") return false;
    const hydrated = settings.officePackHydratedPacks;
    if (!Array.isArray(hydrated)) return false;
    return hydrated.map((value) => String(value ?? "").trim()).includes(activePackKey);
  }, [activePackKey, settings.officePackHydratedPacks]);
  const overlayDepartments = useMemo(
    () =>
      resolvePackDepartmentsForDisplay({
        packKey: activePackKey,
        globalDepartments: departments,
        packDepartments: activePackProfile?.departments ?? null,
        preferPackProfile: !isHydratedOfficePack,
      }),
    [activePackKey, activePackProfile?.departments, departments, isHydratedOfficePack],
  );
  const { mergedAgents: overlayAgents } = useMemo(
    () =>
      resolvePackAgentViews({
        packKey: activePackKey,
        globalAgents: agents,
        packAgents: activePackProfile?.agents ?? null,
      }),
    [activePackKey, activePackProfile?.agents, agents],
  );

  if (loading) {
    return (
      <AppLoadingScreen language={labels.uiLanguage} title={labels.loadingTitle} subtitle={labels.loadingSubtitle} />
    );
  }

  return (
    <AppMainLayout
      connected={connected}
      view={view}
      setView={setView}
      departments={departments}
      agents={agents}
      stats={stats}
      tasks={tasks}
      subtasks={subtasks}
      subAgents={subAgents}
      meetingPresence={meetingPresence}
      settings={settings}
      cliStatus={cliStatus}
      oauthResult={oauthResult}
      labels={labels}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      mobileHeaderMenuOpen={mobileHeaderMenuOpen}
      setMobileHeaderMenuOpen={setMobileHeaderMenuOpen}
      theme={theme}
      toggleTheme={toggleTheme}
      decisionInboxLoading={decisionInboxLoading}
      decisionInboxCount={decisionInboxItems.length}
      activeMeetingTaskId={activeMeetingTaskId}
      unreadAgentIds={unreadAgentIds}
      crossDeptDeliveries={crossDeptDeliveries}
      ceoOfficeCalls={ceoOfficeCalls}
      customRoomThemes={customRoomThemes}
      activeRoomThemeTargetId={activeRoomThemeTargetId}
      onCrossDeptDeliveryProcessed={(id) => setCrossDeptDeliveries((prev) => prev.filter((d) => d.id !== id))}
      onCeoOfficeCallProcessed={(id) => setCeoOfficeCalls((prev) => prev.filter((d) => d.id !== id))}
      onOpenActiveMeetingMinutes={(taskId) => setTaskPanel({ taskId, tab: "minutes" })}
      onSelectAgent={setSelectedAgent}
      onSelectDepartment={(department) => {
        const candidateAgents = overlayAgents;
        const leader =
          candidateAgents.find((agent) => agent.department_id === department.id && agent.role === "team_leader") ??
          (department.id === "planning"
            ? candidateAgents.find(
                (agent) => agent.role === "team_leader" && Number(agent.acts_as_planning_leader ?? 0) === 1,
              )
            : undefined);
        if (leader) actions.handleOpenChat(leader);
      }}
      onCreateTask={actions.handleCreateTask}
      onUpdateTask={actions.handleUpdateTask}
      onDeleteTask={actions.handleDeleteTask}
      onAssignTask={actions.handleAssignTask}
      onRunTask={actions.handleRunTask}
      onStopTask={actions.handleStopTask}
      onPauseTask={actions.handlePauseTask}
      onResumeTask={actions.handleResumeTask}
      onOpenTerminal={(taskId) => setTaskPanel({ taskId, tab: "terminal" })}
      onOpenMeetingMinutes={(taskId) => setTaskPanel({ taskId, tab: "minutes" })}
      onAgentsChange={actions.handleAgentsChange}
      activeOfficeWorkflowPack={settings.officeWorkflowPack ?? "development"}
      onChangeOfficeWorkflowPack={handleOfficeWorkflowPackChange}
      onSaveSettings={actions.handleSaveSettings}
      onRefreshCli={actions.handleRefreshCli}
      onOauthResultClear={() => setOauthResult(null)}
      onOpenDecisionInbox={actions.handleOpenDecisionInbox}
      onOpenAgentStatus={() => setShowAgentStatus(true)}
      onOpenReportHistory={() => setShowReportHistory(true)}
      onOpenAnnouncement={actions.handleOpenAnnouncement}
      onOpenRoomManager={() => setShowRoomManager(true)}
      onDismissAutoUpdateNotice={actions.handleDismissAutoUpdateNotice}
      onDismissUpdate={() => {
        const latest = labels.effectiveUpdateStatus?.latest_version ?? "";
        setDismissedUpdateVersion(latest);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(UPDATE_BANNER_DISMISS_STORAGE_KEY, latest);
        }
      }}
      officePackBootstrappingLabel={officePackBootstrappingLabel}
    >
      <AppOverlays
        showChat={showChat}
        chatAgent={chatAgent}
        messages={messages}
        agents={overlayAgents}
        streamingMessage={streamingMessage}
        onSendMessage={actions.handleSendMessage}
        onSendAnnouncement={actions.handleSendAnnouncement}
        onSendDirective={actions.handleSendDirective}
        onClearMessages={actions.handleClearMessages}
        onCloseChat={() => setShowChat(false)}
        showDecisionInbox={showDecisionInbox}
        decisionInboxLoading={decisionInboxLoading}
        decisionInboxItems={decisionInboxItems}
        decisionReplyBusyKey={decisionReplyBusyKey}
        uiLanguage={labels.uiLanguage}
        onCloseDecisionInbox={() => setShowDecisionInbox(false)}
        onRefreshDecisionInbox={() => {
          void actions.loadDecisionInbox();
        }}
        onReplyDecisionOption={actions.handleReplyDecisionOption}
        onOpenDecisionChat={actions.handleOpenDecisionChat}
        selectedAgent={selectedAgent}
        activeOfficeWorkflowPack={settings.officeWorkflowPack ?? "development"}
        departments={overlayDepartments}
        tasks={tasks}
        subAgents={subAgents}
        subtasks={subtasks}
        onCloseSelectedAgent={() => setSelectedAgent(null)}
        onChatFromAgentDetail={(agent) => {
          setSelectedAgent(null);
          actions.handleOpenChat(agent);
        }}
        onAssignTaskFromAgentDetail={() => {
          setSelectedAgent(null);
          setView("tasks");
        }}
        onOpenTerminalFromAgentDetail={(taskId) => {
          setSelectedAgent(null);
          setTaskPanel({ taskId, tab: "terminal" });
        }}
        onAgentUpdated={() => {
          api
            .getSettings()
            .then(async (nextSettingsRaw) => {
              const nextSettings = mergeSettingsWithDefaults(nextSettingsRaw);
              const activePack = nextSettings.officeWorkflowPack ?? "development";
              const nextAgents = await api.getAgents({ includeSeed: activePack !== "development" });
              setAgents(nextAgents);
              setSettings(nextSettings);

              if (!selectedAgent) return;
              const fromAgents = nextAgents.find((agent) => agent.id === selectedAgent.id);
              if (fromAgents) {
                setSelectedAgent(fromAgents);
                return;
              }

              const profilePackKey = nextSettings.officeWorkflowPack ?? "development";
              const fromPackProfile = nextSettings.officePackProfiles?.[profilePackKey]?.agents?.find(
                (agent) => agent.id === selectedAgent.id,
              );
              if (fromPackProfile) {
                setSelectedAgent(fromPackProfile);
              }
            })
            .catch(console.error);
        }}
        taskPanel={taskPanel}
        onCloseTaskPanel={() => setTaskPanel(null)}
        taskReport={taskReport}
        onCloseTaskReport={() => setTaskReport(null)}
        showReportHistory={showReportHistory}
        onCloseReportHistory={() => setShowReportHistory(false)}
        showAgentStatus={showAgentStatus}
        onCloseAgentStatus={() => setShowAgentStatus(false)}
        showRoomManager={showRoomManager}
        roomManagerDepartments={labels.roomManagerDepartments}
        customRoomThemes={customRoomThemes}
        onActiveRoomThemeTargetIdChange={setActiveRoomThemeTargetId}
        onRoomThemeChange={(themes) => {
          setCustomRoomThemes(themes as RoomThemeMap);
          hasLocalRoomThemesRef.current = true;
          try {
            window.localStorage.setItem(ROOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
          } catch {
            // ignore quota errors
          }
          api.saveRoomThemes(themes as Record<string, RoomTheme>).catch((error) => {
            console.error("Save room themes failed:", error);
          });
        }}
        onCloseRoomManager={() => {
          setShowRoomManager(false);
          setActiveRoomThemeTargetId(null);
        }}
      />
    </AppMainLayout>
  );
}
