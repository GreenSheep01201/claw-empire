import { useState, useCallback, useEffect } from "react";
import { GitBranch, GitMerge, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n";
import Dialog from "../ui/Dialog";
import {
  discardTask,
  getTaskDiff,
  getTaskVerifyCommit,
  mergeTask,
  type TaskDiffResult,
  type TaskVerifyCommitResult,
} from "../../api";

interface DiffModalProps {
  taskId: string;
  onClose: () => void;
}

function DiffModal({ taskId, onClose }: DiffModalProps) {
  const { t } = useI18n();
  const [diffData, setDiffData] = useState<TaskDiffResult | null>(null);
  const [verifyData, setVerifyData] = useState<TaskVerifyCommitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([getTaskDiff(taskId), getTaskVerifyCommit(taskId)]).then(([diffResult, verifyResult]) => {
      if (diffResult.status === "fulfilled") {
        const d = diffResult.value;
        if (!d.ok)
          setError(
            d.error ||
              t({
                ko: "알 수 없는 오류",
                en: "Unknown error",
                ja: "不明なエラー",
                zh: "未知错误",
                fr: "Erreur inconnue",
              }),
          );
        else setDiffData(d);
      } else {
        setError(diffResult.reason instanceof Error ? diffResult.reason.message : String(diffResult.reason));
      }

      if (verifyResult.status === "fulfilled") {
        const v = verifyResult.value;
        if (!v.ok)
          setVerifyError(
            v.error ||
              t({
                ko: "검증 실패",
                en: "Verification failed",
                ja: "検証失敗",
                zh: "校验失败",
                fr: "Échec de la vérification",
              }),
          );
        else setVerifyData(v);
      } else {
        setVerifyError(
          verifyResult.reason instanceof Error ? verifyResult.reason.message : String(verifyResult.reason),
        );
      }
      setLoading(false);
    });
  }, [taskId, t]);

  const handleMerge = useCallback(async () => {
    if (
      !confirm(
        t({
          ko: "이 브랜치를 메인에 병합하시겠습니까?",
          en: "Merge this branch into main?",
          ja: "このブランチを main にマージしますか？",
          zh: "要将此分支合并到 main 吗？",
          fr: "Fusionner cette branche dans main ?",
        }),
      )
    )
      return;
    setMerging(true);
    try {
      const result = await mergeTask(taskId);
      setActionResult(
        result.ok
          ? `${t({ ko: "병합 완료", en: "Merge completed", ja: "マージ完了", zh: "合并完成", fr: "Fusion terminée" })}: ${result.message}`
          : `${t({ ko: "병합 실패", en: "Merge failed", ja: "マージ失敗", zh: "合并失败", fr: "Échec de la fusion" })}: ${result.message}`,
      );
      if (result.ok) setTimeout(onClose, 1500);
    } catch (e: unknown) {
      setActionResult(
        `${t({ ko: "오류", en: "Error", ja: "エラー", zh: "错误", fr: "Erreur" })}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setMerging(false);
    }
  }, [taskId, onClose, t]);

  const handleDiscard = useCallback(async () => {
    if (
      !confirm(
        t({
          ko: "이 브랜치의 변경사항을 모두 폐기하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
          en: "Discard all changes in this branch? This action cannot be undone.",
          ja: "このブランチの変更をすべて破棄しますか？この操作は元に戻せません。",
          zh: "要丢弃此分支的所有更改吗？此操作无法撤销。",
          fr: "Abandonner toutes les modifications de cette branche ? Cette action est irréversible.",
        }),
      )
    )
      return;
    setDiscarding(true);
    try {
      const result = await discardTask(taskId);
      setActionResult(
        result.ok
          ? t({
              ko: "브랜치가 폐기되었습니다.",
              en: "Branch was discarded.",
              ja: "ブランチを破棄しました。",
              zh: "分支已丢弃。",
              fr: "La branche a été abandonnée.",
            })
          : `${t({ ko: "폐기 실패", en: "Discard failed", ja: "破棄失敗", zh: "丢弃失败", fr: "Échec de l’abandon" })}: ${result.message}`,
      );
      if (result.ok) setTimeout(onClose, 1500);
    } catch (e: unknown) {
      setActionResult(
        `${t({ ko: "오류", en: "Error", ja: "エラー", zh: "错误", fr: "Erreur" })}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setDiscarding(false);
    }
  }, [taskId, onClose, t]);

  const verifyBadgeClass = verifyData?.verdict === "ok" ? "qg-badge qg-badge--accent" : "qg-badge";

  const verifyVerdictLabel = (() => {
    switch (verifyData?.verdict) {
      case "ok":
        return t({ ko: "통과", en: "Passed", ja: "成功", zh: "通过", fr: "Validée" });
      case "dirty_without_commit":
        return t({
          ko: "미커밋 변경",
          en: "Uncommitted changes",
          ja: "未コミット変更",
          zh: "未提交变更",
          fr: "Modifications non validées",
        });
      case "commit_but_no_code":
        return t({
          ko: "코드 외 변경",
          en: "No code changes",
          ja: "コード変更なし",
          zh: "无代码变更",
          fr: "Aucune modification de code",
        });
      case "no_commit":
        return t({ ko: "커밋 없음", en: "No commit", ja: "コミットなし", zh: "无提交", fr: "Aucun commit" });
      case "no_worktree":
        return t({
          ko: "워크트리 없음",
          en: "No worktree",
          ja: "ワークツリーなし",
          zh: "无工作树",
          fr: "Aucun worktree",
        });
      default:
        return t({ ko: "확인 불가", en: "Unknown", ja: "不明", zh: "未知", fr: "Inconnu" });
    }
  })();

  const commitLabel =
    verifyData && typeof verifyData.commitCount === "number"
      ? t({
          ko: `${verifyData.commitCount}개 커밋`,
          en: `${verifyData.commitCount} commit${verifyData.commitCount === 1 ? "" : "s"}`,
          ja: `${verifyData.commitCount}件のコミット`,
          zh: `${verifyData.commitCount} 个提交`,
          fr: `${verifyData.commitCount} commit${verifyData.commitCount === 1 ? "" : "s"}`,
        })
      : null;

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({ ko: "Git 변경사항", en: "Git Diff", ja: "Git 差分", zh: "Git 差异", fr: "Diff Git" })}
      titleAdornment={
        diffData?.branchName && (
          <span className="qg-badge">
            <GitBranch size={14} aria-hidden />
            {diffData.branchName}
          </span>
        )
      }
      headerActions={
        <>
          <button
            type="button"
            onClick={handleMerge}
            disabled={merging || discarding || !diffData?.hasWorktree}
            className="qg-btn qg-btn--primary"
          >
            <GitMerge size={16} aria-hidden />
            {merging ? "..." : t({ ko: "병합", en: "Merge", ja: "マージ", zh: "合并", fr: "Fusionner" })}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={merging || discarding || !diffData?.hasWorktree}
            className="qg-btn qg-btn--danger"
          >
            <Trash2 size={16} aria-hidden />
            {discarding ? "..." : t({ ko: "폐기", en: "Discard", ja: "破棄", zh: "丢弃", fr: "Abandonner" })}
          </button>
        </>
      }
    >
      {/* Action result */}
      {actionResult && (
        <div className="qg-card mb-4 text-sm" role="status">
          {actionResult}
        </div>
      )}

      {/* Content */}
      <div>
        {loading ? (
          <div className="qg-empty">
            {t({
              ko: "변경사항 불러오는 중...",
              en: "Loading diff...",
              ja: "差分を読み込み中...",
              zh: "正在加载差异...",
              fr: "Chargement des modifications…",
            })}
          </div>
        ) : error ? (
          <div className="qg-empty" role="alert">
            <span className="qg-field__error">
              {t({ ko: "오류", en: "Error", ja: "エラー", zh: "错误", fr: "Erreur" })}: {error}
            </span>
          </div>
        ) : !diffData?.hasWorktree ? (
          <div className="qg-empty">
            {t({
              ko: "이 작업의 워크트리를 찾을 수 없습니다. (Git 프로젝트 아님 또는 이미 병합됨)",
              en: "No worktree found for this task (non-git project or already merged)",
              ja: "このタスクのワークツリーが見つかりません（Git プロジェクトではない、または既にマージ済み）",
              zh: "找不到该任务的 worktree（非 Git 项目或已合并）",
              fr: "Aucun worktree trouvé pour cette tâche (projet hors Git ou déjà fusionné)",
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {verifyData && (
              <div className="qg-card">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">
                    {t({
                      ko: "최종 브랜치 검증",
                      en: "Final Branch Verification",
                      ja: "最終ブランチ検証",
                      zh: "最终分支校验",
                      fr: "Vérification finale de la branche",
                    })}
                  </h3>
                  <span className={verifyBadgeClass}>{verifyVerdictLabel}</span>
                  {commitLabel && <span className="qg-text-secondary text-[13px]">{commitLabel}</span>}
                  {verifyData.compareRef && (
                    <span className="qg-text-secondary text-[13px]">
                      {t({ ko: "기준", en: "base", ja: "基準", zh: "基准", fr: "base" })}: {verifyData.compareRef}
                    </span>
                  )}
                </div>
                {verifyData.files && verifyData.files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {verifyData.files.slice(0, 6).map((filePath) => (
                      <span key={filePath} className="qg-badge font-mono">
                        {filePath}
                      </span>
                    ))}
                  </div>
                )}
                {verifyData.uncommittedFiles && verifyData.uncommittedFiles.length > 0 && (
                  <p className="qg-text-secondary mt-2 text-[13px]">
                    {t({
                      ko: `미커밋 변경 ${verifyData.uncommittedFiles.length}건`,
                      en: `${verifyData.uncommittedFiles.length} uncommitted file(s)`,
                      ja: `未コミット変更 ${verifyData.uncommittedFiles.length}件`,
                      zh: `${verifyData.uncommittedFiles.length} 个未提交文件`,
                      fr: `${verifyData.uncommittedFiles.length} fichier(s) non validé(s)`,
                    })}
                  </p>
                )}
              </div>
            )}
            {verifyError && (
              <div className="qg-card qg-text-secondary text-[13px]">
                {t({
                  ko: "브랜치 검증 정보를 불러오지 못했습니다",
                  en: "Branch verification could not be loaded",
                  ja: "ブランチ検証情報を取得できませんでした",
                  zh: "无法加载分支校验信息",
                  fr: "Impossible de charger la vérification de la branche",
                })}
                : {verifyError}
              </div>
            )}
            {/* Stat summary */}
            {diffData.stat && (
              <div>
                <h3 className="qg-text-secondary mb-1 text-sm font-semibold">
                  {t({ ko: "요약", en: "Summary", ja: "概要", zh: "摘要", fr: "Résumé" })}
                </h3>
                <pre className="qg-card qg-text-secondary overflow-x-auto font-mono text-[13px]">{diffData.stat}</pre>
              </div>
            )}
            {/* Full diff */}
            {diffData.diff && (
              <div>
                <h3 className="qg-text-secondary mb-1 text-sm font-semibold">
                  {t({ ko: "Diff", en: "Diff", ja: "差分", zh: "差异", fr: "Diff" })}
                </h3>
                <pre className="qg-card max-h-[50vh] overflow-auto font-mono text-[13px] leading-relaxed">
                  {diffData.diff.split("\n").map((line, i) => {
                    let cls = "qg-text-secondary";
                    if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-green-400";
                    else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400";
                    else if (line.startsWith("@@")) cls = "text-[var(--qg-accent)]";
                    else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "qg-text-muted font-bold";
                    return (
                      <span key={i} className={cls}>
                        {line}
                        {"\n"}
                      </span>
                    );
                  })}
                </pre>
              </div>
            )}
            {!diffData.stat && !diffData.diff && (
              <div className="qg-empty">
                {t({
                  ko: "변경사항이 없습니다",
                  en: "No changes detected",
                  ja: "変更はありません",
                  zh: "未检测到更改",
                  fr: "Aucune modification détectée",
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default DiffModal;
