import { Circle, Orbit, Rocket } from "lucide-react";
import type { ApiProviderType, OAuthConnectProvider } from "../../api";
import type { LangText } from "../../i18n";
import { AntigravityLogo, CliChatGPTLogo, CliClaudeLogo, CliGeminiLogo, CliKimiLogo, GitHubCopilotLogo } from "./Logos";

export const CLI_INFO: Record<string, { label: string; icon: React.ReactNode }> = {
  claude: { label: "Claude Code", icon: <CliClaudeLogo /> },
  codex: { label: "Codex CLI", icon: <CliChatGPTLogo /> },
  gemini: { label: "Gemini CLI", icon: <CliGeminiLogo /> },
  opencode: { label: "OpenCode", icon: <Circle size={16} aria-hidden="true" /> },
  kimi: { label: "Kimi Code", icon: <CliKimiLogo /> },
  copilot: { label: "GitHub Copilot", icon: <Rocket size={16} aria-hidden="true" /> },
  antigravity: { label: "Antigravity", icon: <Orbit size={16} aria-hidden="true" /> },
};

export const OAUTH_INFO: Record<string, { label: string }> = {
  "github-copilot": { label: "GitHub" },
  antigravity: { label: "Antigravity" },
};

export const CONNECTABLE_PROVIDERS: Array<{
  id: OAuthConnectProvider;
  label: string;
  Logo: ({ className }: { className?: string }) => React.ReactElement;
  description: LangText;
}> = [
  {
    id: "github-copilot",
    label: "GitHub",
    Logo: GitHubCopilotLogo,
    description: {
      ko: "GitHub OAuth (Copilot 포함)",
      en: "GitHub OAuth (Copilot included)",
      fr: "OAuth GitHub (Copilot inclus)",
    },
  },
  {
    id: "antigravity",
    label: "Antigravity",
    Logo: AntigravityLogo,
    description: {
      ko: "Google OAuth (Antigravity)",
      en: "Google OAuth (Antigravity)",
      fr: "OAuth Google (Antigravity)",
    },
  },
];

export const API_TYPE_PRESETS: Record<ApiProviderType, { label: string; base_url: string }> = {
  openai: { label: "OpenAI", base_url: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", base_url: "https://api.anthropic.com/v1" },
  google: { label: "Google AI", base_url: "https://generativelanguage.googleapis.com/v1beta" },
  ollama: { label: "Ollama", base_url: "http://localhost:11434/v1" },
  openrouter: { label: "OpenRouter", base_url: "https://openrouter.ai/api/v1" },
  together: { label: "Together", base_url: "https://api.together.xyz/v1" },
  groq: { label: "Groq", base_url: "https://api.groq.com/openai/v1" },
  cerebras: { label: "Cerebras", base_url: "https://api.cerebras.ai/v1" },
  custom: { label: "Custom", base_url: "" },
};
