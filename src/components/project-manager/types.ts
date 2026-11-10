import type { LangText } from "../../i18n";
import type { Agent, Department, Project, AssignmentMode } from "../../types";
import type {
  ProjectDecisionEventItem,
  ProjectDetailResponse,
  ProjectReportHistoryItem,
  ProjectTaskHistoryItem,
} from "../../api";

export type I18nTextMap = LangText;

export type ProjectI18nTranslate = (messages: I18nTextMap) => string;

export interface ProjectManagerModalProps {
  agents: Agent[];
  departments?: Department[];
  onClose: () => void;
}

export interface MissingPathPrompt {
  normalizedPath: string;
  canCreate: boolean;
  nearestExistingParent: string | null;
}

export interface FormFeedback {
  tone: "error" | "info";
  message: string;
}

export interface ManualPathEntry {
  name: string;
  path: string;
}

export interface ManualAssignmentWarning {
  reason: "no_agents" | "leaders_only";
  allowCreateMissingPath: boolean;
}

export interface ProjectManualSelectionStats {
  total: number;
  leaders: number;
  subordinates: number;
}

export interface GroupedProjectTaskCard {
  root: ProjectTaskHistoryItem;
  children: ProjectTaskHistoryItem[];
  latestAt: number;
}

export interface ProjectRenderState {
  projects: Project[];
  page: number;
  totalPages: number;
  search: string;
  loadingList: boolean;
  selectedProjectId: string | null;
  detail: ProjectDetailResponse | null;
  loadingDetail: boolean;
  isCreating: boolean;
  githubImportMode: boolean;
  editingProjectId: string | null;
  name: string;
  projectPath: string;
  coreGoal: string;
  saving: boolean;
  assignmentMode: AssignmentMode;
  selectedAgentIds: Set<string>;
  agentFilterDept: string;
  groupedTaskCards: GroupedProjectTaskCard[];
  sortedReports: ProjectReportHistoryItem[];
  sortedDecisionEvents: ProjectDecisionEventItem[];
  selectedProject: Project | null;
  viewedProject: Project | null;
}
