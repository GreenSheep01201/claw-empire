import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sendMessengerMessage, sendMessengerTyping, type MessengerChannel } from "../../../gateway/client.ts";
import { isMessengerChannel } from "../../../messenger/channels.ts";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import type { Lang } from "../../../types/lang.ts";
import type { DelegationOptions } from "./project-resolution.ts";

export interface AgentRow {
  id: string;
  name: string;
  name_ko: string;
  role: string;
  personality: string | null;
  status: string;
  department_id: string | null;
  current_task_id: string | null;
  avatar_emoji: string;
  cli_provider: string | null;
  oauth_account_id: string | null;
  api_provider_id: string | null;
  api_model: string | null;
  cli_model: string | null;
  cli_reasoning_level: string | null;
}

type L10n = Record<Lang, string[]>;

type DirectReplyPayload = {
  text?: string;
};

type DirectReplyBuild = {
  prompt: string;
  lang: Lang;
};

const RECENT_EXISTING_PROJECT_LIMIT = 10;

type DirectChatDeps = {
  db: RuntimeContext["db"];
  logsDir: string;
  nowMs: () => number;
  randomDelay: (minMs: number, maxMs: number) => number;
  broadcast: (type: string, payload: unknown) => void;
  appendTaskLog: (taskId: string, kind: string, message: string) => void;
  recordTaskCreationAudit: RuntimeContext["recordTaskCreationAudit"];
  resolveLang: (text?: string, fallback?: Lang) => Lang;
  resolveProjectPath: (taskLike: { project_path?: string | null; description?: string | null }) => string;
  detectProjectPath: (text: string) => string | null;
  normalizeTextField: (value: unknown) => string | null;
  resolveProjectFromOptions: (options: DelegationOptions) => {
    id: string | null;
    name: string | null;
    projectPath: string | null;
    coreGoal: string | null;
  };
  buildRoundGoal: (projectCoreGoal: string, message: string) => string;
  getDeptName: (deptId: string) => string;
  l: (ko: string[], en: string[], ja?: string[], zh?: string[]) => L10n;
  pickL: (pool: L10n, lang: Lang) => string;
  sendAgentMessage: (
    agent: AgentRow,
    content: string,
    messageType?: string,
    receiverType?: string,
    receiverId?: string | null,
    taskId?: string | null,
  ) => void;
  registerTaskMessengerRoute: (taskId: string, options?: DelegationOptions) => void;
  chooseSafeReply: (run: DirectReplyPayload, lang: Lang, context: "direct", agent: AgentRow) => string;
  buildCliFailureMessage: (agent: AgentRow, lang: Lang, reason: string) => string;
  buildDirectReplyPrompt: (agent: AgentRow, ceoMessage: string, messageType: string) => DirectReplyBuild;
  runAgentOneShot: (
    agent: AgentRow,
    prompt: string,
    opts: { projectPath: string; rawOutput: true; noTools?: boolean },
  ) => Promise<DirectReplyPayload>;
  executeApiProviderAgent: RuntimeContext["executeApiProviderAgent"];
  executeCopilotAgent: RuntimeContext["executeCopilotAgent"];
  executeAntigravityAgent: RuntimeContext["executeAntigravityAgent"];
  isTaskWorkflowInterrupted: (taskId: string) => boolean;
  startTaskExecutionForAgent: (
    taskId: string,
    agent: AgentRow,
    deptId: string | null,
    deptName: string,
    options?: {
      onMainTaskDone?: () => void;
      disableCrossDeptAfterMain?: boolean;
    },
  ) => void;
  handleTaskDelegation: (
    teamLeader: AgentRow,
    ceoMessage: string,
    mentionContext: string,
    options?: DelegationOptions,
  ) => void;
};

export function shouldTreatDirectChatAsTask(ceoMessage: string, messageType: string): boolean {
  if (messageType === "task_assign") return true;
  if (messageType === "report") return false;
  const text = ceoMessage.trim();
  if (!text) return false;
  if (/^\[(의사결정\s*회신|decision\s*reply|意思決定返信|决策回复)\]/i.test(text)) return false;

  if (/^\s*(task|todo|업무|지시|작업|할일)\s*[:-]/i.test(text)) return true;

  const taskKeywords =
    /(테스트|검증|확인해|진행해|수정해|구현해|반영해|처리해|해줘|부탁|검토|검수|리뷰|평가|분석|보고서|작성해|파악|업무|작업|요청|fix|implement|refactor|test|verify|check|review|audit|analyze|analysis|report|run|apply|update|debug|investigate|対応|確認|修正|実装|レビュー|監査|分析|报告|评估|测试|检查|修复|处理|审查|审核)/i;
  if (taskKeywords.test(text)) return true;

  const requestTone =
    /(해주세요|해 주세요|부탁해|부탁합니다|해줄래|해줘요|please|can you|could you|would you|お願いします|してください|请|麻烦)/i;
  if (requestTone.test(text) && text.length >= 12) return true;

  const requestIntent =
    /(필요해|필요합니다|원해|원합니다|받고싶|받고 싶|해보고 싶|want|need|i need|i want|してほしい|必要|想要|需要)/i;
  if (requestIntent.test(text) && /(검토|검수|리뷰|평가|분석|보고서|업무|작업|review|audit|analy|report)/i.test(text)) {
    return true;
  }

  const analysisRequestVerb =
    /(찾아와|찾아와줘|찾아줘|파악해|파악해줘|조사해|조사해줘|점검해|점검해줘|정리해|정리해줘|추려줘|도출해|도출해줘|identify|find|inspect|investigate|analyze|review|audit)/i;
  const softwareContext =
    /(소스코드|코드|repo|repository|프로젝트|모듈|파일|이슈|버그|취약점|리팩터|리팩토링|test|build|lint|tsc|보고서|report)/i;
  if (analysisRequestVerb.test(text) && softwareContext.test(text)) {
    return true;
  }

  return false;
}

export function isProjectProgressInquiry(text: string, messageType: string = "chat"): boolean {
  if (messageType === "task_assign") return false;
  const normalized = text.trim();
  if (!normalized) return false;

  const progressPatterns = [
    /(진행\s*상황|진행상황|진척|현황|어디까지|상태\s*(어때|어떄|어떤|좀|확인)|업데이트|task\s*현황|tasks?\s*상황)/i,
    /(project|task).*(status|progress|update|where are we|how far)/i,
    /(status|progress|update).*(project|task)/i,
    /(進捗|状況|ステータス|どこまで|更新)/i,
    /(进度|状态|进展|到哪了|更新)/i,
  ];
  if (!progressPatterns.some((pattern) => pattern.test(normalized))) return false;

  const projectScopeHints = [/(프로젝트|project|task|tasks|업무|작업)/i, /(このプロジェクト|项目|任务|進捗)/i];
  return (
    projectScopeHints.some((pattern) => pattern.test(normalized)) ||
    /어디까지|how far|どこまで|到哪了/i.test(normalized)
  );
}

export function isTaskKickoffMessage(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.。！？…~]+$/g, "");
  if (!normalized) return false;
  if (/^(고고|ㄱㄱ|가자|가즈아|진행|진행해|시작|시작해|착수|착수해|바로 진행|바로해)$/i.test(normalized)) return true;
  if (/^(go|go go|gogo|let'?s go|start|proceed|execute|go ahead)$/i.test(normalized)) return true;
  return false;
}

export function isAffirmativeReply(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.。！？…~]+$/g, "");
  if (!normalized) return false;

  const negativePatterns = [
    /^(아니|아니요|아뇨|노|안됨|하지마|중지|멈춰|스탑|stop|no|nope|nah|don'?t|not now|later|아직|다음에|やめて|いいえ|不要|不用|不行|先不要)/i,
  ];
  if (negativePatterns.some((pattern) => pattern.test(normalized))) return false;

  const affirmativePatterns = [
    /^(네|예|응|ㅇㅇ|좋아|좋아요|오케이|ok|okay|sure|yep|yeah|yes|go|go ahead|proceed|do it|start|let'?s go|let?s do it|진행|시작|착수|바로 해|콜|ㄱㄱ|고고)/i,
    /^(はい|了解|お願いします|進めて|進めてください|開始して|いいよ|いいです|実行して)/i,
    /^(好|好的|可以|行|开始吧|继续|请开始|执行吧|马上开始)/i,
  ];
  return affirmativePatterns.some((pattern) => pattern.test(normalized));
}

export function isAgentEscalationPrompt(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const patterns = [
    /(바로\s*)?(시작|진행|착수).*(할까요|할까|할게요\?|해도 될까요|진행해도 될까요)/i,
    /(업무|작업|요청|평가|리뷰|검토).*(진행|시작).*(할까요|해볼까요|해도 될까요)/i,
    /(shall i|should i|would you like me to|may i|can i).*(start|proceed|execute|run|begin)/i,
    /(start now|proceed now|go ahead\?)/i,
    /(開始|進行).*(しましょうか|していいですか|しますか)/i,
    /(现在|现在就).*(开始|执行).*(吗|？|\?)/i,
    /(要不要|是否).*(开始|执行)/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isCancelReply(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return /^(취소|중지|멈춰|그만|나중에|cancel|stop|abort|later|not now|いいえ|中止|取消|不要|先不要|算了)/i.test(normalized);
}

export function isNoPathReply(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  const patterns = [
    /(경로|프로젝트).*없/,
    /(모르겠|몰라|기억안)/,
    /(no path|don't have.*path|no project path|without path|unknown path)/i,
    /(create new project|new project please|make new project)/i,
    /(路径).*没有|没有路径|新建项目|新项目/,
    /(パス).*ない|新規プロジェクト/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export function detectProjectKindChoice(text: string): "existing" | "new" | null {
  const raw = text.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");

  const numericExisting =
    /(?:^|\s)1(?:번|번째)?(?:으로|로)?(?:\s|$)/.test(normalized) || /1️⃣/.test(raw) || compact === "1";
  const numericNew = /(?:^|\s)2(?:번|번째)?(?:으로|로)?(?:\s|$)/.test(normalized) || /2️⃣/.test(raw) || compact === "2";
  if (numericExisting && !numericNew) return "existing";
  if (numericNew && !numericExisting) return "new";

  const existingHit =
    /(?:기존\s*프로젝트|기존\b|기존으로|기존거|있던\s*거|원래\s*있던|existing\s*project|existing\s*one|\bexisting\b|already\s*project|already\s*existing|既存プロジェクト|既存|已有项目|已有)/i.test(
      raw,
    ) || compact.includes("기존프로젝트");
  const newHit =
    /(신규\s*프로젝트|신규\b|신규로|새\s*프로젝트|새로\s*프로젝트|새거|new\s*project|\bnew\b|新規プロジェクト|新規|新项目)/i.test(
      raw,
    ) ||
    compact.includes("새프로젝트") ||
    compact.includes("신규프로젝트") ||
    compact.includes("newproject");

  if (existingHit && !newHit) return "existing";
  if (newHit && !existingHit) return "new";
  return null;
}

export function shouldPreserveStructuredFallback(fallback: string): boolean {
  const text = fallback.trim();
  if (!text) return false;

  if (/[1-9]️⃣/.test(text)) return true;
  if (/(회신|reply|選択|请选择|번호)\s*[:(]/i.test(text)) return true;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;

  const hasListLikeLine = lines.some((line) => /^(\d+[.)]|[-*•])\s+/.test(line) || /^[1-9]️⃣/.test(line));
  if (hasListLikeLine) return true;

  const hasPathLabel = lines.some((line) => /(path|경로|パス|路径)\s*:/i.test(line));
  if (hasPathLabel) return true;

  return false;
}

function expandUserPath(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function normalizeProjectPathForPolicy(value: string): string {
  const resolved = path.resolve(path.normalize(expandUserPath(value)));
  if (process.platform === "win32" || process.platform === "darwin") {
    return resolved.toLowerCase();
  }
  return resolved;
}

function parseAllowedProjectRootsFromEnv(): string[] {
  const raw = (process.env.PROJECT_PATH_ALLOWED_ROOTS || "").trim();
  const defaults = [path.join(os.homedir(), "Projects"), path.join(os.homedir(), "projects"), process.cwd()];
  const candidates = raw
    ? raw
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults;

  const normalized = candidates.map((candidate) => normalizeProjectPathForPolicy(candidate)).filter(Boolean);
  return [...new Set(normalized)];
}

function isPathUnderRoot(candidatePath: string, rootPath: string): boolean {
  const candidate = normalizeProjectPathForPolicy(candidatePath);
  const root = normalizeProjectPathForPolicy(rootPath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function isAllowedProjectCreationPath(projectPath: string): boolean {
  const allowedRoots = parseAllowedProjectRootsFromEnv();
  if (allowedRoots.length === 0) return false;
  return allowedRoots.some((root) => isPathUnderRoot(projectPath, root));
}

function extractAbsolutePathFromText(text: string): string | null {
  const candidates: string[] = [];
  for (const match of text.matchAll(/["'](~?\/[^"']+)["']/g)) {
    if (match[1]) candidates.push(match[1]);
  }
  for (const match of text.matchAll(/(?:^|\s)(~?\/[^\s"'`,;]+)/g)) {
    if (match[1]) candidates.push(match[1]);
  }

  for (const rawCandidate of candidates) {
    const cleaned = rawCandidate.replace(/[),.!?]+$/g, "").trim();
    if (!cleaned) continue;
    const expanded = expandUserPath(cleaned);
    if (!path.isAbsolute(expanded)) continue;
    return path.normalize(expanded);
  }
  return null;
}

function normalizeNewProjectNameInput(text: string): string | null {
  let value = text.trim();
  if (!value) return null;

  value = value
    .replace(/^(프로젝트\s*)?(이름|명)\s*[:-]?\s*/i, "")
    .replace(/^(project\s*)?name\s*[:-]?\s*/i, "")
    .replace(/^(name)\s*[:-]?\s*/i, "")
    .trim();

  for (const match of value.matchAll(/(~?\/[^\s"'`,;]+)/g)) {
    if (match[1]) {
      value = value.replace(match[1], " ");
    }
  }

  value = value.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (/^(신규|new|새(로운)?\s*프로젝트|project|프로젝트)$/i.test(value)) return null;
  return value.slice(0, 80);
}

function isTaskReadinessMessage(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (shouldTreatDirectChatAsTask(normalized, "chat")) return true;
  const readinessPatterns = [
    /(업무|작업|지시|요청|평가|리뷰|검토|분석|문서화|구현|수정|개선|진행).*(가능|할\s*수|할수|되나|될까)/i,
    /(가능|할\s*수|할수|가능해|가능합|can\s+you|possible).*(업무|작업|지시|요청|평가|리뷰|검토|분석|문서화|구현|수정|개선|진행)/i,
    /(go ahead|can proceed|ready to start|start this)/i,
  ];
  return readinessPatterns.some((pattern) => pattern.test(normalized));
}

type RecentCeoMessage = {
  content: string;
  messageType?: string | null;
  createdAt?: number | null;
};

export function resolveContextualTaskMessage(
  currentMessage: string,
  recentCeoMessages: RecentCeoMessage[],
  recentAgentMessages: Array<{ content: string; createdAt?: number | null }> = [],
): string | null {
  const kickoff = isTaskKickoffMessage(currentMessage);
  const affirmative = isAffirmativeReply(currentMessage);
  if (!kickoff && !affirmative) return null;
  const current = currentMessage.trim();

  const escalationPromptTs = recentAgentMessages
    .filter((row) => isAgentEscalationPrompt(row.content))
    .map((row) => row.createdAt ?? 0)
    .sort((a, b) => b - a)[0];
  if (affirmative && !kickoff && !escalationPromptTs) return null;

  for (const row of recentCeoMessages) {
    const candidate = (row.content || "").trim();
    if (!candidate) continue;
    if (candidate === current) continue;
    if (affirmative && escalationPromptTs) {
      const candidateTs = row.createdAt ?? 0;
      if (candidateTs > escalationPromptTs) continue;
    }
    if (shouldTreatDirectChatAsTask(candidate, row.messageType ?? "chat") || isTaskReadinessMessage(candidate)) {
      return candidate;
    }
  }
  return null;
}

function splitSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?…。！？]+[.!?…。！？]?/gu)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [text.trim()]
  ).filter(Boolean);
}

function collapseAdjacentRepeatedSentenceBlocks(sentences: string[]): string[] {
  const next = [...sentences];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let blockSize = Math.floor(next.length / 2); blockSize >= 1; blockSize -= 1) {
      for (let start = 0; start + blockSize * 2 <= next.length; start += 1) {
        let equal = true;
        for (let i = 0; i < blockSize; i += 1) {
          if (next[start + i] !== next[start + blockSize + i]) {
            equal = false;
            break;
          }
        }
        if (equal) {
          next.splice(start + blockSize, blockSize);
          changed = true;
          break outer;
        }
      }
    }
  }
  return next;
}

export function normalizeAgentReply(content: string): string {
  const trimmed = (content || "").trim();
  if (!trimmed) return "";

  const mergedWhitespace = trimmed
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
  if (!mergedWhitespace) return "";

  const repeatedBlock = mergedWhitespace.match(/^(.{6,}?)(?:\s+\1)+$/su);
  if (repeatedBlock?.[1]) {
    return repeatedBlock[1].trim();
  }

  const lines = mergedWhitespace
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2 && lines.every((line) => line === lines[0])) {
    return lines[0];
  }

  const dedupedSentences = collapseAdjacentRepeatedSentenceBlocks(splitSentences(mergedWhitespace));
  const sentenceNormalized = dedupedSentences.join(" ").trim();
  return sentenceNormalized || mergedWhitespace;
}

function getMessengerChunkLimit(channel: MessengerChannel): number {
  if (channel === "discord") return 1900;
  if (channel === "telegram") return 3800;
  if (channel === "slack") return 3900;
  if (channel === "whatsapp") return 3900;
  if (channel === "googlechat") return 3900;
  if (channel === "signal") return 3900;
  if (channel === "imessage") return 3900;
  return 35000;
}

function splitMessageByLimit(text: string, limit: number): string[] {
  const source = text.trim();
  if (!source) return [];
  if (source.length <= limit) return [source];

  const chunks: string[] = [];
  let remaining = source;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.4)) {
      cut = remaining.lastIndexOf(" ", limit);
    }
    if (cut < Math.floor(limit * 0.4)) {
      cut = limit;
    }
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function createDirectChatHandlers(deps: DirectChatDeps) {
  const {
    db,
    logsDir,
    nowMs,
    randomDelay,
    broadcast,
    appendTaskLog,
    recordTaskCreationAudit,
    resolveLang,
    resolveProjectPath,
    detectProjectPath,
    normalizeTextField,
    resolveProjectFromOptions,
    buildRoundGoal,
    getDeptName,
    l,
    pickL,
    sendAgentMessage,
    registerTaskMessengerRoute,
    chooseSafeReply,
    buildCliFailureMessage,
    buildDirectReplyPrompt,
    runAgentOneShot,
    executeApiProviderAgent,
    executeCopilotAgent,
    executeAntigravityAgent,
    isTaskWorkflowInterrupted,
    startTaskExecutionForAgent,
    handleTaskDelegation,
  } = deps;
  type PendingProjectBindingState = "ask_kind" | "ask_existing" | "ask_new_name" | "ask_new_path";
  type ExistingProjectCandidate = {
    id: string;
    name: string | null;
    projectPath: string | null;
    projectContext: string | null;
  };
  type PendingProjectBinding = {
    taskMessage: string;
    options: DelegationOptions;
    requestedAt: number;
    state: PendingProjectBindingState;
    newProjectName?: string;
    existingCandidates?: ExistingProjectCandidate[];
  };
  const pendingProjectBindingByAgent = new Map<string, PendingProjectBinding>();

  async function relayReplyToMessenger(options: DelegationOptions, agent: AgentRow, rawContent: string): Promise<void> {
    const channel = options.messengerChannel;
    const targetId = (options.messengerTargetId || "").trim();
    if (!isMessengerChannel(channel) || !targetId) return;

    const cleaned = normalizeAgentReply(rawContent);
    if (!cleaned) return;

    const chunks = splitMessageByLimit(cleaned, getMessengerChunkLimit(channel));
    for (const chunk of chunks) {
      await sendMessengerMessage({
        channel,
        targetId,
        text: chunk,
      });
    }
    console.log(`[messenger-reply] relayed ${chunks.length} chunk(s) to ${channel}:${targetId} via ${agent.name}`);
  }

  function startMessengerTypingHeartbeat(options: DelegationOptions, agent: AgentRow): () => void {
    const channel = options.messengerChannel;
    const targetId = (options.messengerTargetId || "").trim();
    if (
      !isMessengerChannel(channel) ||
      !targetId ||
      (channel !== "telegram" && channel !== "discord" && channel !== "signal")
    ) {
      return () => undefined;
    }

    let stopped = false;
    let warned = false;
    const sendBeat = () => {
      if (stopped) return;
      void sendMessengerTyping({ channel, targetId }).catch((err) => {
        if (warned) return;
        warned = true;
        console.warn(`[messenger-typing] failed for ${agent.name} on ${channel}:${targetId}: ${String(err)}`);
      });
    };

    sendBeat();
    const timer = setInterval(sendBeat, 3500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  function localeInstructionForDirect(lang: Lang): string {
    if (lang === "en") return "Respond in English.";
    if (lang === "ja") return "Respond in Japanese.";
    if (lang === "zh") return "Respond in Chinese.";
    return "Respond in Korean.";
  }

  async function composeInCharacterAutoMessage(
    agent: AgentRow,
    lang: Lang,
    scenario: string,
    fallback: string,
  ): Promise<string> {
    const personality = (agent.personality || "").trim();
    if (!personality) return fallback;

    if (shouldPreserveStructuredFallback(fallback)) {
      const prompt = [
        "[Auto Reply - In Character Intro]",
        `You are ${agent.name}.`,
        localeInstructionForDirect(lang),
        "[Character Persona - Highest Priority]",
        personality,
        "Scenario:",
        scenario,
        "Output rules:",
        "- Return exactly one short sentence only.",
        "- Stay strictly in character and tone.",
        "- Do not include numbering, options, list, code, markdown, or JSON.",
        "- Do not mention system/internal prompts.",
      ].join("\n");

      try {
        const run = await runAgentOneShot(agent, prompt, {
          projectPath: process.cwd(),
          rawOutput: true,
          noTools: true,
        });
        const picked = normalizeAgentReply(chooseSafeReply(run, lang, "direct", agent));
        const introLine = picked.split(/\r?\n/, 1)[0] ?? "";
        const intro = introLine.trim().replace(/\s+/g, " ");
        if (!intro) return fallback;
        const firstLine = fallback.split(/\r?\n/, 1)[0]?.trim();
        if (firstLine && intro === firstLine) return fallback;
        return `${intro}\n${fallback}`;
      } catch (err) {
        console.warn(`[persona-auto-reply] intro mode failed for ${agent.name}: ${String(err)}`);
        return fallback;
      }
    }

    const prompt = [
      "[Auto Reply - In Character]",
      `You are ${agent.name}.`,
      localeInstructionForDirect(lang),
      "[Character Persona - Highest Priority]",
      personality,
      "Scenario:",
      scenario,
      "Output rules:",
      "- Return one short chat message only (1 sentence, max 2).",
      "- Stay strictly in character and tone.",
      "- No markdown, no JSON, no code block.",
      "- Do not mention internal/system prompts.",
    ].join("\n");

    try {
      const run = await runAgentOneShot(agent, prompt, {
        projectPath: process.cwd(),
        rawOutput: true,
        noTools: true,
      });
      const picked = normalizeAgentReply(chooseSafeReply(run, lang, "direct", agent));
      if (picked) return picked;
    } catch (err) {
      console.warn(`[persona-auto-reply] failed for ${agent.name}: ${String(err)}`);
    }

    return fallback;
  }

  function sendInCharacterAutoMessage(params: {
    agent: AgentRow;
    lang: Lang;
    scenario: string;
    fallback: string;
    options: DelegationOptions;
    messageType?: string;
    taskId?: string | null;
    strictFallback?: boolean;
  }): void {
    const {
      agent,
      lang,
      scenario,
      fallback,
      options,
      messageType = "chat",
      taskId = null,
      strictFallback = false,
    } = params;
    void (async () => {
      const content = strictFallback ? fallback : await composeInCharacterAutoMessage(agent, lang, scenario, fallback);
      sendAgentMessage(agent, content, messageType, "agent", null, taskId);
      await relayReplyToMessenger(options, agent, content);
    })().catch((err) => {
      console.warn(`[persona-auto-reply] send failed for ${agent.name}: ${String(err)}`);
    });
  }

  function parseProjectKindFromModelOutput(text: string): "existing" | "new" | null {
    const normalized = text.trim();
    if (!normalized) return null;
    const upper = normalized.toUpperCase();
    if (/\bEXISTING\b/.test(upper)) return "existing";
    if (/\bNEW\b/.test(upper)) return "new";

    if (/(기존|既存|已有)/.test(normalized)) return "existing";
    if (/(신규|새 프로젝트|새로|新規|新项目|新しい)/.test(normalized)) return "new";
    return detectProjectKindChoice(normalized);
  }

  async function inferProjectKindWithModel(
    agent: AgentRow,
    lang: Lang,
    userReply: string,
  ): Promise<"existing" | "new" | null> {
    const prompt = [
      "[Project Kind Classifier]",
      localeInstructionForDirect(lang),
      "Classify the user's intent into one label:",
      "- EXISTING: user means existing project",
      "- NEW: user means new project",
      "- UNKNOWN: unclear",
      "Return EXACTLY one token only: EXISTING or NEW or UNKNOWN",
      `User reply: ${JSON.stringify(userReply)}`,
    ].join("\n");

    try {
      const run = await runAgentOneShot(agent, prompt, {
        projectPath: process.cwd(),
        rawOutput: true,
        noTools: true,
      });
      return parseProjectKindFromModelOutput(run.text || "");
    } catch (err) {
      console.warn(`[project-kind] model inference failed for ${agent.name}: ${String(err)}`);
      return null;
    }
  }

  function normalizeLooseProjectName(value: string): string {
    return value
      .trim()
      .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function loadRecentExistingProjects(limit: number = 5): ExistingProjectCandidate[] {
    const rows = db
      .prepare(
        `
        SELECT p.id, p.name, p.project_path, p.core_goal
        FROM projects p
        ORDER BY COALESCE(p.last_used_at, p.updated_at) DESC, p.updated_at DESC, p.created_at DESC
        LIMIT ?
      `,
      )
      .all(limit) as Array<{ id: string; name: string | null; project_path: string | null; core_goal: string | null }>;

    return rows.map((row) => ({
      id: row.id,
      name: normalizeTextField(row.name),
      projectPath: normalizeTextField(row.project_path),
      projectContext: normalizeTextField(row.core_goal),
    }));
  }

  function latestProjectMarker(lang: Lang): string {
    if (lang === "en") return " [LATEST]";
    if (lang === "ja") return " [最新]";
    if (lang === "zh") return " [最新]";
    return " [최신]";
  }

  function projectPathLabel(lang: Lang): string {
    if (lang === "en") return "Path";
    if (lang === "ja") return "パス";
    if (lang === "zh") return "路径";
    return "경로";
  }

  function projectNameLabel(lang: Lang): string {
    if (lang === "en") return "Name";
    if (lang === "ja") return "名前";
    if (lang === "zh") return "名称";
    return "이름";
  }

  function resolveExistingProjectDisplayName(candidate: ExistingProjectCandidate): string {
    const explicitName = normalizeTextField(candidate.name);
    if (explicitName) return explicitName;

    const pathText = normalizeTextField(candidate.projectPath);
    if (pathText) {
      const normalized = path.normalize(pathText).replace(/[\\/]+$/g, "");
      const base = path.basename(normalized);
      if (base && base !== "." && base !== path.sep) return base;
    }

    return candidate.id;
  }

  function existingProjectNameMatchKeys(candidate: ExistingProjectCandidate): string[] {
    const values = new Set<string>();
    const explicitName = normalizeTextField(candidate.name);
    if (explicitName) values.add(explicitName.toLowerCase());
    values.add(resolveExistingProjectDisplayName(candidate).toLowerCase());
    return [...values];
  }

  function formatExistingProjectCandidateLines(candidates: ExistingProjectCandidate[], lang: Lang): string[] {
    const marker = latestProjectMarker(lang);
    const nameLabel = projectNameLabel(lang);
    const pathLabel = projectPathLabel(lang);
    return candidates.map((candidate, index) => {
      const displayName = resolveExistingProjectDisplayName(candidate);
      const pathText = normalizeTextField(candidate.projectPath);
      const latestSuffix = index === 0 ? marker : "";
      if (!pathText) return `${index + 1}. ${nameLabel}: ${displayName}${latestSuffix}`;
      return `${index + 1}. ${nameLabel}: ${displayName}${latestSuffix}\n   ${pathLabel}: ${pathText}`;
    });
  }

  function extractNumberSelection(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ").trim();
    const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
    if (/1️⃣/.test(trimmed) || compact === "1") return 1;
    if (/2️⃣/.test(trimmed) || compact === "2") return 2;
    if (/3️⃣/.test(trimmed) || compact === "3") return 3;
    if (/4️⃣/.test(trimmed) || compact === "4") return 4;
    if (/5️⃣/.test(trimmed) || compact === "5") return 5;
    const numeric = normalized.match(/(?:^|\s)([1-9])(?:번|번째)?(?:으로|로)?(?:\s|$)/);
    if (!numeric?.[1]) return null;
    const value = Number.parseInt(numeric[1], 10);
    return Number.isFinite(value) ? value : null;
  }

  function buildProjectBindingFromCandidate(candidate: ExistingProjectCandidate): {
    projectId: string;
    projectPath: string | null;
    projectContext: string | null;
  } {
    return {
      projectId: candidate.id,
      projectPath: candidate.projectPath,
      projectContext: candidate.projectContext,
    };
  }

  function selectExistingProjectFromCandidates(
    text: string,
    candidates: ExistingProjectCandidate[],
  ): { projectId: string; projectPath: string | null; projectContext: string | null } | null {
    if (candidates.length === 0) return null;

    const index = extractNumberSelection(text);
    if (index && index >= 1 && index <= candidates.length) {
      return buildProjectBindingFromCandidate(candidates[index - 1]);
    }

    const detectedPath = detectProjectPath(text) || extractAbsolutePathFromText(text);
    if (detectedPath) {
      const normalizedDetected = path.normalize(detectedPath);
      const byPath = candidates.find((candidate) => {
        const candidatePath = normalizeTextField(candidate.projectPath);
        return candidatePath ? path.normalize(candidatePath) === normalizedDetected : false;
      });
      if (byPath) return buildProjectBindingFromCandidate(byPath);
    }

    const normalizedInput = normalizeLooseProjectName(text).toLowerCase();
    if (!normalizedInput) return null;
    const byExactName = candidates.find((candidate) => {
      const keys = existingProjectNameMatchKeys(candidate);
      return keys.some((key) => key === normalizedInput);
    });
    if (byExactName) return buildProjectBindingFromCandidate(byExactName);

    const byContainsName = candidates.filter((candidate) => {
      const keys = existingProjectNameMatchKeys(candidate);
      return keys.some((key) => key.includes(normalizedInput) || normalizedInput.includes(key));
    });
    if (byContainsName.length === 1) {
      return buildProjectBindingFromCandidate(byContainsName[0]);
    }

    return null;
  }

  function extractProjectNameCandidates(text: string): string[] {
    const values: string[] = [];
    const seen = new Set<string>();
    const add = (rawValue: string | null | undefined): void => {
      if (!rawValue) return;
      const cleaned = normalizeLooseProjectName(rawValue);
      if (!cleaned || cleaned.length < 2 || cleaned.length > 80) return;
      if (/^(기존|신규|새|project|프로젝트|name)$/i.test(cleaned)) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(cleaned);
    };

    for (const match of text.matchAll(
      /(?:프로젝트\s*(?:이름|명)?|project\s*name|name)\s*[:=]?\s*["'`]?([A-Za-z0-9][A-Za-z0-9._-]{1,79})["'`]?/gi,
    )) {
      add(match[1]);
    }

    for (const match of text.matchAll(/["'`]{1}([^"'`\n]{2,80})["'`]{1}/g)) {
      add(match[1]);
    }

    const compact = normalizeLooseProjectName(text);
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(compact)) {
      add(compact);
    }

    return values;
  }

  function findProjectByNameCandidate(nameCandidate: string): {
    id: string;
    project_path: string | null;
    core_goal: string | null;
  } | null {
    const exact = db
      .prepare(
        `
        SELECT id, project_path, core_goal
        FROM projects
        WHERE LOWER(name) = LOWER(?)
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 1
      `,
      )
      .get(nameCandidate) as { id: string; project_path: string | null; core_goal: string | null } | undefined;
    if (exact) return exact;

    const normalizedCandidate = normalizeLooseProjectName(nameCandidate);
    if (normalizedCandidate.length < 2) return null;
    const fuzzyRows = db
      .prepare(
        `
        SELECT id, project_path, core_goal
        FROM projects
        WHERE LOWER(name) LIKE LOWER(?)
        ORDER BY last_used_at DESC, updated_at DESC
        LIMIT 3
      `,
      )
      .all(`%${normalizedCandidate}%`) as Array<{ id: string; project_path: string | null; core_goal: string | null }>;
    if (fuzzyRows.length !== 1) return null;
    return fuzzyRows[0];
  }

  function hasProjectBinding(taskMessage: string, options: DelegationOptions): boolean {
    void taskMessage;
    if (normalizeTextField(options.projectId)) return true;
    if (normalizeTextField(options.projectPath)) return true;
    const selectedProject = resolveProjectFromOptions(options);
    if (selectedProject.id || normalizeTextField(selectedProject.projectPath)) return true;
    return false;
  }

  function resolveProjectBindingFromText(text: string): {
    projectId?: string | null;
    projectPath?: string | null;
    projectContext?: string | null;
  } | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const detectedPath = detectProjectPath(trimmed);
    if (detectedPath) {
      const byPath = db
        .prepare(
          `
          SELECT id, project_path, core_goal
          FROM projects
          WHERE project_path = ?
          ORDER BY last_used_at DESC, updated_at DESC
          LIMIT 1
        `,
        )
        .get(detectedPath) as { id: string; project_path: string | null; core_goal: string | null } | undefined;
      return {
        projectId: byPath?.id ?? null,
        projectPath: normalizeTextField(byPath?.project_path) || detectedPath,
        projectContext: normalizeTextField(byPath?.core_goal),
      };
    }

    const candidates = extractProjectNameCandidates(trimmed);
    for (const candidate of candidates) {
      const project = findProjectByNameCandidate(candidate);
      if (!project) continue;
      return {
        projectId: project.id,
        projectPath: normalizeTextField(project.project_path),
        projectContext: normalizeTextField(project.core_goal),
      };
    }

    return null;
  }

  type ProjectProgressTarget = {
    projectId: string | null;
    projectName: string | null;
    projectPath: string | null;
    projectContext: string | null;
  };

  type ProjectProgressTaskRow = {
    id: string;
    title: string;
    status: string;
    updated_at: number;
    assigned_agent_id: string | null;
    assignee_name: string | null;
    assignee_name_ko: string | null;
  };

  function resolveProjectProgressTargetFromBinding(
    projectIdLike: string | null | undefined,
    projectPathLike: string | null | undefined,
  ): ProjectProgressTarget | null {
    const resolved = resolveProjectFromOptions({
      projectId: normalizeTextField(projectIdLike),
      projectPath: normalizeTextField(projectPathLike),
    });
    if (!resolved.id && !resolved.projectPath) return null;
    return {
      projectId: resolved.id ?? null,
      projectName: resolved.name ?? null,
      projectPath: resolved.projectPath ?? null,
      projectContext: resolved.coreGoal ?? null,
    };
  }

  function resolveProjectProgressTargetBySessionRoute(options: DelegationOptions): ProjectProgressTarget | null {
    if (!isMessengerChannel(options.messengerChannel)) return null;
    const targetId = normalizeTextField(options.messengerTargetId);
    if (!targetId) return null;

    const routeLine = `[messenger-route] ${options.messengerChannel}:${targetId}`;
    const activeRow = db
      .prepare(
        `
        SELECT t.project_id, t.project_path
        FROM task_logs tl
        JOIN tasks t ON t.id = tl.task_id
        WHERE tl.kind = 'system'
          AND tl.message = ?
          AND COALESCE(t.hidden, 0) = 0
          AND (
            (t.project_id IS NOT NULL AND TRIM(t.project_id) <> '')
            OR (t.project_path IS NOT NULL AND TRIM(t.project_path) <> '')
          )
          AND t.status NOT IN ('done', 'cancelled')
        ORDER BY tl.created_at DESC, t.updated_at DESC
        LIMIT 1
      `,
      )
      .get(routeLine) as { project_id: string | null; project_path: string | null } | undefined;
    const activeTarget = resolveProjectProgressTargetFromBinding(activeRow?.project_id, activeRow?.project_path);
    if (activeTarget) return activeTarget;

    const latestRow = db
      .prepare(
        `
        SELECT t.project_id, t.project_path
        FROM task_logs tl
        JOIN tasks t ON t.id = tl.task_id
        WHERE tl.kind = 'system'
          AND tl.message = ?
          AND COALESCE(t.hidden, 0) = 0
          AND (
            (t.project_id IS NOT NULL AND TRIM(t.project_id) <> '')
            OR (t.project_path IS NOT NULL AND TRIM(t.project_path) <> '')
          )
        ORDER BY tl.created_at DESC, t.updated_at DESC
        LIMIT 1
      `,
      )
      .get(routeLine) as { project_id: string | null; project_path: string | null } | undefined;
    return resolveProjectProgressTargetFromBinding(latestRow?.project_id, latestRow?.project_path);
  }

  function resolveProjectProgressTargetByAgentRecent(agent: AgentRow): ProjectProgressTarget | null {
    const activeRow = db
      .prepare(
        `
        SELECT project_id, project_path
        FROM tasks
        WHERE (assigned_agent_id = ? OR department_id = ?)
          AND (
            (project_id IS NOT NULL AND TRIM(project_id) <> '')
            OR (project_path IS NOT NULL AND TRIM(project_path) <> '')
          )
          AND status NOT IN ('done', 'cancelled')
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      )
      .get(agent.id, agent.department_id) as { project_id: string | null; project_path: string | null } | undefined;
    const activeTarget = resolveProjectProgressTargetFromBinding(activeRow?.project_id, activeRow?.project_path);
    if (activeTarget) return activeTarget;

    const latestRow = db
      .prepare(
        `
        SELECT project_id, project_path
        FROM tasks
        WHERE (assigned_agent_id = ? OR department_id = ?)
          AND (
            (project_id IS NOT NULL AND TRIM(project_id) <> '')
            OR (project_path IS NOT NULL AND TRIM(project_path) <> '')
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      )
      .get(agent.id, agent.department_id) as { project_id: string | null; project_path: string | null } | undefined;
    return resolveProjectProgressTargetFromBinding(latestRow?.project_id, latestRow?.project_path);
  }

  function resolveProjectProgressTarget(
    agent: AgentRow,
    ceoMessage: string,
    options: DelegationOptions,
  ): ProjectProgressTarget | null {
    const fromText = resolveProjectBindingFromText(ceoMessage);
    if (fromText) {
      const resolved = resolveProjectFromOptions({
        ...options,
        projectId: fromText.projectId ?? options.projectId,
        projectPath: fromText.projectPath ?? options.projectPath,
        projectContext: fromText.projectContext ?? options.projectContext,
      });
      if (resolved.id || resolved.projectPath) {
        return {
          projectId: resolved.id ?? null,
          projectName: resolved.name ?? null,
          projectPath: resolved.projectPath ?? null,
          projectContext: resolved.coreGoal ?? null,
        };
      }
    }

    const fromOptions = resolveProjectFromOptions(options);
    if (fromOptions.id || fromOptions.projectPath) {
      return {
        projectId: fromOptions.id ?? null,
        projectName: fromOptions.name ?? null,
        projectPath: fromOptions.projectPath ?? null,
        projectContext: fromOptions.coreGoal ?? null,
      };
    }

    if (agent.current_task_id) {
      const currentTaskBinding = db
        .prepare("SELECT project_id, project_path FROM tasks WHERE id = ? LIMIT 1")
        .get(agent.current_task_id) as { project_id: string | null; project_path: string | null } | undefined;
      const currentTaskTarget = resolveProjectProgressTargetFromBinding(
        currentTaskBinding?.project_id,
        currentTaskBinding?.project_path,
      );
      if (currentTaskTarget) return currentTaskTarget;
    }

    const sessionRouteTarget = resolveProjectProgressTargetBySessionRoute(options);
    if (sessionRouteTarget) return sessionRouteTarget;

    const agentRecentTarget = resolveProjectProgressTargetByAgentRecent(agent);
    if (agentRecentTarget) return agentRecentTarget;

    return null;
  }

  function resolveProgressStatusLabel(status: string, lang: Lang): string {
    const labels: Record<string, Record<Lang, string>> = {
      inbox: { ko: "접수", en: "Inbox", ja: "受信", zh: "收件" },
      planned: { ko: "계획", en: "Planned", ja: "計画", zh: "计划" },
      collaborating: { ko: "협업", en: "Collaborating", ja: "協業", zh: "协作" },
      in_progress: { ko: "진행", en: "In Progress", ja: "進行中", zh: "进行中" },
      review: { ko: "검토", en: "Review", ja: "レビュー", zh: "评审" },
      pending: { ko: "보류", en: "Pending", ja: "保留", zh: "待处理" },
      done: { ko: "완료", en: "Done", ja: "完了", zh: "完成" },
      cancelled: { ko: "취소", en: "Cancelled", ja: "取消", zh: "取消" },
    };
    return labels[status]?.[lang] ?? status;
  }

  function loadProjectProgressTasks(target: ProjectProgressTarget): ProjectProgressTaskRow[] {
    if (target.projectId) {
      return db
        .prepare(
          `
          SELECT
            t.id,
            t.title,
            t.status,
            t.updated_at,
            t.assigned_agent_id,
            a.name AS assignee_name,
            a.name_ko AS assignee_name_ko
          FROM tasks t
          LEFT JOIN agents a ON a.id = t.assigned_agent_id
          WHERE t.project_id = ?
            AND COALESCE(t.hidden, 0) = 0
          ORDER BY t.updated_at DESC
          LIMIT 250
        `,
        )
        .all(target.projectId) as ProjectProgressTaskRow[];
    }

    const projectPath = normalizeTextField(target.projectPath);
    if (!projectPath) return [];
    if (process.platform === "win32" || process.platform === "darwin") {
      return db
        .prepare(
          `
          SELECT
            t.id,
            t.title,
            t.status,
            t.updated_at,
            t.assigned_agent_id,
            a.name AS assignee_name,
            a.name_ko AS assignee_name_ko
          FROM tasks t
          LEFT JOIN agents a ON a.id = t.assigned_agent_id
          WHERE LOWER(t.project_path) = LOWER(?)
            AND COALESCE(t.hidden, 0) = 0
          ORDER BY t.updated_at DESC
          LIMIT 250
        `,
        )
        .all(projectPath) as ProjectProgressTaskRow[];
    }
    return db
      .prepare(
        `
        SELECT
          t.id,
          t.title,
          t.status,
          t.updated_at,
          t.assigned_agent_id,
          a.name AS assignee_name,
          a.name_ko AS assignee_name_ko
        FROM tasks t
        LEFT JOIN agents a ON a.id = t.assigned_agent_id
        WHERE t.project_path = ?
          AND COALESCE(t.hidden, 0) = 0
        ORDER BY t.updated_at DESC
        LIMIT 250
      `,
      )
      .all(projectPath) as ProjectProgressTaskRow[];
  }

  function buildProjectProgressSummary(
    agent: AgentRow,
    ceoMessage: string,
    options: DelegationOptions,
  ): {
    lang: Lang;
    content: string;
    projectFound: boolean;
  } {
    const lang = resolveLang(ceoMessage);
    const target = resolveProjectProgressTarget(agent, ceoMessage, options);
    if (!target) {
      return {
        lang,
        projectFound: false,
        content: pickL(
          l(
            [
              "진행 현황을 조회할 프로젝트를 아직 찾지 못했습니다. 프로젝트 이름이나 경로를 함께 알려주시면 바로 확인하겠습니다.",
            ],
            [
              "I couldn't identify which project to inspect yet. Share the project name or path and I'll check immediately.",
            ],
            ["進捗を確認する対象プロジェクトが見つかりません。プロジェクト名またはパスを送ってください。"],
            ["还没找到要查询的项目。请提供项目名称或路径，我马上确认。"],
          ),
          lang,
        ),
      };
    }

    const rows = loadProjectProgressTasks(target);
    const projectName =
      target.projectName || target.projectPath || target.projectId || pickL(l(["(미지정)"], ["(unknown)"]), lang);
    if (rows.length === 0) {
      return {
        lang,
        projectFound: true,
        content: pickL(
          l(
            [`프로젝트 '${projectName}'에 등록된 태스크가 아직 없습니다.`],
            [`There are no tasks registered yet for project '${projectName}'.`],
            [`プロジェクト '${projectName}' にはまだ登録されたタスクがありません。`],
            [`项目 '${projectName}' 目前还没有已登记任务。`],
          ),
          lang,
        ),
      };
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }

    const total = rows.length;
    const done = counts.get("done") ?? 0;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const statusOrder = ["inbox", "planned", "collaborating", "in_progress", "review", "pending", "done", "cancelled"];
    const statusSummary = statusOrder
      .map((status) => ({ status, count: counts.get(status) ?? 0 }))
      .filter((entry) => entry.count > 0)
      .map((entry) => {
        const label = resolveProgressStatusLabel(entry.status, lang);
        if (lang === "ko") return `${label} ${entry.count}건`;
        if (lang === "ja") return `${label} ${entry.count}件`;
        if (lang === "zh") return `${label} ${entry.count}项`;
        return `${label} ${entry.count}`;
      })
      .join(lang === "ko" || lang === "ja" || lang === "zh" ? " / " : ", ");

    const recentRows = rows.slice(0, 5);
    const recentLines = recentRows.map((row, index) => {
      const statusLabel = resolveProgressStatusLabel(row.status, lang);
      const assignee =
        lang === "ko"
          ? normalizeTextField(row.assignee_name_ko) || normalizeTextField(row.assignee_name)
          : normalizeTextField(row.assignee_name);
      if (lang === "ko") {
        return `${index + 1}. [${statusLabel}] ${row.title}${assignee ? ` · 담당: ${assignee}` : ""}`;
      }
      if (lang === "ja") {
        return `${index + 1}. [${statusLabel}] ${row.title}${assignee ? ` · 担当: ${assignee}` : ""}`;
      }
      if (lang === "zh") {
        return `${index + 1}. [${statusLabel}] ${row.title}${assignee ? ` · 负责人: ${assignee}` : ""}`;
      }
      return `${index + 1}. [${statusLabel}] ${row.title}${assignee ? ` · owner: ${assignee}` : ""}`;
    });

    const header = pickL(
      l(
        [
          `프로젝트 진행 현황입니다.\n- 프로젝트: ${projectName}\n- 전체: ${total}건 / 완료율: ${completionRate}%\n- 상태: ${statusSummary}\n\n최근 업데이트:\n${recentLines.join("\n")}`,
        ],
        [
          `Here is the current project progress.\n- Project: ${projectName}\n- Total: ${total} / Completion: ${completionRate}%\n- Status: ${statusSummary}\n\nRecent updates:\n${recentLines.join("\n")}`,
        ],
        [
          `現在のプロジェクト進捗です。\n- プロジェクト: ${projectName}\n- 全体: ${total}件 / 完了率: ${completionRate}%\n- 状態: ${statusSummary}\n\n最近の更新:\n${recentLines.join("\n")}`,
        ],
        [
          `当前项目进度如下。\n- 项目: ${projectName}\n- 总计: ${total}项 / 完成率: ${completionRate}%\n- 状态: ${statusSummary}\n\n最近更新:\n${recentLines.join("\n")}`,
        ],
      ),
      lang,
    );

    return {
      lang,
      projectFound: true,
      content: header,
    };
  }

  function sendProjectProgressReply(agent: AgentRow, ceoMessage: string, options: DelegationOptions): void {
    const summary = buildProjectProgressSummary(agent, ceoMessage, options);
    if (!summary.projectFound) {
      sendInCharacterAutoMessage({
        agent,
        lang: summary.lang,
        scenario: "The user asked for project progress but no project is identified. Ask for project name or path.",
        fallback: summary.content,
        options,
      });
      return;
    }

    const leadFallback = pickL(
      l(
        ["네 대표님, 현재 프로젝트 진행 현황 정리했습니다."],
        ["Got it. Here's the current project progress summary."],
        ["了解しました。現在のプロジェクト進捗をまとめました。"],
        ["收到，以下是当前项目进度汇总。"],
      ),
      summary.lang,
    );

    void (async () => {
      const lead = await composeInCharacterAutoMessage(
        agent,
        summary.lang,
        "You are reporting current project task progress to the user. Keep one concise in-character sentence.",
        leadFallback,
      );
      const content = `${lead}\n\n${summary.content}`;
      sendAgentMessage(agent, content);
      await relayReplyToMessenger(options, agent, content);
    })().catch((err) => {
      console.warn(`[project-progress] failed to send progress reply from ${agent.name}: ${String(err)}`);
    });
  }

  function findProjectByPath(
    projectPath: string,
  ): { id: string; name: string | null; core_goal: string | null } | null {
    if (process.platform === "win32" || process.platform === "darwin") {
      return (
        (db
          .prepare("SELECT id, name, core_goal FROM projects WHERE LOWER(project_path) = LOWER(?) LIMIT 1")
          .get(projectPath) as { id: string; name: string | null; core_goal: string | null } | undefined) ?? null
      );
    }
    return (
      (db.prepare("SELECT id, name, core_goal FROM projects WHERE project_path = ? LIMIT 1").get(projectPath) as
        | { id: string; name: string | null; core_goal: string | null }
        | undefined) ?? null
    );
  }

  function createProjectBindingFromNameAndPath(
    taskMessage: string,
    nameInput: string,
    projectPathInput: string,
  ): {
    projectId: string;
    projectPath: string;
    projectContext: string;
    projectName: string;
    existed: boolean;
  } | null {
    const normalizedPath = path.normalize(expandUserPath(projectPathInput));
    if (!path.isAbsolute(normalizedPath)) return null;
    if (!isAllowedProjectCreationPath(normalizedPath)) return null;

    const existing = findProjectByPath(normalizedPath);
    if (existing) {
      return {
        projectId: existing.id,
        projectPath: normalizedPath,
        projectContext: normalizeTextField(existing.core_goal) || taskMessage.trim() || nameInput,
        projectName: normalizeTextField(existing.name) || nameInput || path.basename(normalizedPath),
        existed: true,
      };
    }

    try {
      fs.mkdirSync(normalizedPath, { recursive: true });
      if (!fs.statSync(normalizedPath).isDirectory()) return null;
    } catch {
      return null;
    }

    const projectId = randomUUID();
    const t = nowMs();
    const projectName = nameInput.trim() || path.basename(normalizedPath);
    const coreGoal = taskMessage.trim() || projectName;
    try {
      db.prepare(
        `
        INSERT INTO projects (id, name, project_path, core_goal, assignment_mode, last_used_at, created_at, updated_at, github_repo)
        VALUES (?, ?, ?, ?, 'auto', ?, ?, ?, NULL)
      `,
      ).run(projectId, projectName, normalizedPath, coreGoal, t, t, t);
    } catch (err) {
      console.warn(`[project-binding] failed to insert project: ${String(err)}`);
      return null;
    }

    return {
      projectId,
      projectPath: normalizedPath,
      projectContext: coreGoal,
      projectName,
      existed: false,
    };
  }

  function createDirectAgentTaskAndRun(agent: AgentRow, ceoMessage: string, options: DelegationOptions = {}): void {
    const lang = resolveLang(ceoMessage);
    const taskId = randomUUID();
    const t = nowMs();
    const taskTitle = ceoMessage.length > 60 ? `${ceoMessage.slice(0, 57)}...` : ceoMessage;
    const selectedProject = resolveProjectFromOptions(options);
    const projectCoreGoal = selectedProject.coreGoal || "";
    const projectContextHint = normalizeTextField(options.projectContext) || projectCoreGoal;
    const detectedPath =
      detectProjectPath(options.projectPath || selectedProject.projectPath || ceoMessage) ||
      selectedProject.projectPath;
    const roundGoal = buildRoundGoal(projectCoreGoal, ceoMessage);
    const deptId = agent.department_id ?? null;
    const deptName = deptId ? getDeptName(deptId) : "Unassigned";
    const descriptionLines = [`[CEO DIRECT] ${ceoMessage}`];
    if (selectedProject.name) descriptionLines.push(`[PROJECT] ${selectedProject.name}`);
    if (projectCoreGoal) descriptionLines.push(`[PROJECT CORE GOAL] ${projectCoreGoal}`);
    descriptionLines.push(`[ROUND GOAL] ${roundGoal}`);
    if (projectContextHint && projectContextHint !== projectCoreGoal) {
      descriptionLines.push(`[PROJECT CONTEXT] ${projectContextHint}`);
    }

    db.prepare(
      `
    INSERT INTO tasks (id, title, description, department_id, assigned_agent_id, project_id, status, priority, task_type, project_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'planned', 1, 'general', ?, ?, ?)
  `,
    ).run(taskId, taskTitle, descriptionLines.join("\n"), deptId, agent.id, selectedProject.id, detectedPath, t, t);
    registerTaskMessengerRoute(taskId, options);
    recordTaskCreationAudit({
      taskId,
      taskTitle,
      taskStatus: "planned",
      departmentId: deptId,
      assignedAgentId: agent.id,
      taskType: "general",
      projectPath: detectedPath ?? null,
      trigger: "workflow.direct_agent_task",
      triggerDetail: "direct chat escalated to task",
      actorType: "agent",
      actorId: agent.id,
      actorName: agent.name,
      body: {
        ceo_message: ceoMessage,
        message_type: "task_assign",
        project_id: selectedProject.id,
        project_context: projectContextHint,
        round_goal: roundGoal,
      },
    });
    if (selectedProject.id) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(t, t, selectedProject.id);
    }

    db.prepare("UPDATE agents SET current_task_id = ? WHERE id = ?").run(taskId, agent.id);
    appendTaskLog(taskId, "system", `Direct CEO assignment to ${agent.name}: ${ceoMessage}`);
    appendTaskLog(taskId, "system", `Round goal: ${roundGoal}`);
    if (selectedProject.id) {
      appendTaskLog(taskId, "system", `Project linked: ${selectedProject.name || selectedProject.id}`);
    }
    if (detectedPath) {
      appendTaskLog(taskId, "system", `Project path detected from direct chat: ${detectedPath}`);
    }

    const ack = pickL(
      l(
        ["지시 확인했습니다. 바로 작업으로 등록하고 착수하겠습니다."],
        ["Understood. I will register this as a task and start right away."],
        ["指示を確認しました。タスクとして登録し、すぐ着手します。"],
        ["已确认指示。我会先登记任务并立即开始执行。"],
      ),
      lang,
    );
    sendInCharacterAutoMessage({
      agent,
      lang,
      scenario: "You just accepted CEO's request and registered it as a task. Confirm immediate execution.",
      fallback: ack,
      options,
      messageType: "task_assign",
      taskId,
    });

    broadcast("task_update", db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId));
    broadcast("agent_status", db.prepare("SELECT * FROM agents WHERE id = ?").get(agent.id));

    setTimeout(
      () => {
        if (isTaskWorkflowInterrupted(taskId)) return;
        startTaskExecutionForAgent(taskId, agent, deptId, deptName);
      },
      randomDelay(900, 1600),
    );
  }

  function insertStreamingMessage(msgId: string, agent: AgentRow, content: string): void {
    const endedAt = nowMs();
    db.prepare(
      `
          INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, created_at)
          VALUES (?, 'agent', ?, 'agent', NULL, ?, 'chat', NULL, ?)
        `,
    ).run(msgId, agent.id, content, endedAt);
    broadcast("chat_stream", {
      phase: "end",
      message_id: msgId,
      agent_id: agent.id,
      content,
      created_at: endedAt,
    });
  }

  function mergePendingOptions(base: DelegationOptions, incoming: DelegationOptions): DelegationOptions {
    return {
      ...base,
      messengerChannel: incoming.messengerChannel ?? base.messengerChannel,
      messengerTargetId: incoming.messengerTargetId ?? base.messengerTargetId,
    };
  }

  function runTaskFlowWithResolvedProject(
    agent: AgentRow,
    taskMessage: string,
    taskOptions: DelegationOptions,
    lang: Lang,
  ): void {
    if (agent.role === "team_leader" && agent.department_id) {
      const taskAck = pickL(
        l(
          ["프로젝트 확인했습니다. 바로 업무로 승격해 진행하겠습니다."],
          ["Project confirmed. I will escalate this into a task and proceed now."],
          ["プロジェクトを確認しました。タスクに昇格して進めます。"],
          ["已确认项目。将立即升级为任务并执行。"],
        ),
        lang,
      );
      sendInCharacterAutoMessage({
        agent,
        lang,
        scenario: "Project binding has been confirmed. Confirm task escalation and immediate execution.",
        fallback: taskAck,
        options: taskOptions,
      });
      handleTaskDelegation(agent, taskMessage, "", taskOptions);
      return;
    }
    createDirectAgentTaskAndRun(agent, taskMessage, taskOptions);
  }

  function scheduleAgentReply(
    agentId: string,
    ceoMessage: string,
    messageType: string,
    options: DelegationOptions = {},
  ): void {
    const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as AgentRow | undefined;
    if (!agent) return;

    if (agent.status === "offline") {
      const lang = resolveLang(ceoMessage);
      const offlineMessage = buildCliFailureMessage(agent, lang, "offline");
      sendAgentMessage(agent, offlineMessage);
      void relayReplyToMessenger(options, agent, offlineMessage).catch((err) => {
        console.warn(`[messenger-reply] failed to relay offline message from ${agent.name}: ${String(err)}`);
      });
      return;
    }

    const now = nowMs();
    const pendingBinding = pendingProjectBindingByAgent.get(agent.id);
    if (pendingBinding) {
      if (now - pendingBinding.requestedAt > 60 * 60 * 1000) {
        pendingProjectBindingByAgent.delete(agent.id);
      } else {
        const lang = resolveLang(ceoMessage);
        const relayOptions = mergePendingOptions(pendingBinding.options, options);
        if (isCancelReply(ceoMessage)) {
          pendingProjectBindingByAgent.delete(agent.id);
          const cancelMsg = pickL(
            l(
              ["알겠습니다. 프로젝트 지정 대기는 취소했습니다."],
              ["Understood. I canceled the pending project binding request."],
              ["承知しました。プロジェクト指定待ちはキャンセルしました。"],
              ["已了解。已取消项目绑定等待。"],
            ),
            lang,
          );
          sendAgentMessage(agent, cancelMsg);
          void relayReplyToMessenger(relayOptions, agent, cancelMsg).catch((err) => {
            console.warn(`[messenger-reply] failed to relay pending-cancel message from ${agent.name}: ${String(err)}`);
          });
          return;
        }

        if (pendingBinding.state === "ask_kind") {
          const promptExistingSelection = (binding: PendingProjectBinding): void => {
            const recentCandidates = loadRecentExistingProjects(RECENT_EXISTING_PROJECT_LIMIT);
            const recentLines = formatExistingProjectCandidateLines(recentCandidates, lang);
            pendingProjectBindingByAgent.set(agent.id, {
              ...binding,
              state: "ask_existing",
              requestedAt: nowMs(),
              existingCandidates: recentCandidates,
            });
            const askExisting = pickL(
              l(
                [
                  recentLines.length > 0
                    ? `기존 프로젝트를 선택해주세요. 최근 프로젝트 ${RECENT_EXISTING_PROJECT_LIMIT}개입니다.\n${recentLines.join("\n")}\n번호(1-${recentLines.length}) 또는 프로젝트 이름/절대경로를 보내주세요.`
                    : "기존 프로젝트 목록이 비어 있습니다. 프로젝트 절대경로(예: /Users/classys/Projects/climpire) 또는 기존 프로젝트 이름을 보내주세요.",
                ],
                [
                  recentLines.length > 0
                    ? `Choose an existing project. Recent ${RECENT_EXISTING_PROJECT_LIMIT} projects:\n${recentLines.join("\n")}\nSend a number (1-${recentLines.length}) or project name/absolute path.`
                    : "No recent existing projects found. Send an absolute project path (e.g. /Users/classys/Projects/climpire) or an existing project name.",
                ],
                [
                  recentLines.length > 0
                    ? `既存プロジェクトを選んでください。最近の${RECENT_EXISTING_PROJECT_LIMIT}件です:\n${recentLines.join("\n")}\n番号(1-${recentLines.length}) またはプロジェクト名/絶対パスを送ってください。`
                    : "既存プロジェクト一覧がありません。絶対パスまたは既存プロジェクト名を送ってください。",
                ],
                [
                  recentLines.length > 0
                    ? `请选择已有项目。最近${RECENT_EXISTING_PROJECT_LIMIT}个项目如下：\n${recentLines.join("\n")}\n请发送编号(1-${recentLines.length})，或项目名称/绝对路径。`
                    : "当前没有最近项目列表。请发送项目绝对路径或已有项目名称。",
                ],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario:
                "You need the user to choose an existing project from a recent list. The user can answer with number, project name, or absolute path.",
              fallback: askExisting,
              options: relayOptions,
              strictFallback: true,
            });
          };

          const promptNewProjectName = (binding: PendingProjectBinding): void => {
            pendingProjectBindingByAgent.set(agent.id, {
              ...binding,
              state: "ask_new_name",
              requestedAt: nowMs(),
            });
            const askNewName = pickL(
              l(
                ["신규 프로젝트 이름을 먼저 알려주세요."],
                ["Please provide the new project name first."],
                ["新規プロジェクト名を先に教えてください。"],
                ["请先提供新项目名称。"],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario: "You need the new project name before continuing task escalation.",
              fallback: askNewName,
              options: relayOptions,
              strictFallback: true,
            });
          };

          const askKindAgain = (): void => {
            const askKind = pickL(
              l(
                ["기존 프로젝트인가요, 신규 프로젝트인가요?\n1️⃣ 기존 프로젝트\n2️⃣ 신규 프로젝트"],
                ["Is this an existing project or a new project?\n1️⃣ Existing project\n2️⃣ New project"],
                ["既存プロジェクトですか？新規プロジェクトですか？\n1️⃣ 既存\n2️⃣ 新規"],
                ["这是已有项目还是新项目？\n1️⃣ 已有项目\n2️⃣ 新项目"],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario: "Ask the user to choose project kind with two options: existing or new.",
              fallback: askKind,
              options: relayOptions,
              strictFallback: true,
            });
          };

          const projectKind = detectProjectKindChoice(ceoMessage);
          if (projectKind === "existing") {
            promptExistingSelection(pendingBinding);
            return;
          }
          if (projectKind === "new") {
            promptNewProjectName(pendingBinding);
            return;
          }

          const snapshotRequestedAt = pendingBinding.requestedAt;
          void (async () => {
            const inferred = await inferProjectKindWithModel(agent, lang, ceoMessage);
            const current = pendingProjectBindingByAgent.get(agent.id);
            if (!current || current.state !== "ask_kind") return;
            if (current.requestedAt !== snapshotRequestedAt) return;

            if (inferred === "existing") {
              promptExistingSelection(current);
              return;
            }
            if (inferred === "new") {
              promptNewProjectName(current);
              return;
            }
            askKindAgain();
          })().catch((err) => {
            console.warn(`[project-kind] async inference failed for ${agent.name}: ${String(err)}`);
            askKindAgain();
          });
          return;
        }

        if (pendingBinding.state === "ask_existing") {
          const fromRecent = selectExistingProjectFromCandidates(ceoMessage, pendingBinding.existingCandidates ?? []);
          const resolvedBinding = fromRecent ?? resolveProjectBindingFromText(ceoMessage);
          if (!resolvedBinding) {
            const refreshedCandidates = pendingBinding.existingCandidates?.length
              ? pendingBinding.existingCandidates
              : loadRecentExistingProjects(RECENT_EXISTING_PROJECT_LIMIT);
            pendingProjectBindingByAgent.set(agent.id, {
              ...pendingBinding,
              requestedAt: nowMs(),
              existingCandidates: refreshedCandidates,
            });
            const recentLines = formatExistingProjectCandidateLines(refreshedCandidates, lang);
            const askExistingAgain = pickL(
              l(
                [
                  recentLines.length > 0
                    ? `기존 프로젝트를 찾지 못했습니다. 아래 목록에서 번호(1-${recentLines.length}) 또는 정확한 프로젝트 이름/절대경로를 다시 보내주세요.\n${recentLines.join("\n")}`
                    : "기존 프로젝트를 찾지 못했습니다. 프로젝트 절대경로나 정확한 프로젝트 이름을 다시 보내주세요.",
                ],
                [
                  recentLines.length > 0
                    ? `I couldn't resolve that project. Reply with a number (1-${recentLines.length}) from the list or send the exact project name/absolute path.\n${recentLines.join("\n")}`
                    : "I couldn't find that existing project. Send an absolute project path or the exact project name again.",
                ],
                [
                  recentLines.length > 0
                    ? `既存プロジェクトを特定できませんでした。番号(1-${recentLines.length}) または正確なプロジェクト名/絶対パスを再送してください。\n${recentLines.join("\n")}`
                    : "既存プロジェクトが見つかりませんでした。絶対パスまたは正確なプロジェクト名を再送してください。",
                ],
                [
                  recentLines.length > 0
                    ? `未能定位已有项目。请回复列表编号(1-${recentLines.length})，或重新发送准确项目名称/绝对路径。\n${recentLines.join("\n")}`
                    : "未找到该已有项目。请重新发送项目绝对路径或准确的项目名称。",
                ],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario:
                "The provided existing project could not be found. Ask for exact project name or absolute path again.",
              fallback: askExistingAgain,
              options: relayOptions,
              strictFallback: true,
            });
            return;
          }

          pendingProjectBindingByAgent.delete(agent.id);
          const mergedOptions: DelegationOptions = {
            ...relayOptions,
            ...resolvedBinding,
          };
          runTaskFlowWithResolvedProject(agent, pendingBinding.taskMessage, mergedOptions, lang);
          return;
        }

        if (pendingBinding.state === "ask_new_name") {
          const newProjectName = normalizeNewProjectNameInput(ceoMessage);
          if (!newProjectName) {
            const askNameAgain = pickL(
              l(
                ["신규 프로젝트 이름을 다시 알려주세요. 예: climpire-redesign"],
                ["Please provide the new project name again. Example: climpire-redesign"],
                ["新規プロジェクト名をもう一度送ってください。例: climpire-redesign"],
                ["请重新提供新项目名称。例如：climpire-redesign"],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario: "The project name was invalid. Ask for a valid new project name again with an example.",
              fallback: askNameAgain,
              options: relayOptions,
              strictFallback: true,
            });
            return;
          }

          pendingProjectBindingByAgent.set(agent.id, {
            ...pendingBinding,
            state: "ask_new_path",
            requestedAt: now,
            newProjectName,
          });
          const askNewPath = pickL(
            l(
              ["신규 프로젝트 절대경로를 보내주세요. 예: /Users/classys/Projects/climpire-redesign"],
              ["Send the new project's absolute path. Example: /Users/classys/Projects/climpire-redesign"],
              ["新規プロジェクトの絶対パスを送ってください。例: /Users/classys/Projects/climpire-redesign"],
              ["请发送新项目绝对路径。例如：/Users/classys/Projects/climpire-redesign"],
            ),
            lang,
          );
          sendInCharacterAutoMessage({
            agent,
            lang,
            scenario: "Ask for the absolute path of the new project with a concrete example path.",
            fallback: askNewPath,
            options: relayOptions,
            strictFallback: true,
          });
          return;
        }

        if (pendingBinding.state === "ask_new_path") {
          const providedPath = extractAbsolutePathFromText(ceoMessage);
          if (!providedPath) {
            const askPathAgain = pickL(
              l(
                ["절대경로 형식으로 다시 보내주세요. 예: /Users/classys/Projects/climpire-redesign"],
                ["Please send it again as an absolute path. Example: /Users/classys/Projects/climpire-redesign"],
                ["絶対パス形式で再送してください。例: /Users/classys/Projects/climpire-redesign"],
                ["请用绝对路径格式重新发送。例如：/Users/classys/Projects/climpire-redesign"],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario: "Path format was invalid. Ask again for an absolute path with the same example.",
              fallback: askPathAgain,
              options: relayOptions,
              strictFallback: true,
            });
            return;
          }

          const binding = createProjectBindingFromNameAndPath(
            pendingBinding.taskMessage,
            pendingBinding.newProjectName || `project-${new Date().toISOString().slice(0, 10)}`,
            providedPath,
          );
          if (!binding) {
            const askPathFail = pickL(
              l(
                ["프로젝트 생성에 실패했습니다. 신규 프로젝트 절대경로를 다시 보내주세요."],
                ["Failed to create the project. Please send the new project's absolute path again."],
                ["プロジェクト作成に失敗しました。新規プロジェクトの絶対パスを再送してください。"],
                ["创建项目失败。请重新发送新项目绝对路径。"],
              ),
              lang,
            );
            sendInCharacterAutoMessage({
              agent,
              lang,
              scenario: "Project creation failed. Ask for the new project's absolute path again.",
              fallback: askPathFail,
              options: relayOptions,
              strictFallback: true,
            });
            return;
          }

          pendingProjectBindingByAgent.delete(agent.id);
          const mergedOptions: DelegationOptions = {
            ...relayOptions,
            projectId: binding.projectId,
            projectPath: binding.projectPath,
            projectContext: binding.projectContext,
          };
          runTaskFlowWithResolvedProject(agent, pendingBinding.taskMessage, mergedOptions, lang);
          return;
        }
      }
    }

    let taskMessage = ceoMessage;
    let useTaskFlow = shouldTreatDirectChatAsTask(ceoMessage, messageType);
    if (!useTaskFlow) {
      const recentRows = db
        .prepare(
          `
          SELECT content, message_type, created_at
          FROM messages
          WHERE sender_type = 'ceo'
            AND receiver_type = 'agent'
            AND receiver_id = ?
            AND created_at >= ?
          ORDER BY created_at DESC
          LIMIT 12
        `,
        )
        .all(agent.id, now - 30 * 60 * 1000) as Array<{
        content: string;
        message_type: string | null;
        created_at: number;
      }>;
      const recentAgentRows = db
        .prepare(
          `
          SELECT content, created_at
          FROM messages
          WHERE sender_type = 'agent'
            AND sender_id = ?
            AND receiver_type = 'agent'
            AND (receiver_id IS NULL OR receiver_id = '')
            AND created_at >= ?
          ORDER BY created_at DESC
          LIMIT 12
        `,
        )
        .all(agent.id, now - 30 * 60 * 1000) as Array<{
        content: string;
        created_at: number;
      }>;

      const contextualTaskMessage = resolveContextualTaskMessage(
        ceoMessage,
        recentRows.map((row) => ({
          content: row.content,
          messageType: row.message_type,
          createdAt: row.created_at,
        })),
        recentAgentRows.map((row) => ({
          content: row.content,
          createdAt: row.created_at,
        })),
      );
      if (contextualTaskMessage) {
        useTaskFlow = true;
        taskMessage = contextualTaskMessage;
      }
    }
    console.log(
      `[scheduleAgentReply] useTaskFlow=${useTaskFlow}, messageType=${messageType}, msg="${ceoMessage.slice(0, 50)}", taskMsg="${taskMessage.slice(0, 50)}"`,
    );
    if (useTaskFlow) {
      if (!hasProjectBinding(taskMessage, options)) {
        pendingProjectBindingByAgent.set(agent.id, {
          taskMessage,
          options: {
            ...options,
            messengerChannel: options.messengerChannel,
            messengerTargetId: options.messengerTargetId,
          },
          state: "ask_kind",
          requestedAt: now,
        });
        const askProject = pickL(
          l(
            [
              "프로젝트를 먼저 정해야 합니다. 기존 프로젝트인가요, 신규 프로젝트인가요?\n1️⃣ 기존 프로젝트\n2️⃣ 신규 프로젝트",
            ],
            [
              "I need to fix the project first. Is this an existing project or a new project?\n1️⃣ Existing project\n2️⃣ New project",
            ],
            ["先に対象プロジェクトを決める必要があります。既存ですか？新規ですか？\n1️⃣ 既存\n2️⃣ 新規"],
            ["需要先确定项目。是已有项目还是新项目？\n1️⃣ 已有项目\n2️⃣ 新项目"],
          ),
          resolveLang(ceoMessage),
        );
        sendInCharacterAutoMessage({
          agent,
          lang: resolveLang(ceoMessage),
          scenario: "Before task execution, ask project kind with two options: existing or new.",
          fallback: askProject,
          options,
          strictFallback: true,
        });
        return;
      }
      runTaskFlowWithResolvedProject(agent, taskMessage, options, resolveLang(ceoMessage));
      return;
    }

    if (isProjectProgressInquiry(ceoMessage, messageType)) {
      sendProjectProgressReply(agent, ceoMessage, options);
      return;
    }

    const delay = 1000 + Math.random() * 2000;
    setTimeout(() => {
      void (async () => {
        const stopTyping = startMessengerTypingHeartbeat(options, agent);
        try {
          const activeTask = agent.current_task_id
            ? (db
                .prepare("SELECT title, description, project_path FROM tasks WHERE id = ?")
                .get(agent.current_task_id) as
                | {
                    title: string;
                    description: string | null;
                    project_path: string | null;
                  }
                | undefined)
            : undefined;
          const detectedPath = detectProjectPath(ceoMessage);
          const projectPath = detectedPath || (activeTask ? resolveProjectPath(activeTask) : process.cwd());

          const built = buildDirectReplyPrompt(agent, ceoMessage, messageType);

          console.log(
            `[scheduleAgentReply] agent=${agent.name}, cli_provider=${agent.cli_provider}, api_provider_id=${agent.api_provider_id}, api_model=${agent.api_model}`,
          );

          if (agent.cli_provider === "api" && agent.api_provider_id) {
            const msgId = randomUUID();
            broadcast("chat_stream", {
              phase: "start",
              message_id: msgId,
              agent_id: agent.id,
              agent_name: agent.name,
              agent_avatar: agent.avatar_emoji ?? "🤖",
            });

            let fullText = "";
            let apiError = "";
            try {
              const logStream = fs.createWriteStream(path.join(logsDir, `direct-${agent.id}-${Date.now()}.log`), {
                flags: "w",
              });
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 180_000);
              try {
                await executeApiProviderAgent(
                  built.prompt,
                  projectPath,
                  logStream,
                  controller.signal,
                  undefined,
                  agent.api_provider_id,
                  agent.api_model ?? null,
                  (text: string) => {
                    fullText += text;
                    logStream.write(text);
                    broadcast("chat_stream", {
                      phase: "delta",
                      message_id: msgId,
                      agent_id: agent.id,
                      text,
                    });
                    return true;
                  },
                );
              } finally {
                clearTimeout(timeout);
                logStream.end();
              }
            } catch (err: any) {
              apiError = err?.message || String(err);
              console.error(`[scheduleAgentReply:API] Error for ${agent.name}:`, apiError);
            }

            const contentOnly = fullText
              .replace(/^\[api:[^\]]*\][^\n]*\n---\n/g, "")
              .replace(/\n---\n\[api:[^\]]*\]\s*Done\.\s*$/g, "")
              .trim();

            let finalReply: string;
            if (contentOnly) {
              finalReply = contentOnly.length > 12000 ? contentOnly.slice(0, 12000) : contentOnly;
            } else if (apiError) {
              finalReply = `[API Error] ${apiError}`;
            } else {
              finalReply = chooseSafeReply({ text: "" }, built.lang, "direct", agent);
            }
            finalReply = normalizeAgentReply(finalReply);

            insertStreamingMessage(msgId, agent, finalReply);
            void relayReplyToMessenger(options, agent, finalReply).catch((err) => {
              console.warn(`[messenger-reply] failed to relay API reply from ${agent.name}: ${String(err)}`);
            });
            return;
          }

          if (agent.cli_provider === "copilot" || agent.cli_provider === "antigravity") {
            const msgId = randomUUID();
            broadcast("chat_stream", {
              phase: "start",
              message_id: msgId,
              agent_id: agent.id,
              agent_name: agent.name,
              agent_avatar: agent.avatar_emoji ?? "🤖",
            });

            let fullText = "";
            let oauthError = "";
            try {
              const logStream = fs.createWriteStream(path.join(logsDir, `direct-${agent.id}-${Date.now()}.log`), {
                flags: "w",
              });
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 180_000);
              const streamCb = (text: string) => {
                fullText += text;
                logStream.write(text);
                broadcast("chat_stream", {
                  phase: "delta",
                  message_id: msgId,
                  agent_id: agent.id,
                  text,
                });
                return true;
              };
              try {
                if (agent.cli_provider === "copilot") {
                  await executeCopilotAgent(
                    built.prompt,
                    projectPath,
                    logStream,
                    controller.signal,
                    undefined,
                    agent.oauth_account_id ?? null,
                    streamCb,
                  );
                } else {
                  await executeAntigravityAgent(
                    built.prompt,
                    logStream,
                    controller.signal,
                    undefined,
                    agent.oauth_account_id ?? null,
                    streamCb,
                  );
                }
              } finally {
                clearTimeout(timeout);
                logStream.end();
              }
            } catch (err: any) {
              oauthError = err?.message || String(err);
              console.error(`[scheduleAgentReply:OAuth] Error for ${agent.name}:`, oauthError);
            }

            const contentOnly = fullText
              .replace(/^\[(copilot|antigravity)\][^\n]*\n/gm, "")
              .replace(/---+/g, "")
              .replace(/^\[oauth[^\]]*\][^\n]*/gm, "")
              .trim();

            let finalReply: string;
            if (contentOnly) {
              finalReply = contentOnly.length > 12000 ? contentOnly.slice(0, 12000) : contentOnly;
            } else if (oauthError) {
              finalReply = `[OAuth Error] ${oauthError}`;
            } else {
              finalReply = chooseSafeReply({ text: "" }, built.lang, "direct", agent);
            }
            finalReply = normalizeAgentReply(finalReply);

            insertStreamingMessage(msgId, agent, finalReply);
            void relayReplyToMessenger(options, agent, finalReply).catch((err) => {
              console.warn(`[messenger-reply] failed to relay OAuth reply from ${agent.name}: ${String(err)}`);
            });
            return;
          }

          const run = await runAgentOneShot(agent, built.prompt, { projectPath, rawOutput: true });
          const reply = normalizeAgentReply(chooseSafeReply(run, built.lang, "direct", agent));
          sendAgentMessage(agent, reply);
          void relayReplyToMessenger(options, agent, reply).catch((err) => {
            console.warn(`[messenger-reply] failed to relay direct reply from ${agent.name}: ${String(err)}`);
          });
        } finally {
          stopTyping();
        }
      })().catch((err) => {
        console.warn(`[scheduleAgentReply] async generation failed for ${agent.name}: ${String(err)}`);
      });
    }, delay);
  }

  return {
    shouldTreatDirectChatAsTask,
    createDirectAgentTaskAndRun,
    scheduleAgentReply,
  };
}
