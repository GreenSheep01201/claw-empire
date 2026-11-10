import { useEffect, useMemo, useState } from "react";
import { Bot, Briefcase, ClipboardList, MessageSquare, RefreshCw, Timer } from "lucide-react";
import { pickLang, type LangText } from "../i18n";
import Dialog from "./ui/Dialog";
import type { Agent } from "../types";
import AgentAvatar, { buildSpriteMap } from "./AgentAvatar";
import MessageContent from "./MessageContent";
import type { DecisionInboxItem } from "./chat/decision-inbox";
import { formatDecisionInboxTime as formatTime, type DecisionInboxModalProps } from "./chat/decision-inbox-modal.meta";

export default function DecisionInboxModal({
  open,
  loading,
  items,
  agents,
  busyKey,
  uiLanguage,
  onClose,
  onRefresh,
  onReplyOption,
  onOpenChat,
}: DecisionInboxModalProps) {
  const t = (text: LangText) => pickLang(uiLanguage, text);
  const isKorean = uiLanguage.startsWith("ko");
  const spriteMap = useMemo(() => buildSpriteMap(agents), [agents]);
  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents) map.set(agent.id, agent);
    return map;
  }, [agents]);
  const [followupTarget, setFollowupTarget] = useState<{
    itemId: string;
    optionNumber: number;
  } | null>(null);
  const [followupDraft, setFollowupDraft] = useState("");
  const [reviewPickSelections, setReviewPickSelections] = useState<Record<string, number[]>>({});
  const [reviewPickDrafts, setReviewPickDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setFollowupTarget(null);
      setFollowupDraft("");
      setReviewPickSelections({});
      setReviewPickDrafts({});
      return;
    }
    if (!followupTarget) return;
    const stillExists = items.some((entry) => entry.id === followupTarget.itemId);
    if (!stillExists) {
      setFollowupTarget(null);
      setFollowupDraft("");
    }
  }, [open, followupTarget, items]);

  useEffect(() => {
    setReviewPickSelections((prev) => {
      const keep = new Set(items.map((item) => item.id));
      const next: Record<string, number[]> = {};
      let changed = false;
      for (const [itemId, nums] of Object.entries(prev)) {
        if (!keep.has(itemId)) {
          changed = true;
          continue;
        }
        next[itemId] = nums;
      }
      return changed ? next : prev;
    });
    setReviewPickDrafts((prev) => {
      const keep = new Set(items.map((item) => item.id));
      const next: Record<string, string> = {};
      let changed = false;
      for (const [itemId, draft] of Object.entries(prev)) {
        if (!keep.has(itemId)) {
          changed = true;
          continue;
        }
        next[itemId] = draft;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const followupItem = useMemo(
    () => (followupTarget ? (items.find((entry) => entry.id === followupTarget.itemId) ?? null) : null),
    [followupTarget, items],
  );
  const followupBusyKey = followupTarget ? `${followupTarget.itemId}:${followupTarget.optionNumber}` : null;
  const isFollowupSubmitting = followupBusyKey ? busyKey === followupBusyKey : false;
  const canSubmitFollowup = !!(followupItem && followupDraft.trim() && !isFollowupSubmitting);

  function handleOptionClick(item: DecisionInboxItem, optionNumber: number, action?: string) {
    if (action === "add_followup_request") {
      setFollowupTarget({ itemId: item.id, optionNumber });
      setFollowupDraft("");
      return;
    }
    onReplyOption(item, optionNumber);
  }

  function handleSubmitFollowup() {
    if (!followupItem || !followupTarget) return;
    const note = followupDraft.trim();
    if (!note) return;
    onReplyOption(followupItem, followupTarget.optionNumber, { note });
    setFollowupTarget(null);
    setFollowupDraft("");
  }

  function handleCancelFollowup() {
    setFollowupTarget(null);
    setFollowupDraft("");
  }

  function getReviewPickOptions(item: DecisionInboxItem) {
    return item.options.filter((option) => option.action === "apply_review_pick");
  }

  function getReviewSkipOption(item: DecisionInboxItem) {
    return item.options.find((option) => option.action === "skip_to_next_round");
  }

  function toggleReviewPick(itemId: string, optionNumber: number) {
    setReviewPickSelections((prev) => {
      const current = prev[itemId] ?? [];
      const exists = current.includes(optionNumber);
      const nextList = exists
        ? current.filter((num) => num !== optionNumber)
        : [...current, optionNumber].sort((a, b) => a - b);
      return {
        ...prev,
        [itemId]: nextList,
      };
    });
  }

  function setReviewDraft(itemId: string, value: string) {
    setReviewPickDrafts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  }

  function clearReviewInput(itemId: string) {
    setReviewPickSelections((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setReviewPickDrafts((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function handleSubmitReviewPick(item: DecisionInboxItem) {
    const pickOptions = getReviewPickOptions(item);
    const selected = reviewPickSelections[item.id] ?? [];
    const extraNote = (reviewPickDrafts[item.id] ?? "").trim();
    const optionNumber = selected[0] ?? pickOptions[0]?.number;
    if (!optionNumber) return;
    if (selected.length <= 0 && !extraNote) {
      window.alert(
        t({
          ko: "최소 1개 선택하거나 추가 의견을 입력해 주세요.",
          en: "Pick at least one option or enter an extra note.",
          ja: "少なくとも1件を選択するか、追加意見を入力してください。",
          zh: "请至少选择一项或输入补充意见。",
          fr: "Choisir au moins une option ou ajouter une remarque.",
        }),
      );
      return;
    }
    onReplyOption(item, optionNumber, {
      selected_option_numbers: selected,
      ...(extraNote ? { note: extraNote } : {}),
    });
    clearReviewInput(item.id);
  }

  function handleSkipReviewRound(item: DecisionInboxItem) {
    const skipOption = getReviewSkipOption(item);
    if (!skipOption) return;
    clearReviewInput(item.id);
    onReplyOption(item, skipOption.number);
  }

  const getKindLabel = (kind: DecisionInboxItem["kind"]) => {
    if (kind === "project_review_ready") {
      return t({
        ko: "프로젝트 의사결정",
        en: "Project Decision",
        ja: "プロジェクト判断",
        zh: "项目决策",
        fr: "Validation de projet",
      });
    }
    if (kind === "task_timeout_resume") {
      return t({
        ko: "중단 작업 재개",
        en: "Timeout Resume",
        ja: "中断タスク再開",
        zh: "超时任务续跑",
        fr: "Reprise après interruption",
      });
    }
    if (kind === "review_round_pick") {
      return t({
        ko: "리뷰 라운드 의사결정",
        en: "Review Round Decision",
        ja: "レビューラウンド判断",
        zh: "评审轮次决策",
        fr: "Validation de relecture",
      });
    }
    return t({
      ko: "에이전트 요청",
      en: "Agent Request",
      ja: "エージェント要請",
      zh: "代理请求",
      fr: "Demande d’agent",
    });
  };
  const getKindAvatarFallback = (kind: DecisionInboxItem["kind"]) => {
    if (kind === "project_review_ready") return <Briefcase size={16} aria-hidden />;
    if (kind === "task_timeout_resume") return <Timer size={16} aria-hidden />;
    if (kind === "review_round_pick") return <ClipboardList size={16} aria-hidden />;
    return <Bot size={16} aria-hidden />;
  };

  const sendingLabel = t({ ko: "전송 중...", en: "Sending...", ja: "送信中...", zh: "发送中...", fr: "Envoi…" });
  const consolidatingLabel = t({
    ko: "기획팀장 의견 취합중...",
    en: "Planning lead is consolidating opinions...",
    ja: "企画リードが意見を集約中...",
    zh: "规划负责人正在汇总意见...",
    fr: "Le responsable Planification rassemble les avis…",
  });

  return (
    <Dialog
      open={open}
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({ ko: "미결 의사결정", en: "To approve", ja: "未決の意思決定", zh: "待处理决策", fr: "À valider" })}
      titleAdornment={<span className={`qg-count${items.length > 0 ? " is-pin" : ""}`}>{items.length}</span>}
      headerActions={
        <button type="button" onClick={onRefresh} className="qg-btn">
          <RefreshCw size={16} aria-hidden />
          <span className="qg-btn__label">
            {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
          </span>
        </button>
      }
    >
      <div>
        {loading ? (
          <div className="qg-empty">
            {t({
              ko: "미결 목록 불러오는 중...",
              en: "Loading pending decisions...",
              ja: "未決一覧を読み込み中...",
              zh: "正在加载待处理决策...",
              fr: "Chargement des validations en attente…",
            })}
          </div>
        ) : items.length === 0 ? (
          <div className="qg-empty">
            {t({
              ko: "현재 미결 의사결정이 없습니다.",
              en: "No pending decisions right now.",
              ja: "現在、未決の意思決定はありません。",
              zh: "当前没有待处理决策。",
              fr: "Aucune validation en attente.",
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="qg-card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  {(() => {
                    const agent = item.agentId ? agentById.get(item.agentId) : undefined;
                    return (
                      <div className="flex min-w-0 items-start gap-2">
                        {agent ? (
                          <AgentAvatar agent={agent} spriteMap={spriteMap} size={32} className="mt-0.5" />
                        ) : (
                          <span className="qg-text-secondary mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--th-border)] text-base">
                            {item.agentAvatar || getKindAvatarFallback(item.kind)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {isKorean ? item.agentNameKo : item.agentName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="qg-badge qg-badge--pin">{getKindLabel(item.kind)}</span>
                            <span className="qg-text-muted text-xs">{formatTime(item.createdAt, uiLanguage)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {item.agentId ? (
                    <button
                      type="button"
                      onClick={() => onOpenChat(item.agentId!)}
                      className="qg-btn qg-btn--sm qg-btn--ghost"
                    >
                      <MessageSquare size={16} aria-hidden />
                      {t({
                        ko: "채팅 열기",
                        en: "Open Chat",
                        ja: "チャットを開く",
                        zh: "打开聊天",
                        fr: "Ouvrir la discussion",
                      })}
                    </button>
                  ) : null}
                </div>

                <div className="qg-text-secondary text-sm">
                  <MessageContent content={item.requestContent} />
                </div>

                <div className="mt-3 space-y-2">
                  {item.kind === "review_round_pick" ? (
                    (() => {
                      if (item.options.length === 0) {
                        return <p className="qg-text-muted text-sm">{consolidatingLabel}</p>;
                      }
                      const pickOptions = getReviewPickOptions(item);
                      const skipOption = getReviewSkipOption(item);
                      const selected = reviewPickSelections[item.id] ?? [];
                      const selectedCount = selected.length;
                      const draft = reviewPickDrafts[item.id] ?? "";
                      const isItemBusy = Boolean(busyKey?.startsWith(`${item.id}:`));
                      return (
                        <div className="space-y-2">
                          {pickOptions.map((option) => {
                            const selectedFlag = selected.includes(option.number);
                            return (
                              <button
                                key={`${item.id}:${option.number}`}
                                type="button"
                                onClick={() => toggleReviewPick(item.id, option.number)}
                                disabled={isItemBusy}
                                aria-pressed={selectedFlag}
                                className="qg-choice"
                              >
                                {`${option.number}. ${option.label}`}
                              </button>
                            );
                          })}
                          <p className="qg-text-muted text-xs">
                            {t({
                              ko: `선택 항목: ${selectedCount}건`,
                              en: `Selected: ${selectedCount} item(s)`,
                              ja: `選択項目: ${selectedCount}件`,
                              zh: `已选项: ${selectedCount} 项`,
                              fr: `Sélection : ${selectedCount} élément(s)`,
                            })}
                          </p>
                          <textarea
                            value={draft}
                            onChange={(event) => setReviewDraft(item.id, event.target.value)}
                            rows={2}
                            placeholder={t({
                              ko: "추가 의견이 있으면 입력해 주세요. (선택)",
                              en: "Enter extra notes if needed. (Optional)",
                              ja: "追加意見があれば入力してください。（任意）",
                              zh: "如有补充意见请填写。（可选）",
                              fr: "Ajouter une remarque si besoin (facultatif)",
                            })}
                            className="qg-textarea"
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {skipOption ? (
                              <button
                                type="button"
                                onClick={() => handleSkipReviewRound(item)}
                                disabled={isItemBusy}
                                className="qg-btn qg-btn--sm"
                              >
                                {isItemBusy ? sendingLabel : `${skipOption.number}. ${skipOption.label}`}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleSubmitReviewPick(item)}
                              disabled={isItemBusy}
                              className="qg-btn qg-btn--sm qg-btn--primary"
                            >
                              {isItemBusy
                                ? sendingLabel
                                : t({
                                    ko: "선택 항목 진행",
                                    en: "Run Selected",
                                    ja: "選択項目で進行",
                                    zh: "按所选项执行",
                                    fr: "Valider la sélection",
                                  })}
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : item.options.length > 0 ? (
                    item.options.map((option) => {
                      const key = `${item.id}:${option.number}`;
                      const isBusy = busyKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleOptionClick(item, option.number, option.action)}
                          disabled={isBusy}
                          className="qg-choice"
                        >
                          {isBusy ? sendingLabel : `${option.number}. ${option.label}`}
                        </button>
                      );
                    })
                  ) : (
                    <p className="qg-text-muted text-sm">
                      {item.kind === "project_review_ready"
                        ? consolidatingLabel
                        : t({
                            ko: "선택지 준비 중...",
                            en: "Options are being prepared...",
                            ja: "選択肢を準備中...",
                            zh: "正在准备选项...",
                            fr: "Préparation des choix…",
                          })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {followupItem ? (
        <div className="qg-field mt-4 border-t border-[var(--th-border)] pt-4">
          <label htmlFor="decision-followup-draft" className="qg-field__label">
            {t({
              ko: "추가요청사항 입력",
              en: "Additional Follow-up Request",
              ja: "追加要請内容の入力",
              zh: "输入追加请求事项",
              fr: "Demande complémentaire",
            })}
          </label>
          <textarea
            id="decision-followup-draft"
            value={followupDraft}
            onChange={(event) => setFollowupDraft(event.target.value)}
            placeholder={t({
              ko: "요청사항을 입력해 주세요.",
              en: "Enter your request details.",
              ja: "要請内容を入力してください。",
              zh: "请输入请求详情。",
              fr: "Décrire la demande.",
            })}
            rows={3}
            className="qg-textarea"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelFollowup}
              disabled={isFollowupSubmitting}
              className="qg-btn qg-btn--sm qg-btn--ghost"
            >
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
            </button>
            <button
              type="button"
              onClick={handleSubmitFollowup}
              disabled={!canSubmitFollowup}
              className="qg-btn qg-btn--sm qg-btn--primary"
            >
              {isFollowupSubmitting
                ? sendingLabel
                : t({
                    ko: "요청 등록",
                    en: "Submit Request",
                    ja: "要請登録",
                    zh: "提交请求",
                    fr: "Envoyer la demande",
                  })}
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
