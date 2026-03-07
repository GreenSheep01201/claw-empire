import type { TaskReportDetail } from "../api";
import { ChatPanel } from "../components/ChatPanel";
import DecisionInboxModal from "../components/DecisionInboxModal";
import AgentDetail from "../components/AgentDetail";
import TerminalPanel from "../components/TerminalPanel";
import TaskReportPopup from "../components/TaskReportPopup";
import ReportHistory from "../components/ReportHistory";
import AgentStatusPanel from "../components/AgentStatusPanel";
import StaffRosterPanel from "../components/StaffRosterPanel";
import SystemConsolePanel from "../components/SystemConsolePanel";
import LocalServerPanel from "../components/LocalServerPanel";
import AppListPanel from "../components/AppListPanel";
import OfficeRoomManager from "../components/OfficeRoomManager";
import type { DecisionInboxItem } from "../components/chat/decision-inbox";
import type { Agent, Department, Message, RoomTheme, SubAgent, SubTask, Task, WorkflowPackKey } from "../types";
import type { UiLanguage } from "../i18n";
import type { ProjectMetaPayload, RoomThemeMap, TaskPanelTab } from "./types";

interface AppOverlaysProps {
  showChat: boolean;
  chatAgent: Agent | null;
  messages: Message[];
  agents: Agent[];
  streamingMessage: {
    message_id: string;
    agent_id: string;
    agent_name: string;
    agent_avatar: string;
    content: string;
  } | null;
  onSendMessage: (
    content: string,
    receiverType: "agent" | "department" | "all",
    receiverId?: string,
    messageType?: string,
    projectMeta?: ProjectMetaPayload,
  ) => Promise<void>;
  onSendAnnouncement: (content: string) => Promise<void>;
  onSendDirective: (content: string, projectMeta?: ProjectMetaPayload) => Promise<void>;
  onClearMessages: (agentId?: string) => Promise<void>;
  onCloseChat: () => void;
  showDecisionInbox: boolean;
  decisionInboxLoading: boolean;
  decisionInboxItems: DecisionInboxItem[];
  decisionReplyBusyKey: string | null;
  uiLanguage: UiLanguage;
  onCloseDecisionInbox: () => void;
  onRefreshDecisionInbox: () => void;
  onReplyDecisionOption: (
    item: DecisionInboxItem,
    optionNumber: number,
    payloadInput?: { note?: string; selected_option_numbers?: number[] },
  ) => Promise<void>;
  onOpenDecisionChat: (agentId: string) => void;
  selectedAgent: Agent | null;
  activeOfficeWorkflowPack: WorkflowPackKey;
  departments: Department[];
  tasks: Task[];
  subAgents: SubAgent[];
  subtasks: SubTask[];
  onCloseSelectedAgent: () => void;
  onChatFromAgentDetail: (agent: Agent) => void;
  onAssignTaskFromAgentDetail: () => void;
  onOpenTerminalFromAgentDetail: (taskId: string) => void;
  onAgentUpdated: () => void;
  taskPanel: { taskId: string; tab: TaskPanelTab } | null;
  onCloseTaskPanel: () => void;
  taskReport: TaskReportDetail | null;
  onCloseTaskReport: () => void;
  showReportHistory: boolean;
  onCloseReportHistory: () => void;
  showStaffRoster: boolean;
  onCloseStaffRoster: () => void;
  onOpenChatFromRoster: (agent: Agent) => void;
  unreadAgentIds: Set<string>;
  showSystemConsole: boolean;
  onCloseSystemConsole: () => void;
  showLocalServer: boolean;
  onCloseLocalServer: () => void;
  showAppList: boolean;
  onCloseAppList: () => void;
  onOpenLocalServerFromAppList: () => void;
  showAgentStatus: boolean;
  onCloseAgentStatus: () => void;
  showRoomManager: boolean;
  roomManagerDepartments: { id: string; name: string }[];
  customRoomThemes: RoomThemeMap;
  onActiveRoomThemeTargetIdChange: (departmentId: string | null) => void;
  onRoomThemeChange: (themes: Record<string, RoomTheme>) => void;
  onCloseRoomManager: () => void;
}

export default function AppOverlays({
  showChat,
  chatAgent,
  messages,
  agents,
  streamingMessage,
  onSendMessage,
  onSendAnnouncement,
  onSendDirective,
  onClearMessages,
  onCloseChat,
  showDecisionInbox,
  decisionInboxLoading,
  decisionInboxItems,
  decisionReplyBusyKey,
  uiLanguage,
  onCloseDecisionInbox,
  onRefreshDecisionInbox,
  onReplyDecisionOption,
  onOpenDecisionChat,
  selectedAgent,
  activeOfficeWorkflowPack,
  departments,
  tasks,
  subAgents,
  subtasks,
  onCloseSelectedAgent,
  onChatFromAgentDetail,
  onAssignTaskFromAgentDetail,
  onOpenTerminalFromAgentDetail,
  onAgentUpdated,
  taskPanel,
  onCloseTaskPanel,
  taskReport,
  onCloseTaskReport,
  showReportHistory,
  onCloseReportHistory,
  showStaffRoster,
  onCloseStaffRoster,
  onOpenChatFromRoster,
  unreadAgentIds,
  showSystemConsole,
  onCloseSystemConsole,
  showLocalServer,
  onCloseLocalServer,
  showAppList,
  onCloseAppList,
  onOpenLocalServerFromAppList,
  showAgentStatus,
  onCloseAgentStatus,
  showRoomManager,
  roomManagerDepartments,
  customRoomThemes,
  onActiveRoomThemeTargetIdChange,
  onRoomThemeChange,
  onCloseRoomManager,
}: AppOverlaysProps) {
  return (
    <>
      {showChat && (
        <ChatPanel
          selectedAgent={chatAgent}
          messages={messages}
          agents={agents}
          streamingMessage={streamingMessage}
          onSendMessage={onSendMessage}
          onSendAnnouncement={onSendAnnouncement}
          onSendDirective={onSendDirective}
          onClearMessages={onClearMessages}
          onClose={onCloseChat}
        />
      )}

      {showDecisionInbox && (
        <DecisionInboxModal
          open={showDecisionInbox}
          loading={decisionInboxLoading}
          items={decisionInboxItems}
          agents={agents}
          busyKey={decisionReplyBusyKey}
          uiLanguage={uiLanguage}
          onClose={onCloseDecisionInbox}
          onRefresh={onRefreshDecisionInbox}
          onReplyOption={onReplyDecisionOption}
          onOpenChat={onOpenDecisionChat}
        />
      )}

      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          agents={agents}
          department={departments.find((d) => d.id === selectedAgent.department_id)}
          departments={departments}
          tasks={tasks}
          subAgents={subAgents}
          subtasks={subtasks}
          onClose={onCloseSelectedAgent}
          onChat={onChatFromAgentDetail}
          onAssignTask={onAssignTaskFromAgentDetail}
          onOpenTerminal={onOpenTerminalFromAgentDetail}
          onAgentUpdated={onAgentUpdated}
          activeOfficeWorkflowPack={activeOfficeWorkflowPack}
        />
      )}

      {taskPanel && (
        <TerminalPanel
          taskId={taskPanel.taskId}
          initialTab={taskPanel.tab}
          task={tasks.find((t) => t.id === taskPanel.taskId)}
          agent={agents.find(
            (a) =>
              a.current_task_id === taskPanel.taskId ||
              tasks.find((t) => t.id === taskPanel.taskId)?.assigned_agent_id === a.id,
          )}
          agents={agents}
          onClose={onCloseTaskPanel}
        />
      )}

      {taskReport && (
        <TaskReportPopup
          report={taskReport}
          agents={agents}
          departments={departments}
          uiLanguage={uiLanguage}
          onClose={onCloseTaskReport}
        />
      )}

      {showReportHistory && (
        <ReportHistory
          agents={agents}
          departments={departments}
          uiLanguage={uiLanguage}
          onClose={onCloseReportHistory}
        />
      )}

      {showStaffRoster && (
        <StaffRosterPanel
          agents={agents}
          departments={departments}
          unreadAgentIds={unreadAgentIds}
          uiLanguage={uiLanguage}
          onOpenChat={onOpenChatFromRoster}
          onClose={onCloseStaffRoster}
        />
      )}

      {showSystemConsole && <SystemConsolePanel onClose={onCloseSystemConsole} />}

      {showLocalServer && <LocalServerPanel onClose={onCloseLocalServer} />}

      {showAppList && (
        <AppListPanel onClose={onCloseAppList} onOpenLocalServer={onOpenLocalServerFromAppList} />
      )}

      {showAgentStatus && <AgentStatusPanel agents={agents} departments={departments} uiLanguage={uiLanguage} onClose={onCloseAgentStatus} />}

      {showRoomManager && (
        <OfficeRoomManager
          departments={roomManagerDepartments}
          customThemes={customRoomThemes}
          onActiveDeptChange={onActiveRoomThemeTargetIdChange}
          onThemeChange={onRoomThemeChange}
          onClose={onCloseRoomManager}
          language={uiLanguage}
        />
      )}
    </>
  );
}
