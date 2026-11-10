import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Agent, Task, MeetingMinute } from "../types";
import * as api from "../api";
import type { TerminalProgressHint, TerminalProgressHintsPayload } from "../api";
import {
  ArrowDownToLine,
  Check,
  ChevronsDown,
  FileText,
  LoaderCircle,
  SquareTerminal,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import AgentAvatar from "./AgentAvatar";
import { useI18n } from "../i18n";
import {
  INTERVENTION_PROMPT_MAX_LENGTH,
  STATUS_BADGES,
  TERMINAL_TASK_LOG_LIMIT,
  TERMINAL_TAIL_LINES,
  type TaskLogEntry,
  type TerminalPanelProps,
} from "./terminal-panel/model";

export default function TerminalPanel({
  taskId,
  task,
  agent,
  agents,
  initialTab = "terminal",
  onClose,
}: TerminalPanelProps) {
  const [text, setText] = useState("");
  const [taskLogs, setTaskLogs] = useState<TaskLogEntry[]>([]);
  const [progressHints, setProgressHints] = useState<TerminalProgressHintsPayload | null>(null);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinute[]>([]);
  const [logPath, setLogPath] = useState("");
  const [follow, setFollow] = useState(true);
  const [activeTab, setActiveTab] = useState<"terminal" | "minutes">(initialTab);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [interventionPrompt, setInterventionPrompt] = useState("");
  const [interventionBusy, setInterventionBusy] = useState(false);
  const [interventionError, setInterventionError] = useState<string | null>(null);
  const [interventionMessage, setInterventionMessage] = useState<string | null>(null);
  const [interruptProof, setInterruptProof] = useState<{
    session_id: string;
    control_token: string;
    requires_csrf: boolean;
  } | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const { t, locale } = useI18n();

  const tr = (ko: string, en: string, fr: string, ja = en, zh = en) => t({ ko, en, fr, ja, zh });

  const isKorean = locale.startsWith("ko");
  const agentName = agent ? (isKorean ? agent.name_ko || agent.name : agent.name || agent.name_ko) : null;

  const taskLogTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [locale],
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, taskId]);

  useEffect(() => {
    setInterventionOpen(false);
    setInterventionPrompt("");
    setInterventionBusy(false);
    setInterventionError(null);
    setInterventionMessage(null);
  }, [taskId]);

  // Poll terminal endpoint every 1.5s
  const fetchTerminal = useCallback(async () => {
    try {
      const res = await api.getTerminal(taskId, TERMINAL_TAIL_LINES, true, TERMINAL_TASK_LOG_LIMIT);
      if (res.ok) {
        setLogPath(res.path);
        if (res.task_logs) {
          setTaskLogs((prev) => {
            const next = res.task_logs ?? [];
            const prevLast = prev.length > 0 ? prev[prev.length - 1].id : null;
            const nextLast = next.length > 0 ? next[next.length - 1].id : null;
            if (prev.length === next.length && prevLast === nextLast) return prev;
            return next;
          });
        }
        setProgressHints(res.progress_hints ?? null);
        setInterruptProof(res.interrupt ?? null);
        if (res.exists) {
          const nextText = res.text ?? "";
          setText((prev) => (prev === nextText ? prev : nextText));
        } else {
          setText((prev) => (prev === "" ? prev : ""));
        }
      }
    } catch {
      // ignore
    }
  }, [taskId]);

  const fetchMeetingMinutes = useCallback(async () => {
    try {
      const rows = await api.getTaskMeetingMinutes(taskId);
      setMeetingMinutes(rows);
    } catch {
      // ignore
    }
  }, [taskId]);

  useEffect(() => {
    const fn = activeTab === "terminal" ? fetchTerminal : fetchMeetingMinutes;
    const ms = activeTab === "terminal" ? 1500 : 2500;
    fn();
    let timer: ReturnType<typeof setInterval>;
    function start() {
      timer = setInterval(fn, ms);
    }
    function handleVisibility() {
      clearInterval(timer);
      if (!document.hidden) {
        fn();
        start();
      }
    }
    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeTab, fetchTerminal, fetchMeetingMinutes]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-scroll when follow is enabled
  useEffect(() => {
    if (follow && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text, follow]);

  // Detect if user scrolled away from bottom
  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (!atBottom && follow) setFollow(false);
  }

  function scrollToBottom() {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setFollow(true);
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  useEffect(() => {
    if (!interventionOpen) return;
    setTimeout(() => promptInputRef.current?.focus(), 40);
  }, [interventionOpen]);

  const isInterventionTarget = task?.status === "in_progress" || task?.status === "pending";
  const canInjectPrompt = task?.status === "pending";
  const hasAssignedAgent = Boolean(task?.assigned_agent_id);
  const hasInterruptProof = Boolean(interruptProof?.session_id && interruptProof?.control_token);
  const canAttemptInterrupt = hasAssignedAgent || hasInterruptProof;

  async function fetchInterruptProofNow() {
    const latest = await api.getTerminal(taskId, TERMINAL_TAIL_LINES, true, TERMINAL_TASK_LOG_LIMIT);
    if (!latest.ok) return null;
    setInterruptProof(latest.interrupt ?? null);
    return latest.interrupt ?? null;
  }

  async function fetchInterruptProofWithRetry(maxAttempts = 4): Promise<{
    session_id: string;
    control_token: string;
    requires_csrf: boolean;
  } | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const proof = await fetchInterruptProofNow();
      if (proof?.session_id && proof.control_token) return proof;
      if (attempt < maxAttempts - 1) {
        await sleep(180 * (attempt + 1));
      }
    }
    return null;
  }

  async function handlePauseOnly() {
    try {
      setInterventionBusy(true);
      setInterventionError(null);
      setInterventionMessage(null);
      const pauseResult = await api.pauseTask(taskId);
      if (pauseResult.interrupt?.session_id && pauseResult.interrupt.control_token) {
        setInterruptProof(pauseResult.interrupt);
      }
      await fetchTerminal();
      setInterventionMessage(
        tr(
          "작업을 보류 상태로 전환했습니다. 프롬프트를 주입한 뒤 재개해 주세요.",
          "Task paused. Inject a prompt and resume.",
          "Tâche mise en pause. Ajoutez une consigne puis reprenez.",
          "タスクを保留にしました。プロンプト注入後に再開してください。",
          "任务已暂停。请注入提示后恢复。",
        ),
      );
    } catch (error) {
      setInterventionError(
        error instanceof Error
          ? error.message
          : tr(
              "일시중지 요청에 실패했습니다.",
              "Pause request failed.",
              "La demande de pause a échoué.",
              "一時停止リクエストに失敗しました。",
              "暂停请求失败。",
            ),
      );
    } finally {
      setInterventionBusy(false);
    }
  }

  async function handleInjectAndResume() {
    const prompt = interventionPrompt.trim();
    if (!prompt) {
      setInterventionError(
        tr(
          "주입할 프롬프트를 입력해 주세요.",
          "Please enter a prompt to inject.",
          "Saisissez la consigne à transmettre.",
          "注入するプロンプトを入力してください。",
          "请输入要注入的提示。",
        ),
      );
      return;
    }

    try {
      setInterventionBusy(true);
      setInterventionError(null);
      setInterventionMessage(null);

      let proof = interruptProof;
      if (task?.status === "in_progress") {
        const pauseResult = await api.pauseTask(taskId);
        if (pauseResult.interrupt?.session_id && pauseResult.interrupt.control_token) {
          proof = pauseResult.interrupt;
          setInterruptProof(pauseResult.interrupt);
        }
        if (!proof?.session_id || !proof.control_token) {
          proof = await fetchInterruptProofWithRetry(4);
        }
      } else if (task?.status === "pending") {
        const pauseResult = await api.pauseTask(taskId);
        if (pauseResult.interrupt?.session_id && pauseResult.interrupt.control_token) {
          proof = pauseResult.interrupt;
          setInterruptProof(pauseResult.interrupt);
        }
        if (!proof?.session_id || !proof.control_token) {
          proof = await fetchInterruptProofWithRetry(3);
        }
      }

      if (!proof?.session_id || !proof.control_token) {
        if (!hasAssignedAgent) {
          throw new Error(
            tr(
              "담당 에이전트가 배정되지 않아 난입 세션을 만들 수 없습니다. 먼저 에이전트를 배정해 주세요.",
              "Cannot create an interrupt session because no agent is assigned. Assign an agent first.",
              "Impossible d’intervenir : aucun agent n’est assigné. Assignez d’abord un agent.",
              "担当エージェントが未割り当てのため、割り込みセッションを作成できません。先にエージェントを割り当ててください。",
              "由于未分配执行代理，无法创建中断会话。请先分配代理。",
            ),
          );
        }
        throw new Error(
          tr(
            "난입 세션 토큰이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
            "Interrupt session token is not ready yet. Please retry shortly.",
            "La session d’intervention n’est pas encore prête. Réessayez dans un instant.",
            "割り込みセッショントークンはまだ準備できていません。しばらくしてから再試行してください。",
            "中断会话令牌尚未就绪，请稍后重试。",
          ),
        );
      }

      await api.injectTaskPrompt(taskId, {
        session_id: proof.session_id,
        interrupt_token: proof.control_token,
        prompt,
      });
      await api.resumeTask(taskId);
      setInterventionPrompt("");
      await fetchTerminal();
      setInterventionMessage(
        tr(
          "난입 프롬프트를 주입하고 재개를 요청했습니다.",
          "Prompt injected and resume requested.",
          "Consigne transmise, reprise demandée.",
          "プロンプトを注入し、再開をリクエストしました。",
          "已注入提示并请求恢复。",
        ),
      );
    } catch (error) {
      setInterventionError(
        error instanceof Error
          ? error.message
          : tr(
              "난입 실행에 실패했습니다.",
              "Interrupt inject failed.",
              "L’intervention a échoué.",
              "割り込み注入に失敗しました。",
              "中断注入失败。",
            ),
      );
    } finally {
      setInterventionBusy(false);
    }
  }

  async function handleResumeOnly() {
    try {
      setInterventionBusy(true);
      setInterventionError(null);
      setInterventionMessage(null);
      await api.resumeTask(taskId);
      await fetchTerminal();
      setInterventionMessage(
        tr(
          "재개 요청을 전송했습니다.",
          "Resume requested.",
          "Reprise demandée.",
          "再開をリクエストしました。",
          "已请求恢复。",
        ),
      );
    } catch (error) {
      setInterventionError(
        error instanceof Error
          ? error.message
          : tr(
              "재개 요청에 실패했습니다.",
              "Resume request failed.",
              "La demande de reprise a échoué.",
              "再開リクエストに失敗しました。",
              "恢复请求失败。",
            ),
      );
    } finally {
      setInterventionBusy(false);
    }
  }

  const badge = STATUS_BADGES[task?.status ?? ""] ?? STATUS_BADGES.inbox;
  const badgeLabel = t(badge.label);
  const badgeClass = badge.tone === "accent" ? "qg-badge qg-badge--accent" : "qg-badge";
  const meetingTypeLabel = (type: "planned" | "review") =>
    type === "planned"
      ? tr("Planned 승인", "Planned Approval", "Validation du plan", "Planned 承認", "Planned 审批")
      : tr("Review 승인", "Review Approval", "Validation de la revue", "Review 承認", "Review 审批");
  const meetingStatusLabel = (status: MeetingMinute["status"]) => {
    if (status === "completed") return tr("완료", "Completed", "Terminé", "完了", "已完成");
    if (status === "revision_requested")
      return tr("보완 요청", "Revision Requested", "Révision demandée", "修正要請", "要求修订");
    if (status === "failed") return tr("실패", "Failed", "Échec", "失敗", "失败");
    return tr("진행중", "In Progress", "En cours", "進行中", "进行中");
  };

  const compactHintText = (value: string, max = 90) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
  };

  const shortPath = (value: string) => {
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts.length === 0 ? value : parts[parts.length - 1];
  };

  const hintLineLabel = (hint: TerminalProgressHint) => {
    const summary = compactHintText(hint.summary, 100);
    if (hint.phase === "ok") {
      return tr(
        `... ${hint.tool} 확인 완료: ${summary}`,
        `... ${hint.tool} checked: ${summary}`,
        `… ${hint.tool} vérifié : ${summary}`,
        `... ${hint.tool} 確認完了: ${summary}`,
        `... ${hint.tool} 已确认: ${summary}`,
      );
    }
    if (hint.phase === "error") {
      return tr(
        `... ${hint.tool} 재확인 중: ${summary}`,
        `... ${hint.tool} retry/check: ${summary}`,
        `… ${hint.tool} nouvelle vérification : ${summary}`,
        `... ${hint.tool} 再確認中: ${summary}`,
        `... ${hint.tool} 重试/检查: ${summary}`,
      );
    }
    return tr(
      `... ${hint.tool} 진행 중: ${summary}`,
      `... ${hint.tool} in progress: ${summary}`,
      `… ${hint.tool} en cours : ${summary}`,
      `... ${hint.tool} 実行中: ${summary}`,
      `... ${hint.tool} 进行中: ${summary}`,
    );
  };

  const shouldShowProgressHints = activeTab === "terminal" && Boolean(progressHints && progressHints.hints.length > 0);

  const latestHint =
    shouldShowProgressHints && progressHints && progressHints.hints.length > 0
      ? progressHints.hints[progressHints.hints.length - 1]
      : null;
  const activeToolHint =
    shouldShowProgressHints && progressHints
      ? ([...progressHints.hints].reverse().find((hint) => hint.phase === "use") ?? latestHint)
      : null;

  const iconProps = { size: 16, "aria-hidden": true } as const;
  const tabClass = "qg-choice w-auto min-h-9 px-3 py-1.5";
  const terminalSurface = { background: "#141716", color: "#ecebe6" } as const;

  return (
    <div className="terminal-panel-shell fixed inset-0 z-50 flex w-full max-w-full flex-col shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[560px] lg:border-l">
      {/* Header */}
      <div
        className="terminal-panel-header border-b px-4 pt-3 pb-2"
        style={{ background: "var(--th-bg-surface)", borderColor: "var(--th-border)" }}
      >
        <div className="flex items-start gap-3">
          {agent && <AgentAvatar agent={agent} agents={agents} size={32} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold" style={{ color: "var(--th-text-heading)" }}>
                {task?.title ?? taskId}
              </h3>
              <span className={`${badgeClass} flex-shrink-0`}>{badgeLabel}</span>
            </div>
            {logPath && (
              <div className="qg-text-muted mt-0.5 truncate font-mono text-[12px]" title={logPath}>
                {logPath}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="qg-icon-btn flex-shrink-0"
            aria-label={tr("닫기", "Close", "Fermer", "閉じる", "关闭")}
          >
            <X {...iconProps} />
          </button>
        </div>

        {/* Tabs + toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label={tr("보기 선택", "View", "Affichage", "表示", "视图")}
          >
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={tabClass}
              aria-pressed={activeTab === "terminal"}
            >
              <SquareTerminal {...iconProps} />
              {tr("터미널", "Terminal", "Terminal", "ターミナル", "终端")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("minutes")}
              className={tabClass}
              aria-pressed={activeTab === "minutes"}
            >
              <FileText {...iconProps} />
              {tr("회의록", "Minutes", "Compte rendu", "会議録", "会议纪要")}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {isInterventionTarget && (
              <button
                type="button"
                onClick={() => {
                  setInterventionOpen((prev) => !prev);
                  setInterventionError(null);
                  setInterventionMessage(null);
                }}
                className={`qg-btn qg-btn--sm${interventionOpen ? " qg-btn--danger" : ""}`}
                aria-pressed={interventionOpen}
                title={tr("난입 패널", "Interrupt panel", "Panneau d’intervention", "割り込みパネル", "中断面板")}
              >
                <Zap {...iconProps} />
                {task?.status === "pending"
                  ? tr("주입", "Inject", "Consigne", "注入", "注入")
                  : tr("난입", "Interrupt", "Intervenir", "割込", "中断")}
              </button>
            )}
            {/* Follow toggle */}
            <button
              type="button"
              onClick={() => setFollow((f) => !f)}
              className="qg-btn qg-btn--sm"
              aria-pressed={follow}
              style={follow ? { borderColor: "var(--qg-accent)", color: "var(--qg-accent)" } : undefined}
              title={
                follow
                  ? tr("자동 스크롤 ON", "Auto-scroll ON", "Défilement auto activé", "自動スクロール ON", "自动滚动 ON")
                  : tr(
                      "자동 스크롤 OFF",
                      "Auto-scroll OFF",
                      "Défilement auto désactivé",
                      "自動スクロール OFF",
                      "自动滚动 OFF",
                    )
              }
            >
              <ChevronsDown {...iconProps} />
              {follow
                ? tr("따라가기", "FOLLOW", "Défilement auto", "追従中", "跟随中")
                : tr("일시정지", "PAUSED", "Défilement en pause", "一時停止", "已暂停")}
            </button>
            {/* Scroll to bottom */}
            <button
              type="button"
              onClick={scrollToBottom}
              className="qg-btn qg-btn--sm qg-btn--ghost"
              aria-label={tr("맨 아래로", "Scroll to bottom", "Aller en bas", "一番下へ", "滚动到底部")}
              title={tr("맨 아래로", "Scroll to bottom", "Aller en bas", "一番下へ", "滚动到底部")}
            >
              <ArrowDownToLine {...iconProps} />
            </button>
          </div>
        </div>
      </div>

      {activeTab === "terminal" && isInterventionTarget && interventionOpen && (
        <div
          className="space-y-2 border-b px-4 py-3"
          style={{ background: "var(--th-bg-surface)", borderColor: "var(--th-border)" }}
        >
          <div className="qg-text-secondary text-[13px]">
            {task?.status === "in_progress"
              ? tr(
                  "실행 중 작업을 보류하고, 새 프롬프트를 주입한 뒤 자동 재개합니다.",
                  "Pause the running task, inject a new prompt, then auto-resume.",
                  "La tâche en cours est mise en pause, la nouvelle consigne est transmise, puis le travail reprend automatiquement.",
                  "実行中タスクを保留にし、新しいプロンプトを注入して自動再開します。",
                  "将运行中的任务暂停，注入新提示后自动恢复。",
                )
              : tr(
                  "보류 상태에서 프롬프트를 주입하고 재개할 수 있습니다.",
                  "Inject a prompt while pending and resume execution.",
                  "Tâche en pause : transmettez une consigne puis relancez le travail.",
                  "保留状態でプロンプトを注入し、再開できます。",
                  "可在暂停状态下注入提示并恢复执行。",
                )}
          </div>
          <textarea
            ref={promptInputRef}
            value={interventionPrompt}
            onChange={(event) => {
              const next = event.target.value.slice(0, INTERVENTION_PROMPT_MAX_LENGTH);
              setInterventionPrompt(next);
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !interventionBusy) {
                event.preventDefault();
                void handleInjectAndResume();
              }
            }}
            rows={3}
            disabled={interventionBusy}
            className="qg-textarea"
            aria-label={tr(
              "주입할 프롬프트",
              "Prompt to inject",
              "Consigne à transmettre",
              "注入するプロンプト",
              "要注入的提示",
            )}
            placeholder={tr(
              "예) 방금 방식 대신 테스트를 먼저 실행하고 실패 원인을 정리해.",
              "e.g. Run tests first, then summarize failures before continuing.",
              "Ex. : lancez d’abord les tests, puis résumez les échecs avant de continuer.",
              "例) 先にテストを実行し、失敗原因を整理してから続行してください。",
              "例如：先执行测试，再整理失败原因后继续。",
            )}
          />
          <div className="qg-text-muted flex items-center justify-between text-[13px]">
            <span>{`${interventionPrompt.length} / ${INTERVENTION_PROMPT_MAX_LENGTH}`}</span>
            <span>
              {tr(
                "Ctrl+Enter로 실행",
                "Ctrl+Enter to run",
                "Ctrl+Entrée pour envoyer",
                "Ctrl+Enterで実行",
                "Ctrl+Enter 执行",
              )}
            </span>
          </div>
          {interventionError && (
            <div className="text-[13px] break-words" role="alert" style={{ color: "var(--qg-pin)" }}>
              {interventionError}
            </div>
          )}
          {interventionMessage && (
            <div className="text-[13px] break-words" role="status" style={{ color: "var(--qg-accent)" }}>
              {interventionMessage}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {task?.status === "in_progress" && (
              <button
                type="button"
                onClick={() => void handlePauseOnly()}
                disabled={interventionBusy}
                className="qg-btn qg-btn--sm"
              >
                {interventionBusy
                  ? tr("처리 중...", "Processing...", "Traitement…", "処理中...", "处理中...")
                  : tr("일시중지", "Pause", "Mettre en pause", "一時停止", "暂停")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleInjectAndResume()}
              disabled={interventionBusy || !interventionPrompt.trim() || !canAttemptInterrupt}
              className="qg-btn qg-btn--sm qg-btn--danger"
            >
              {interventionBusy
                ? tr("실행 중...", "Running...", "Envoi…", "実行中...", "执行中...")
                : tr("난입 실행", "Inject + Resume", "Transmettre et reprendre", "割込実行", "中断注入")}
            </button>
            {canInjectPrompt && (
              <button
                type="button"
                onClick={() => void handleResumeOnly()}
                disabled={interventionBusy}
                className="qg-btn qg-btn--sm"
              >
                {tr("재개만", "Resume only", "Reprendre seulement", "再開のみ", "仅恢复")}
              </button>
            )}
          </div>
          {!interruptProof?.session_id && (
            <div className="qg-text-secondary flex items-start gap-1.5 text-[13px]">
              <TriangleAlert {...iconProps} className="mt-0.5 flex-shrink-0" />
              <span>
                {hasAssignedAgent
                  ? tr(
                      "세션 토큰이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
                      "Session token is not ready yet. Please retry shortly.",
                      "La session n’est pas encore prête. Réessayez dans un instant.",
                      "セッショントークンがまだ準備されていません。しばらくしてから再試行してください。",
                      "会话令牌尚未就绪，请稍后重试。",
                    )
                  : tr(
                      "담당 에이전트가 없어 세션 토큰을 만들 수 없습니다. 먼저 에이전트를 배정해 주세요.",
                      "No assigned agent, so a session token cannot be created. Assign an agent first.",
                      "Aucun agent assigné : impossible d’ouvrir une session. Assignez d’abord un agent.",
                      "担当エージェントがいないためセッショントークンを作成できません。先にエージェントを割り当ててください。",
                      "未分配代理，无法创建会话令牌。请先分配代理。",
                    )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Task log markers (system events) */}
      {activeTab === "terminal" && taskLogs.length > 0 && (
        <div
          className="terminal-panel-strip max-h-24 space-y-0.5 overflow-y-auto border-b px-4 py-2"
          style={{ background: "var(--th-bg-surface)", borderColor: "var(--th-border)" }}
        >
          {taskLogs.map((log) => {
            const kindColor =
              log.kind === "error"
                ? "var(--qg-pin)"
                : log.kind === "system"
                  ? "var(--th-text-secondary)"
                  : "var(--th-text-muted)";
            const time = taskLogTimeFormatter.format(new Date(log.created_at));
            return (
              <div key={log.id} className="font-mono text-[12px]" style={{ color: kindColor }}>
                [{time}] {log.message}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal body */}
      {activeTab === "terminal" ? (
        <div ref={containerRef} className="flex-1 overflow-y-auto p-4" style={terminalSurface} onScroll={handleScroll}>
          {!text ? (
            <div className="flex h-full flex-col items-center justify-center gap-3" style={{ color: "#a9a8a1" }}>
              {task?.status === "in_progress" ? (
                <LoaderCircle size={28} aria-hidden className="motion-safe:animate-spin" />
              ) : (
                <SquareTerminal size={28} aria-hidden />
              )}
              <div className="text-[14px]">
                {task?.status === "in_progress"
                  ? shouldShowProgressHints
                    ? tr(
                        "도구 실행 중...",
                        "Tools are running...",
                        "Outils en cours d’exécution…",
                        "ツール実行中...",
                        "工具正在运行...",
                      )
                    : tr(
                        "출력을 기다리는 중...",
                        "Waiting for output...",
                        "En attente de sortie…",
                        "出力待機中...",
                        "正在等待输出...",
                      )
                  : tr(
                      "아직 터미널 출력이 없습니다",
                      "No terminal output yet",
                      "Aucune sortie pour le moment",
                      "まだターミナル出力がありません",
                      "暂无终端输出",
                    )}
              </div>
            </div>
          ) : (
            <pre ref={preRef} className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
              {text}
            </pre>
          )}
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ background: "var(--th-bg-primary)" }}>
          {meetingMinutes.length === 0 ? (
            <div className="qg-empty flex h-full flex-col items-center justify-center gap-3">
              <FileText size={28} aria-hidden />
              <div>
                {tr(
                  "회의록이 아직 없습니다",
                  "No meeting minutes yet",
                  "Aucun compte rendu pour le moment",
                  "会議録はまだありません",
                  "暂无会议纪要",
                )}
              </div>
            </div>
          ) : (
            meetingMinutes.map((meeting) => (
              <section
                key={meeting.id}
                className="rounded-[var(--qg-radius)] border p-3"
                style={{ borderColor: "var(--th-border)", background: "var(--th-bg-surface)" }}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="qg-badge qg-badge--accent">{meetingTypeLabel(meeting.meeting_type)}</span>
                  <span className="qg-badge">
                    {tr("라운드", "Round", "Tour", "ラウンド", "轮次")} {meeting.round}
                  </span>
                  <span className={meeting.status === "failed" ? "qg-badge qg-badge--pin" : "qg-badge"}>
                    {meetingStatusLabel(meeting.status)}
                  </span>
                  <span className="qg-text-muted ml-auto text-[13px]">
                    {new Date(meeting.started_at).toLocaleString(locale)}
                  </span>
                </div>
                <div className="space-y-2">
                  {meeting.entries.map((entry) => (
                    <div key={entry.id} className="qg-card">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="qg-text-muted">#{entry.seq}</span>
                        <span className="font-semibold" style={{ color: "var(--th-text-heading)" }}>
                          {entry.speaker_name}
                        </span>
                        {entry.department_name && <span className="qg-text-secondary">{entry.department_name}</span>}
                        {entry.role_label && <span className="qg-badge">{entry.role_label}</span>}
                      </div>
                      <div
                        className="text-[14px] leading-relaxed whitespace-pre-wrap break-words"
                        style={{ color: "var(--th-text-primary)" }}
                      >
                        {entry.content}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === "terminal" && shouldShowProgressHints && progressHints && (
        <div
          className="terminal-panel-strip border-t px-4 py-2"
          style={{ background: "var(--th-bg-surface)", borderColor: "var(--th-border)" }}
        >
          <div className="qg-text-secondary text-[13px]">
            {activeToolHint
              ? tr(
                  `도구 실행중.. ${activeToolHint.tool} 확인 중`,
                  `Tool running.. checking ${activeToolHint.tool}`,
                  `Outil en cours… vérification de ${activeToolHint.tool}`,
                  `ツール実行中.. ${activeToolHint.tool} を確認中`,
                  `工具运行中.. 正在检查 ${activeToolHint.tool}`,
                )
              : tr(
                  "도구 실행중.. 진행 상황 확인 중",
                  "Tool running.. checking progress",
                  "Outil en cours… vérification de l’avancement",
                  "ツール実行中.. 進捗確認中",
                  "工具运行中.. 正在检查进度",
                )}
          </div>
          {progressHints.current_file && (
            <div className="qg-text-muted mt-1 text-[13px] break-words">
              {tr(
                `파일: ${shortPath(progressHints.current_file)}`,
                `file: ${shortPath(progressHints.current_file)}`,
                `Fichier : ${shortPath(progressHints.current_file)}`,
                `ファイル: ${shortPath(progressHints.current_file)}`,
                `文件: ${shortPath(progressHints.current_file)}`,
              )}
            </div>
          )}
          <div className="mt-1 max-h-20 space-y-0.5 overflow-y-auto">
            {progressHints.hints.slice(-4).map((hint, idx) => (
              <div
                key={`${hint.tool}-${hint.phase}-${idx}`}
                className="text-[13px] break-words"
                style={{ color: hint.phase === "error" ? "var(--qg-pin)" : "var(--th-text-muted)" }}
              >
                {hintLineLabel(hint)}
              </div>
            ))}
          </div>
          {progressHints.ok_items.length > 0 && (
            <div
              className="mt-1 flex items-start gap-1.5 text-[13px] break-words"
              style={{ color: "var(--qg-accent)" }}
            >
              <Check {...iconProps} className="mt-0.5 flex-shrink-0" />
              <span>{progressHints.ok_items.map((item) => compactHintText(item, 44)).join(" · ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom status bar */}
      <div
        className="terminal-panel-footer qg-text-muted flex items-center justify-between border-t px-4 py-2 text-[13px]"
        style={{ background: "var(--th-bg-surface)", borderColor: "var(--th-border)" }}
      >
        <span className="truncate">
          {agent
            ? `${agentName}`
            : tr("담당 에이전트 없음", "No agent", "Aucun agent", "担当エージェントなし", "无负责人")}
          {agent?.cli_provider ? ` (${agent.cli_provider})` : ""}
        </span>
        <span>
          {task?.status === "in_progress" && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full motion-safe:animate-pulse"
                style={{ background: "var(--qg-accent)" }}
                aria-hidden
              />
              {activeTab === "terminal"
                ? tr("실시간", "Live", "En direct", "ライブ", "实时")
                : tr("회의록", "Minutes", "Compte rendu", "会議録", "会议纪要")}
            </span>
          )}
          {task?.status === "review" && tr("검토 중", "Under review", "En revue", "レビュー中", "审核中")}
          {task?.status === "done" && tr("완료됨", "Completed", "Terminée", "完了", "已完成")}
        </span>
      </div>
    </div>
  );
}
