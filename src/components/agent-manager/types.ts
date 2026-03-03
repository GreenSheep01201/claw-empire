import type { Agent, Department, OfficePackProfile, WorkflowPackKey } from "../../types";

export type Translator = (ko: string, en: string) => string;

export interface AgentManagerProps {
  agents: Agent[];
  departments: Department[];
  onAgentsChange: () => void;
  activeOfficeWorkflowPack: WorkflowPackKey;
  dbBackedOfficePack?: boolean;
  onSaveOfficePackProfile: (packKey: WorkflowPackKey, profile: OfficePackProfile) => Promise<void>;
  patrolCountMap?: Record<string, number>;
}

export interface FormData {
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: string;
  role: import("../../types").AgentRole;
  cli_provider: import("../../types").CliProvider;
  avatar_emoji: string;
  sprite_number: number | null;
  personality: string;
}

export interface DeptForm {
  id: string;
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  icon: string;
  color: string;
  description: string;
  prompt: string;
}
