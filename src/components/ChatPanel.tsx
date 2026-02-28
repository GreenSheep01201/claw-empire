import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Agent, Message, Project } from "../types";
import { buildSpriteMap } from "./AgentAvatar";
import { useI18n } from "../i18n";
import { createProject, getProjects } from "../api";
import { parseDecisionRequest } from "./chat/decision-request";
import type { DecisionOption } from "./chat/decision-request";
import ChatComposer from "./chat-panel/ChatComposer";
import ChatMessageList from "./chat-panel/ChatMessageList";
import ChatPanelHeader from "./chat-panel/ChatPanelHeader";
import { useDecisionReplyHandlers } from "./chat-panel/useDecisionReply";
import {
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type ChatMode,
  type PendingSendAction,
  type ProjectMetaPayload,
  type StreamingMessage,
} from "./chat-panel/model";
import ProjectFlowDialog from "./chat-panel/ProjectFlowDialog";

const SWIPE_CLOSE_THRESHOLD = 120;

function useVisualViewportHeight() {
  const [bottomInset, setBottomInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = window.innerHeight - vv.height - vv.offsetTop;
      setBottomInset(Math.max(0, inset));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return bottomInset;
}

interface ChatPanelProps {
  selectedAgent: Agent | null;
  messages: Message[];
  agents: Agent[];
  streamingMessage?: StreamingMessage | null;
  onSendMessage: (
    content: string,
    receiverType: "agent" | "department" | "all",
    receiverId?: string,
    messageType?: string,
    projectMeta?: {
      project_id?: string;
      project_path?: string;
      project_context?: string;
    },
  ) => void | Promise<void>;
  onSendAnnouncement: (content: string) => void;
  onSendDirective: (
    content: string,
    projectMeta?: {
      project_id?: string;
      project_path?: string;
      project_context?: string;
    },
  ) => void;
  onClearMessages?: (agentId?: string) => void;
  onClose: () => void;
}

export function ChatPanel({
  selectedAgent,
  messages,
  agents,
  streamingMessage,
  onSendMessage,
  onSendAnnouncement,
  onSendDirective,
  onClearMessages,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(selectedAgent ? "task" : "announcement");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spriteMap = useMemo(() => buildSpriteMap(agents), [agents]);
  const { t, locale } = useI18n();
  const isKorean = locale.startsWith("ko");

  const tr = (ko: string, en: string, ja = en, zh = en) => t({ ko, en, ja, zh });

  const getAgentName = (agent: Agent | null | undefined) => {
    if (!agent) return "";
    return isKorean ? agent.name_ko || agent.name : agent.name || agent.name_ko;
  };

  const getRoleLabel = (role: string) => {
    const label = ROLE_LABELS[role];
    return label ? t(label) : role;
  };

  const getStatusLabel = (status: string) => {
    const label = STATUS_LABELS[status];
    return label ? t(label) : status;
  };

  const selectedDeptName = selectedAgent?.department
    ? isKorean
      ? selectedAgent.department.name_ko || selectedAgent.department.name
      : selectedAgent.department.name || selectedAgent.department.name_ko
    : selectedAgent?.department_id;
  const selectedTaskId = selectedAgent?.current_task_id;

  // 스트리밍 중인 메시지가 현재 에이전트 것인지 판별
  const isStreamingForAgent = streamingMessage && selectedAgent && streamingMessage.agent_id === selectedAgent.id;

  // Auto-scroll to bottom on new messages or streaming delta
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage?.content]);

  // Switch mode when agent selection changes
  useEffect(() => {
    if (!selectedAgent) {
      setMode("announcement");
    } else if (mode === "announcement") {
      setMode("task");
    }
  }, [selectedAgent]);

  const isDirectiveMode = input.trimStart().startsWith("$");
  const [pendingSend, setPendingSend] = useState<PendingSendAction | null>(null);
  const [projectFlowOpen, setProjectFlowOpen] = useState(false);
  const [projectFlowStep, setProjectFlowStep] = useState<"choose" | "existing" | "new" | "confirm">("choose");
  const [projectItems, setProjectItems] = useState<Project[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [existingProjectInput, setExistingProjectInput] = useState("");
  const [existingProjectError, setExistingProjectError] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [decisionReplyKey, setDecisionReplyKey] = useState<string | null>(null);
  const isDirectivePending = pendingSend?.kind === "directive";

  const closeProjectFlow = () => {
    setProjectFlowOpen(false);
    setProjectFlowStep("choose");
    setPendingSend(null);
    setSelectedProject(null);
    setExistingProjectInput("");
    setExistingProjectError("");
    setNewProjectName("");
    setNewProjectPath("");
    setNewProjectGoal("");
    setProjectItems([]);
  };

  const loadRecentProjects = useCallback(async () => {
    setProjectLoading(true);
    try {
      const res = await getProjects({ page: 1, page_size: 10 });
      setProjectItems(res.projects.slice(0, 10));
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setProjectLoading(false);
    }
  }, []);

  const resolveExistingProjectSelection = useCallback(
    (raw: string): Project | null => {
      const trimmed = raw.trim();
      if (!trimmed || projectItems.length === 0) return null;

      if (/^\d+$/.test(trimmed)) {
        const idx = Number.parseInt(trimmed, 10);
        if (idx >= 1 && idx <= projectItems.length) {
          return projectItems[idx - 1];
        }
      }

      const query = trimmed.toLowerCase();
      const tokens = query.split(/\s+/).filter(Boolean);
      let best: { project: Project; score: number } | null = null;

      for (const p of projectItems) {
        const name = p.name.toLowerCase();
        const path = p.project_path.toLowerCase();
        const goal = p.core_goal.toLowerCase();
        let score = 0;

        if (name === query) score = Math.max(score, 100);
        if (name.startsWith(query)) score = Math.max(score, 90);
        if (name.includes(query)) score = Math.max(score, 80);
        if (path === query) score = Math.max(score, 75);
        if (path.includes(query)) score = Math.max(score, 65);
        if (goal.includes(query)) score = Math.max(score, 50);

        if (tokens.length > 0) {
          const tokenHits = tokens.filter((tk) => name.includes(tk) || path.includes(tk) || goal.includes(tk)).length;
          score = Math.max(score, tokenHits * 20);
        }

        if (!best || score > best.score) {
          best = { project: p, score };
        }
      }

      if (!best || best.score < 50) return null;
      return best.project;
    },
    [projectItems],
  );

  const applyExistingProjectSelection = useCallback(() => {
    const picked = resolveExistingProjectSelection(existingProjectInput);
    if (!picked) {
      setExistingProjectError(
        tr(
          "번호(1-10) 또는 프로젝트명을 다시 입력해주세요.",
          "Please enter a number (1-10) or a project name.",
          "番号(1-10)またはプロジェクト名を入力してください。",
          "请输入编号(1-10)或项目名称。",
        ),
      );
      return;
    }
    setExistingProjectError("");
    setSelectedProject(picked);
    setProjectFlowStep("confirm");
  }, [existingProjectInput, resolveExistingProjectSelection]);

  const handleChooseExistingProject = useCallback(() => {
    setProjectFlowStep("existing");
    setExistingProjectInput("");
    setExistingProjectError("");
    void loadRecentProjects();
  }, [loadRecentProjects]);

  const handleSelectExistingProject = useCallback((project: Project, index: number) => {
    setSelectedProject(project);
    setExistingProjectInput(String(index + 1));
    setExistingProjectError("");
    setProjectFlowStep("confirm");
  }, []);

  const handleExistingProjectInputChange = useCallback(
    (value: string) => {
      setExistingProjectInput(value);
      if (existingProjectError) setExistingProjectError("");
    },
    [existingProjectError],
  );

  const dispatchPending = useCallback(
    (action: PendingSendAction, projectMeta?: ProjectMetaPayload) => {
      if (action.kind === "directive") {
        onSendDirective(action.content, projectMeta);
        return;
      }
      if (action.kind === "announcement") {
        onSendAnnouncement(action.content);
        return;
      }
      if (action.kind === "task") {
        onSendMessage(action.content, "agent", action.receiverId, "task_assign", projectMeta);
        return;
      }
      if (action.kind === "report") {
        onSendMessage(action.content, "agent", action.receiverId, "report", projectMeta);
        return;
      }
      if (action.kind === "chat") {
        onSendMessage(action.content, "agent", action.receiverId, "chat", projectMeta);
        return;
      }
      onSendMessage(action.content, "all", undefined, undefined, projectMeta);
    },
    [onSendAnnouncement, onSendDirective, onSendMessage],
  );

  const handleConfirmProject = () => {
    if (!pendingSend || !selectedProject) return;
    const projectMeta: ProjectMetaPayload = {
      project_id: selectedProject.id,
      project_path: selectedProject.project_path,
      project_context: selectedProject.core_goal,
    };
    dispatchPending(pendingSend, projectMeta);
    setInput("");
    textareaRef.current?.focus();
    closeProjectFlow();
  };

  const handleCreateProject = async () => {
    const goal = isDirectivePending ? (pendingSend?.content ?? "").trim() : newProjectGoal.trim();
    if (!newProjectName.trim() || !newProjectPath.trim() || !goal || projectSaving) return;
    setProjectSaving(true);
    try {
      const created = await createProject({
        name: newProjectName.trim(),
        project_path: newProjectPath.trim(),
        core_goal: goal,
      });
      setSelectedProject(created);
      setProjectFlowStep("confirm");
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setProjectSaving(false);
    }
  };

  const openProjectBranch = (action: PendingSendAction) => {
    setPendingSend(action);
    setProjectFlowOpen(true);
    setProjectFlowStep("choose");
    setSelectedProject(null);
    setExistingProjectInput("");
    setExistingProjectError("");
    setProjectItems([]);
    setNewProjectGoal(action.kind === "directive" ? action.content : "");
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let action: PendingSendAction;
    if (trimmed.startsWith("$")) {
      const directiveContent = trimmed.slice(1).trim();
      if (!directiveContent) return;
      action = { kind: "directive", content: directiveContent };
    } else if (mode === "announcement") {
      action = { kind: "announcement", content: trimmed };
    } else if (mode === "task" && selectedAgent) {
      action = { kind: "task", content: trimmed, receiverId: selectedAgent.id };
    } else if (mode === "report" && selectedAgent) {
      action = {
        kind: "report",
        content: `[${tr("보고 요청", "Report Request", "レポート依頼", "报告请求")}] ${trimmed}`,
        receiverId: selectedAgent.id,
      };
    } else if (selectedAgent) {
      action = { kind: "chat", content: trimmed, receiverId: selectedAgent.id };
    } else {
      action = { kind: "broadcast", content: trimmed };
    }

    const requiresProject = action.kind === "directive" || action.kind === "task" || action.kind === "report";

    if (requiresProject) {
      openProjectBranch(action);
      return;
    }

    dispatchPending(action);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (!projectFlowOpen) return;
    if (projectFlowStep !== "existing") return;
    void loadRecentProjects();
  }, [projectFlowOpen, projectFlowStep, loadRecentProjects]);

  const canCreateProject =
    Boolean(newProjectName.trim()) &&
    Boolean(newProjectPath.trim()) &&
    Boolean(isDirectivePending ? (pendingSend?.content ?? "").trim() : newProjectGoal.trim());

  const isAnnouncementMode = mode === "announcement";

  // Filter messages relevant to current view (memoized to avoid re-filtering on every render)
  const selectedAgentId = selectedAgent?.id;
  const visibleMessages = useMemo(
    () =>
      messages.filter((msg) => {
        if (!selectedAgentId) {
          return msg.receiver_type === "all" || msg.message_type === "announcement" || msg.message_type === "directive";
        }
        if (selectedTaskId && msg.task_id === selectedTaskId) return true;
        return (
          (msg.sender_type === "ceo" && msg.receiver_type === "agent" && msg.receiver_id === selectedAgentId) ||
          (msg.sender_type === "agent" && msg.sender_id === selectedAgentId) ||
          msg.message_type === "announcement" ||
          msg.message_type === "directive" ||
          msg.receiver_type === "all"
        );
      }),
    [messages, selectedAgentId, selectedTaskId],
  );

  const decisionRequestByMessage = useMemo(() => {
    const mapped = new Map<string, { options: DecisionOption[] }>();
    if (!selectedAgentId) return mapped;
    for (const msg of visibleMessages) {
      if (msg.sender_type !== "agent" || msg.sender_id !== selectedAgentId) continue;
      const parsed = parseDecisionRequest(msg.content);
      if (parsed) mapped.set(msg.id, parsed);
    }
    return mapped;
  }, [selectedAgentId, visibleMessages]);

  const { handleDecisionOptionReply, handleDecisionManualDraft } = useDecisionReplyHandlers({
    tr,
    onSendMessage,
    setDecisionReplyKey,
    setMode,
    setInput,
    textareaRef,
  });

  // --- Entrance animation ---
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setEntered(false);
    setTimeout(onClose, 280);
  }, [onClose]);

  // Override the Escape handler to use animated close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // --- Swipe-to-close gesture (mobile only) ---
  const dragRef = useRef<{ startY: number; currentY: number; dragging: boolean }>({
    startY: 0,
    currentY: 0,
    dragging: false,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, currentY: e.clientY, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.currentY = e.clientY;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    setDragOffset(dy);
  }, []);

  const onDragEnd = useCallback(() => {
    if (!dragRef.current.dragging) return;
    const finalOffset = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.dragging = false;
    if (finalOffset > SWIPE_CLOSE_THRESHOLD) {
      handleClose();
    }
    setDragOffset(0);
  }, [handleClose]);

  // --- Virtual keyboard height adaptation ---
  const bottomInset = useVisualViewportHeight();

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;

  const panelStyle: React.CSSProperties = isMobile
    ? {
        transform: entered
          ? dragOffset > 0
            ? `translateY(${dragOffset}px)`
            : "translateY(0)"
          : "translateY(100%)",
        paddingBottom: bottomInset > 0 ? bottomInset : undefined,
      }
    : {
        transform: entered ? "translateX(0)" : "translateX(100%)",
      };

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300"
          style={{ opacity: entered && dragOffset === 0 ? 1 : 0, pointerEvents: entered ? "auto" : "none" }}
          onClick={handleClose}
        />
      )}

      <div
        ref={panelRef}
        className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-gray-900 shadow-2xl lg:relative lg:inset-auto lg:z-auto lg:w-96 lg:border-l lg:border-gray-700 ${
          dragOffset > 0 ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={panelStyle}
      >
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div
            className="flex flex-shrink-0 cursor-grab items-center justify-center py-2 active:cursor-grabbing"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            style={{ touchAction: "none" }}
          >
            <div className="h-1 w-10 rounded-full bg-gray-600" />
          </div>
        )}

      <ChatPanelHeader
        selectedAgent={selectedAgent}
        selectedDeptName={selectedDeptName}
        spriteMap={spriteMap}
        tr={tr}
        getAgentName={getAgentName}
        getRoleLabel={getRoleLabel}
        getStatusLabel={getStatusLabel}
        statusColors={STATUS_COLORS}
        showAnnouncementBanner={isAnnouncementMode}
        visibleMessagesLength={visibleMessages.length}
        onClearMessages={onClearMessages}
        onClose={handleClose}
      />

      <ChatMessageList
        selectedAgent={selectedAgent}
        visibleMessages={visibleMessages}
        agents={agents}
        spriteMap={spriteMap}
        locale={locale}
        tr={tr}
        getAgentName={getAgentName}
        decisionRequestByMessage={decisionRequestByMessage}
        decisionReplyKey={decisionReplyKey}
        onDecisionOptionReply={handleDecisionOptionReply}
        onDecisionManualDraft={handleDecisionManualDraft}
        streamingMessage={streamingMessage}
        messagesEndRef={messagesEndRef}
      />

      <ProjectFlowDialog
        open={projectFlowOpen}
        step={projectFlowStep}
        isDirectivePending={isDirectivePending}
        pendingContent={pendingSend?.content ?? ""}
        projectLoading={projectLoading}
        projectItems={projectItems}
        selectedProject={selectedProject}
        existingProjectInput={existingProjectInput}
        existingProjectError={existingProjectError}
        newProjectName={newProjectName}
        newProjectPath={newProjectPath}
        newProjectGoal={newProjectGoal}
        projectSaving={projectSaving}
        canCreateProject={canCreateProject}
        tr={tr}
        onClose={closeProjectFlow}
        onChooseExisting={handleChooseExistingProject}
        onChooseNew={() => setProjectFlowStep("new")}
        onBackToChoose={() => setProjectFlowStep("choose")}
        onSelectExistingProject={handleSelectExistingProject}
        onExistingProjectInputChange={handleExistingProjectInputChange}
        onApplyExistingProjectSelection={applyExistingProjectSelection}
        onNewProjectNameChange={setNewProjectName}
        onNewProjectPathChange={setNewProjectPath}
        onNewProjectGoalChange={setNewProjectGoal}
        onCreateProject={() => {
          void handleCreateProject();
        }}
        onConfirm={handleConfirmProject}
      />

      <ChatComposer
        mode={mode}
        input={input}
        selectedAgent={selectedAgent}
        isDirectiveMode={isDirectiveMode}
        isAnnouncementMode={isAnnouncementMode}
        tr={tr}
        getAgentName={getAgentName}
        textareaRef={textareaRef}
        onModeChange={setMode}
        onInputChange={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
      />
      </div>
    </>
  );
}
