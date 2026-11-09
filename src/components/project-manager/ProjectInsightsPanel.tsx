import type { ProjectDecisionEventItem, ProjectReportHistoryItem, ProjectTaskHistoryItem } from "../../api";
import type { Project } from "../../types";
import type { GroupedProjectTaskCard, ProjectI18nTranslate } from "./types";
import { fmtTime } from "./utils";

interface ProjectInsightsPanelProps {
  t: ProjectI18nTranslate;
  selectedProject: Project | null;
  loadingDetail: boolean;
  isCreating: boolean;
  groupedTaskCards: GroupedProjectTaskCard[];
  sortedReports: ProjectReportHistoryItem[];
  sortedDecisionEvents: ProjectDecisionEventItem[];
  getDecisionEventLabel: (eventType: ProjectDecisionEventItem["event_type"]) => string;
  handleOpenTaskDetail: (taskId: string) => Promise<void>;
}

export default function ProjectInsightsPanel({
  t,
  selectedProject,
  loadingDetail,
  isCreating,
  groupedTaskCards,
  sortedReports,
  sortedDecisionEvents,
  getDecisionEventLabel,
  handleOpenTaskDetail,
}: ProjectInsightsPanelProps) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 qg-card">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            {t({
              ko: "프로젝트 정보",
              en: "Project Info",
              ja: "プロジェクト情報",
              zh: "项目信息",
              fr: "Informations du projet",
            })}
          </h4>
          {selectedProject?.github_repo && (
            <a
              href={`https://github.com/${selectedProject.github_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              title={selectedProject.github_repo}
              className="qg-btn qg-btn--sm qg-btn--ghost"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {selectedProject.github_repo}
            </a>
          )}
        </div>
        {loadingDetail ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
          </p>
        ) : isCreating ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({
              ko: "신규 프로젝트를 입력 중입니다",
              en: "Creating a new project",
              ja: "新規プロジェクトを入力中です",
              zh: "正在输入新项目",
              fr: "Création d’un nouveau projet",
            })}
          </p>
        ) : !selectedProject ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({
              ko: "프로젝트를 선택하세요",
              en: "Select a project",
              ja: "プロジェクトを選択",
              zh: "请选择项目",
              fr: "Choisir un projet",
            })}
          </p>
        ) : (
          <div className="mt-2 space-y-2 text-[13px]">
            <p>
              <span className="qg-text-muted">ID :</span> {selectedProject.id}
            </p>
            <p className="break-all">
              <span className="qg-text-muted">
                {t({ ko: "경로", en: "Path", ja: "パス", zh: "路径", fr: "Chemin" })} :
              </span>{" "}
              {selectedProject.project_path}
            </p>
            <p className="break-all">
              <span className="qg-text-muted">
                {t({ ko: "목표", en: "Goal", ja: "目標", zh: "目标", fr: "Objectif" })} :
              </span>{" "}
              {selectedProject.core_goal}
            </p>
          </div>
        )}
      </div>

      <div className="min-w-0 qg-card">
        <h4 className="text-sm font-semibold">
          {t({ ko: "작업 이력", en: "Task History", ja: "作業履歴", zh: "任务历史", fr: "Historique des tâches" })}
        </h4>
        {!selectedProject ? (
          <p className="mt-2 text-[13px] qg-text-muted">-</p>
        ) : groupedTaskCards.length === 0 ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({
              ko: "연결된 작업이 없습니다",
              en: "No mapped tasks",
              ja: "紐づくタスクなし",
              zh: "没有映射任务",
              fr: "Aucune tâche liée",
            })}
          </p>
        ) : (
          <div className="mt-2 max-h-56 overflow-x-hidden overflow-y-auto space-y-2 pr-1">
            {groupedTaskCards.map((group) => (
              <button
                key={group.root.id}
                type="button"
                onClick={() => void handleOpenTaskDetail(group.root.id)}
                className="qg-card block w-full min-w-0 overflow-hidden !py-2 text-left transition hover:border-[var(--qg-accent)]"
              >
                <p className="whitespace-pre-wrap break-all text-[13px] font-semibold">{group.root.title}</p>
                <p className="mt-1 break-all text-xs qg-text-muted">
                  {group.root.status} · {group.root.task_type} · {fmtTime(group.root.created_at)}
                </p>
                <p className="mt-1 break-all text-xs qg-text-muted">
                  {t({ ko: "담당", en: "Owner", ja: "担当", zh: "负责人", fr: "Responsable" })}:{" "}
                  {group.root.assigned_agent_name_ko || group.root.assigned_agent_name || "-"}
                </p>
                <p className="qg-text-secondary mt-1 text-xs">
                  {t({ ko: "하위 작업", en: "Sub tasks", ja: "サブタスク", zh: "子任务", fr: "Sous-tâches" })}:{" "}
                  {group.children.length}
                </p>
                {group.children.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {group.children.slice(0, 3).map((child: ProjectTaskHistoryItem) => (
                      <p key={child.id} className="whitespace-pre-wrap break-all text-xs qg-text-muted">
                        - {child.title}
                      </p>
                    ))}
                    {group.children.length > 3 && <p className="text-xs qg-text-muted">+{group.children.length - 3}</p>}
                  </div>
                )}
                <p className="qg-text-muted mt-2 text-right text-xs">
                  {t({
                    ko: "카드 클릭으로 상세 보기",
                    en: "Click card for details",
                    ja: "クリックで詳細表示",
                    zh: "点击卡片查看详情",
                    fr: "Cliquer sur une carte pour le détail",
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 qg-card">
        <h4 className="text-sm font-semibold">
          {t({
            ko: "보고서 이력(프로젝트 매핑)",
            en: "Mapped Reports",
            ja: "紐づくレポート",
            zh: "映射报告",
            fr: "Rapports liés",
          })}
        </h4>
        {!selectedProject ? (
          <p className="mt-2 text-[13px] qg-text-muted">-</p>
        ) : sortedReports.length === 0 ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({
              ko: "연결된 보고서가 없습니다",
              en: "No mapped reports",
              ja: "紐づくレポートなし",
              zh: "没有映射报告",
              fr: "Aucun rapport lié",
            })}
          </p>
        ) : (
          <div className="mt-2 max-h-56 overflow-x-hidden overflow-y-auto space-y-2 pr-1">
            {sortedReports.map((row) => (
              <div key={row.id} className="flex min-w-0 items-center justify-between gap-2 qg-card !py-2">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-all text-[13px] font-medium">{row.title}</p>
                  <p className="text-xs qg-text-muted">{fmtTime(row.completed_at || row.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpenTaskDetail(row.id)}
                  className="qg-btn qg-btn--sm shrink-0"
                >
                  {t({ ko: "열람", en: "Open", ja: "表示", zh: "查看", fr: "Ouvrir" })}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 qg-card">
        <h4 className="text-sm font-semibold">
          {t({
            ko: "대표 선택사항",
            en: "Representative Decisions",
            ja: "代表選択事項",
            zh: "代表选择事项",
            fr: "Validations",
          })}
        </h4>
        {!selectedProject ? (
          <p className="mt-2 text-[13px] qg-text-muted">-</p>
        ) : sortedDecisionEvents.length === 0 ? (
          <p className="mt-2 text-[13px] qg-text-muted">
            {t({
              ko: "기록된 대표 의사결정이 없습니다",
              en: "No representative decision records",
              ja: "代表意思決定の記録はありません",
              zh: "暂无代表决策记录",
              fr: "Aucune validation enregistrée",
            })}
          </p>
        ) : (
          <div className="mt-2 max-h-56 overflow-x-hidden overflow-y-auto space-y-2 pr-1">
            {sortedDecisionEvents.map((event) => {
              let selectedLabels: string[] = [];
              if (event.selected_options_json) {
                try {
                  const parsed = JSON.parse(event.selected_options_json) as Array<{ label?: unknown }>;
                  selectedLabels = Array.isArray(parsed)
                    ? parsed
                        .map((row) => (typeof row?.label === "string" ? row.label.trim() : ""))
                        .filter((label) => label.length > 0)
                    : [];
                } catch {
                  selectedLabels = [];
                }
              }

              return (
                <div key={`${event.id}-${event.created_at}`} className="qg-card !py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-semibold">
                      {getDecisionEventLabel(event.event_type)}
                    </p>
                    <p className="text-xs qg-text-muted">{fmtTime(event.created_at)}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-all text-[13px] qg-text-secondary">{event.summary}</p>
                  {selectedLabels.length > 0 && (
                    <p className="mt-1 whitespace-pre-wrap break-all text-xs qg-text-secondary">
                      {t({
                        ko: "선택 내용",
                        en: "Selected Items",
                        ja: "選択内容",
                        zh: "已选内容",
                        fr: "Éléments retenus",
                      })}
                      : {selectedLabels.join(" / ")}
                    </p>
                  )}
                  {event.note && event.note.trim().length > 0 && (
                    <p className="mt-1 whitespace-pre-wrap break-all text-xs qg-text-secondary">
                      {t({
                        ko: "추가 요청사항",
                        en: "Additional Request",
                        ja: "追加要請事項",
                        zh: "追加请求事项",
                        fr: "Demande complémentaire",
                      })}
                      : {event.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
