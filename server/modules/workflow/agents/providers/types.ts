export interface DecryptedOAuthToken {
  id: string | null;
  provider: string;
  source: string | null;
  label: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  email: string | null;
  status?: string;
  priority?: number;
  modelOverride?: string | null;
  failureCount?: number;
  lastError?: string | null;
  lastErrorAt?: number | null;
  lastSuccessAt?: number | null;
}

export type ApiProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openrouter"
  | "together"
  | "groq"
  | "cerebras"
  | "custom";

export interface ApiProviderRow {
  id: string;
  name: string;
  type: ApiProviderType;
  base_url: string;
  api_key_enc: string | null;
  enabled: number;
  models_cache: string | null;
  models_cached_at: number | null;
}

export interface CliUsageWindow {
  label: string;
  utilization: number;
  resetsAt: string | null;
}

export interface CliUsageEntry {
  windows: CliUsageWindow[];
  error: string | null;
}

export interface CliToolStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  authHint: string;
  accountEmail?: string | null;
}

export type CliStatusResult = Record<string, CliToolStatus>;

export interface CliToolDef {
  name: string;
  authHint: string;
  checkAuth: () => boolean;
  versionArgs?: string[];
  getVersion?: () => string | null;
  getAccountEmail?: () => string | null;
}
