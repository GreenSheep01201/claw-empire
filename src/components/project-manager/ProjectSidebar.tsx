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
    <aside className="flex w-full flex-col border-r border-slate-700 bg-slate-900/70 md:w-[330px]">
      <div className="border-b border-slate-700 px-4 py-3">
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
          })}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              void loadProjects(1, search);
            }}
            className="rounded-md bg-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            {t({ ko: "조회", en: "Search", ja: "検索", zh: "查询" })}
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-blue-700 px-2.5 py-1 text-xs text-white hover:bg-blue-600"
          >
            {t({ ko: "신규", en: "New", ja: "新規", zh: "新建" })}
          </button>
          <button
            type="button"
            onClick={onOpenGitHubImport}
            className="rounded-md bg-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            {t({ ko: "GitHub 가져오기", en: "GitHub Import", ja: "GitHub インポート", zh: "GitHub 导入" })}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="px-4 py-6 text-xs text-slate-400">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
          </div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-6 text-xs text-slate-500">
            {t({ ko: "등록된 프로젝트가 없습니다", en: "No projects", ja: "プロジェクトなし", zh: "暂无项目" })}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={`w-full px-4 py-3 text-left transition ${
                  selectedProjectId === project.id ? "bg-blue-900/30" : "hover:bg-slate-800/70"
                }`}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                  {project.name}
                  {project.github_repo && (
                    <svg
                      className="inline-block h-3.5 w-3.5 shrink-0 text-slate-400"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                  )}
                </p>
                <p className="truncate text-[11px] text-slate-400">{project.project_path}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{project.core_goal}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => void loadProjects(page - 1, search)}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
        >
          {t({ ko: "이전", en: "Prev", ja: "前へ", zh: "上一页" })}
        </button>
        <span className="text-xs text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => void loadProjects(page + 1, search)}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
        >
          {t({ ko: "다음", en: "Next", ja: "次へ", zh: "下一页" })}
        </button>
      </div>
    </aside>
  );
}
