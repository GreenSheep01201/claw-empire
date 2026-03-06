export const WORKFLOW_PACK_KEYS = [
  "development",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
] as const;

export type WorkflowPackKey = (typeof WORKFLOW_PACK_KEYS)[number];

export const DEFAULT_WORKFLOW_PACK_KEY: WorkflowPackKey = "development";

export function isWorkflowPackKey(value: unknown): value is WorkflowPackKey {
  return typeof value === "string" && (WORKFLOW_PACK_KEYS as readonly string[]).includes(value);
}

export type WorkflowPackSeed = {
  key: WorkflowPackKey;
  name: string;
  inputSchema: Record<string, unknown>;
  promptPreset: Record<string, unknown>;
  qaRules: Record<string, unknown>;
  outputTemplate: Record<string, unknown>;
  routingKeywords: string[];
  costProfile: Record<string, unknown>;
};

const COMMON_COST_PROFILE = {
  maxInputTokens: 12000,
  maxOutputTokens: 6000,
  maxRounds: 3,
};

export const DEFAULT_WORKFLOW_PACK_SEEDS: WorkflowPackSeed[] = [
  {
    key: "development",
    name: "Development",
    inputSchema: {
      required: ["project", "instruction"],
      optional: ["constraints", "acceptance_criteria", "deadline"],
    },
    promptPreset: {
      mode: "engineering",
      style: "pragmatic",
      enforceTests: true,
    },
    qaRules: {
      requireTestEvidence: true,
      requireRiskNotes: true,
      maxAutoFixPasses: 1,
    },
    outputTemplate: {
      sections: ["summary", "changes", "verification", "next_steps"],
    },
    routingKeywords: ["fix", "bug", "refactor", "build", "api", "test", "開発", "バグ", "修正", "コード"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
  },
  {
    key: "novel",
    name: "Novel Writing",
    inputSchema: {
      required: ["genre", "tone", "length"],
      optional: ["characters", "world_setting", "point_of_view"],
    },
    promptPreset: {
      mode: "creative_writing",
      keepCharacterConsistency: true,
    },
    qaRules: {
      checkToneConsistency: true,
      checkCharacterDrift: true,
    },
    outputTemplate: {
      sections: ["synopsis", "chapter_or_scene"],
    },
    routingKeywords: ["novel", "story", "chapter", "scene", "小説", "ストーリー", "シナリオ"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
  },
  {
    key: "report",
    name: "Structured Report",
    inputSchema: {
      required: ["goal", "audience", "format"],
      optional: ["length", "tone", "deadline"],
    },
    promptPreset: {
      mode: "reporting",
      includeExecutiveSummary: true,
    },
    qaRules: {
      requireSections: ["summary", "body", "action_items"],
      failOnMissingSections: true,
    },
    outputTemplate: {
      sections: ["summary", "body", "action_items"],
    },
    routingKeywords: ["report", "analysis", "brief", "レポート", "分析", "まとめ", "リポート"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
  },
  {
    key: "video_preprod",
    name: "Video Pre-production",
    inputSchema: {
      required: ["platform", "duration", "goal"],
      optional: ["target_audience", "style", "cta"],
    },
    promptPreset: {
      mode: "video_planning",
      includeShotList: true,
    },
    qaRules: {
      requireShotList: true,
      requireScript: true,
      requireRenderedVideo: true,
    },
    outputTemplate: {
      sections: ["concept", "script", "shot_list", "editing_notes", "video_file"],
    },
    routingKeywords: ["video", "shorts", "reel", "コンテ", "動画", "台本", "ショットリスト"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
  },
  {
    key: "web_research_report",
    name: "Web Research Report",
    inputSchema: {
      required: ["topic", "time_range"],
      optional: ["source_policy", "language", "depth"],
    },
    promptPreset: {
      mode: "web_research",
      requireCitations: true,
    },
    qaRules: {
      failWithoutCitations: true,
      citationStyle: "inline_links",
    },
    outputTemplate: {
      sections: ["summary", "findings", "citations", "recommendations"],
    },
    routingKeywords: ["research", "web search", "investigate", "調査", "ウェブ検索", "資料調査", "リサーチ"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 3,
      defaultReasoning: "high",
    },
  },
  {
    key: "roleplay",
    name: "Roleplay",
    inputSchema: {
      required: ["character", "tone"],
      optional: ["setting", "constraints", "safety_rules"],
    },
    promptPreset: {
      mode: "roleplay",
      stayInCharacter: true,
    },
    qaRules: {
      keepCharacterVoice: true,
      enforceSafetyPolicy: true,
    },
    outputTemplate: {
      sections: ["dialogue"],
    },
    routingKeywords: ["roleplay", "rp", "character chat", "ロールプレイ", "役割劇", "会話して"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 1,
      defaultReasoning: "low",
    },
  },
];
