import type { Dispatch, SetStateAction } from "react";
import type { ApiProvider, ApiProviderType, DeviceCodeStart, OAuthConnectProvider, OAuthStatus } from "../../api";
import type { UiLanguage } from "../../i18n";
import type {
  Agent,
  CliModelInfo,
  CliStatusMap,
  CompanySettings,
  Department,
  MessengerChannelType,
  MessengerSessionConfig,
} from "../../types";

export type Locale = UiLanguage;
export type TFunction = (messages: Record<Locale, string>) => string;

export type LocalSettings = Omit<CompanySettings, "language"> & { language: Locale };
export type SettingsTab = "general" | "cli" | "oauth" | "api" | "gateway";

export type SetLocalSettings = Dispatch<SetStateAction<LocalSettings>>;

export type AccountDraft = {
  label: string;
  modelOverride: string;
  priority: string;
};

export type AccountDraftMap = Record<string, AccountDraft>;

export type AccountDraftPatch = Partial<AccountDraft>;

export interface SettingsSectionError {
  errorCode: string | null;
  message: string;
  actionHint: string;
  recoverable: boolean;
}

export interface OAuthCallbackResultLike {
  provider?: string | null;
  error?: string | null;
}

export interface ApiFormState {
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key: string;
}

export type ApiTestResultMap = Record<string, { ok: boolean; msg: string }>;

export interface ApiAssignTarget {
  providerId: string;
  model: string;
}

export interface CliSettingsTabProps {
  t: TFunction;
  cliStatus: CliStatusMap | null;
  cliModels: Record<string, CliModelInfo[]> | null;
  cliModelsLoading: boolean;
  loadError?: SettingsSectionError | null;
  form: LocalSettings;
  setForm: SetLocalSettings;
  persistSettings: (next: LocalSettings) => void;
  onRefresh: () => void;
}

export interface OAuthCommonProps {
  t: TFunction;
  localeTag: string;
  form: LocalSettings;
  setForm: SetLocalSettings;
  persistSettings: (next: LocalSettings) => void;
  oauthStatus: OAuthStatus;
  models: Record<string, string[]> | null;
  modelsLoading: boolean;
  refreshing: string | null;
  disconnecting: string | null;
  savingAccountId: string | null;
  accountDrafts: AccountDraftMap;
  onConnect: (provider: OAuthConnectProvider) => void;
  onDisconnect: (provider: OAuthConnectProvider) => Promise<void>;
  onRefreshToken: (provider: OAuthConnectProvider) => Promise<void>;
  onUpdateAccountDraft: (accountId: string, patch: AccountDraftPatch) => void;
  onActivateAccount: (provider: OAuthConnectProvider, accountId: string, currentlyActive: boolean) => Promise<void>;
  onSaveAccount: (accountId: string) => Promise<void>;
  onToggleAccount: (accountId: string, nextStatus: "active" | "disabled") => Promise<void>;
  onDeleteAccount: (provider: OAuthConnectProvider, accountId: string) => Promise<void>;
}

export interface OAuthConnectCardProps {
  t: TFunction;
  oauthStatus: OAuthStatus;
  deviceCode: DeviceCodeStart | null;
  deviceStatus: string | null;
  deviceError: string | null;
  onConnect: (provider: OAuthConnectProvider) => void;
  onStartDeviceCodeFlow: () => Promise<void>;
}

export interface ApiStateBundle {
  apiProviders: ApiProvider[];
  apiProvidersLoading: boolean;
  apiAddMode: boolean;
  apiEditingId: string | null;
  apiForm: ApiFormState;
  apiSaving: boolean;
  apiTesting: string | null;
  apiTestResult: ApiTestResultMap;
  apiModelsExpanded: Record<string, boolean>;
  apiAssignTarget: ApiAssignTarget | null;
  apiAssignAgents: Agent[];
  apiAssignDepts: Department[];
  apiAssigning: boolean;
  setApiAddMode: Dispatch<SetStateAction<boolean>>;
  setApiEditingId: Dispatch<SetStateAction<string | null>>;
  setApiForm: Dispatch<SetStateAction<ApiFormState>>;
  setApiModelsExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  setApiAssignTarget: Dispatch<SetStateAction<ApiAssignTarget | null>>;
  loadApiProviders: () => Promise<void>;
  handleApiProviderSave: () => Promise<void>;
  handleApiProviderDelete: (id: string) => Promise<void>;
  handleApiProviderTest: (id: string) => Promise<void>;
  handleApiProviderToggle: (id: string, enabled: boolean) => Promise<void>;
  handleApiEditStart: (provider: ApiProvider) => void;
  handleApiModelAssign: (providerId: string, model: string) => Promise<void>;
  handleApiAssignToAgent: (agentId: string) => Promise<void>;
}

export interface ChannelSettingsTabProps {
  t: TFunction;
  form: LocalSettings;
  setForm: SetLocalSettings;
  persistSettings: (next: LocalSettings) => void;
}

export type ChannelRuntimeSession = {
  sessionKey: string;
  channel: MessengerChannelType;
  targetId: string;
  enabled: boolean;
  displayName: string;
};

export type ChannelDraftSession = MessengerSessionConfig;
