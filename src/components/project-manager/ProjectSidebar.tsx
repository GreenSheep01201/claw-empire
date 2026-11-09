import { Plus, Search } from "lucide-react";
import type { Project } from "../../types";
import type { ProjectI18nTranslate } from "./types";

interface ProjectSidebarProps {
  t: ProjectI18nTranslate;
  search: string;
  setSearch: (value: string) => void;
  loadProjects: (targetPage: number, keyword: string) => Promise<void>;
  startCreate: () => void;
  onOpenGitHubImport: () => void;
  loadingList: boolean;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  page: number;
  totalPages: number;
}

export default function ProjectSidebar({
  t,
  search,
  setSearch,
  loadProjects,
  startCreate,
  onOpenGitHubImport,
  loadingList,
  projects,
  selectedProjectId,
  onSelectProject,
  page,
  totalPages,
}: ProjectSidebarProps) {
  return (
    <aside className="flex w-full flex-col border-r border-[var(--th-border)] md:w-[330px]">
      <div className="border-b border-[var(--th-border)] px-4 py-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void loadProjects(1, search);
            }
          }}
          placeholder={t({
            ko: "프로젝트 검색",
            en: "Search projects",
            ja: "プロジェクト検索",
            zh: "搜索项目",
            fr: "Rechercher un projet",
          })}
          aria-label={t({
            ko: "프로젝트 검색",
            en: "Search projects",
            ja: "プロジェクト検索",
            zh: "搜索项目",
            fr: "Rechercher un projet",
          })}
          className="qg-input"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void loadProjects(1, search);
            }}
            className="qg-btn qg-btn--sm"
          >
            <Search size={16} aria-hidden />
            {t({ ko: "조회", en: "Search", ja: "検索", zh: "查询", fr: "Rechercher" })}
          </button>
          <button type="button" onClick={startCreate} className="qg-btn qg-btn--sm qg-btn--primary">
            <Plus size={16} aria-hidden />
            {t({ ko: "신규", en: "New", ja: "新規", zh: "新建", fr: "Nouveau" })}
          </button>
          <button type="button" onClick={onOpenGitHubImport} className="qg-btn qg-btn--sm qg-btn--ghost">
            {t({
              ko: "GitHub 가져오기",
              en: "GitHub Import",
              ja: "GitHub インポート",
              zh: "GitHub 导入",
              fr: "Importer depuis GitHub",
            })}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="qg-empty">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
          </div>
        ) : projects.length === 0 ? (
          <div className="qg-empty">
            {t({
              ko: "등록된 프로젝트가 없습니다",
              en: "No projects",
              ja: "プロジェクトなし",
              zh: "暂无项目",
              fr: "Aucun projet",
            })}
          </div>
        ) : (
          <div className="divide-y divide-[var(--th-border)]">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                aria-current={selectedProjectId === project.id ? "true" : undefined}
                className={`w-full px-4 py-3 text-left transition ${
                  selectedProjectId === project.id
                    ? "bg-[var(--qg-accent-soft)]"
                    : "hover:bg-[var(--th-bg-surface-hover)]"
                }`}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {project.name}
                  {project.github_repo && (
                    <svg
                      className="qg-text-muted inline-block h-3.5 w-3.5 shrink-0"
                      aria-hidden
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                  )}
                </p>
                <p className="qg-text-muted truncate text-xs">{project.project_path}</p>
                <p className="qg-text-secondary mt-1 truncate text-[13px]">{project.core_goal}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--th-border)] px-4 py-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => void loadProjects(page - 1, search)}
          className="qg-btn qg-btn--sm qg-btn--ghost"
        >
          {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页", fr: "Précédent" })}
        </button>
        <span className="qg-text-muted text-[13px]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => void loadProjects(page + 1, search)}
          className="qg-btn qg-btn--sm qg-btn--ghost"
        >
          {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页", fr: "Suivant" })}
        </button>
      </div>
    </aside>
  );
}
