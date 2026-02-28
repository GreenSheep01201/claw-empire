import type { ApiProviderType, OAuthConnectProvider } from "../../api";
import { AntigravityLogo, CliChatGPTLogo, CliClaudeLogo, CliGeminiLogo, CursorLogo, GitHubCopilotLogo } from "./Logos";

export const CLI_INFO: Record<string, { label: string; icon: React.ReactNode }> = {
  claude: { label: "Claude Code", icon: <CliClaudeLogo /> },
  codex: { label: "Codex CLI", icon: <CliChatGPTLogo /> },
  gemini: { label: "Gemini CLI", icon: <CliGeminiLogo /> },
  opencode: { label: "OpenCode", icon: "⚪" },
  copilot: { label: "GitHub Copilot", icon: "🚀" },
  antigravity: { label: "Antigravity", icon: "🌌" },
  cursor: { label: "Cursor Agent", icon: <CursorLogo /> },
};

export const OAUTH_INFO: Record<string, { label: string }> = {
  "github-copilot": { label: "GitHub" },
  antigravity: { label: "Antigravity" },
};

export const CONNECTABLE_PROVIDERS: Array<{
  id: OAuthConnectProvider;
  label: string;
  Logo: ({ className }: { className?: string }) => React.ReactElement;
  description: string;
}> = [
  { id: "github-copilot", label: "GitHub", Logo: GitHubCopilotLogo, description: "GitHub OAuth (Copilot included)" },
  { id: "antigravity", label: "Antigravity", Logo: AntigravityLogo, description: "Google OAuth (Antigravity)" },
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
  cursor: { label: "Cursor", base_url: "https://api.cursor.com" },
  custom: { label: "Custom", base_url: "" },
};
