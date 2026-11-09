import type { LangText } from "../../../i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  browseProjectPath,
  getProjectPathSuggestions,
  getProjects,
  isApiRequestError,
  pickProjectPathNative,
} from "../../../api";
import type { Project } from "../../../types";
import type { FormFeedback, Locale, ManualPathEntry, MissingPathPrompt } from "../constants";

type ResolvePathHelperErrorMessage = (error: unknown, fallback: LangText) => string;

interface UseProjectPickerStateParams {
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: ResolvePathHelperErrorMessage;
  setFormFeedback: (feedback: FormFeedback | null) => void;
  setSubmitWithoutProjectPromptOpen: (open: boolean) => void;
}

export function useProjectPickerState({
  unsupportedPathApiMessage,
  resolvePathHelperErrorMessage,
  setFormFeedback,
  setSubmitWithoutProjectPromptOpen,
}: UseProjectPickerStateParams) {
  const [projectId, setProjectId] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectActiveIndex, setProjectActiveIndex] = useState(-1);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [createNewProjectMode, setCreateNewProjectMode] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [pathSuggestionsOpen, setPathSuggestionsOpen] = useState(false);
  const [pathSuggestionsLoading, setPathSuggestionsLoading] = useState(false);
  const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
  const [missingPathPrompt, setMissingPathPrompt] = useState<MissingPathPrompt | null>(null);
  const [manualPathPickerOpen, setManualPathPickerOpen] = useState(false);
  const [nativePathPicking, setNativePathPicking] = useState(false);
  const [manualPathLoading, setManualPathLoading] = useState(false);
  const [manualPathCurrent, setManualPathCurrent] = useState("");
  const [manualPathParent, setManualPathParent] = useState<string | null>(null);
  const [manualPathEntries, setManualPathEntries] = useState<ManualPathEntry[]>([]);
  const [manualPathTruncated, setManualPathTruncated] = useState(false);
  const [manualPathError, setManualPathError] = useState<string | null>(null);
  const [pathApiUnsupported, setPathApiUnsupported] = useState(false);
  const [nativePickerUnsupported, setNativePickerUnsupported] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    getProjects({ page: 1, page_size: 50 })
      .then((res) => {
        if (cancelled) return;
        setProjects(res.projects);
      })
      .catch((err) => {
        console.error("Failed to load projects for task creation:", err);
        if (cancelled) return;
        setProjects([]);
      })
      .finally(() => {
        if (cancelled) return;
        setProjectsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = projectId ? projects.find((project) => project.id === projectId) : undefined;
    if (!selected) return;
    setProjectQuery(selected.name);
  }, [projectId, projects]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!projectPickerRef.current) return;
      if (!projectPickerRef.current.contains(event.target as Node)) {
        setProjectDropdownOpen(false);
        setProjectActiveIndex(-1);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedProject = useMemo(
    () => (projectId ? (projects.find((project) => project.id === projectId) ?? null) : null),
    [projectId, projects],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = projectQuery.trim().toLowerCase();
    if (!normalizedQuery) return projects.slice(0, 30);
    return projects
      .filter((project) => {
        const name = project.name.toLowerCase();
        const path = project.project_path.toLowerCase();
        const goal = project.core_goal.toLowerCase();
        return name.includes(normalizedQuery) || path.includes(normalizedQuery) || goal.includes(normalizedQuery);
      })
      .slice(0, 30);
  }, [projects, projectQuery]);

  useEffect(() => {
    if (!projectDropdownOpen) {
      setProjectActiveIndex(-1);
      return;
    }
    if (filteredProjects.length === 0) {
      setProjectActiveIndex(-1);
      return;
    }
    const selectedIndex = selectedProject
      ? filteredProjects.findIndex((project) => project.id === selectedProject.id)
      : -1;
    setProjectActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [projectDropdownOpen, filteredProjects, selectedProject]);

  useEffect(() => {
    if (!createNewProjectMode) {
      setPathSuggestionsOpen(false);
      setPathSuggestions([]);
      setMissingPathPrompt(null);
      setManualPathPickerOpen(false);
      setNativePickerUnsupported(false);
      setSubmitWithoutProjectPromptOpen(false);
    }
  }, [createNewProjectMode, setSubmitWithoutProjectPromptOpen]);

  useEffect(() => {
    if (!createNewProjectMode || !pathSuggestionsOpen || pathApiUnsupported) return;
    let cancelled = false;
    setPathSuggestionsLoading(true);
    getProjectPathSuggestions(newProjectPath.trim(), 30)
      .then((paths) => {
        if (cancelled) return;
        setPathSuggestions(paths);
      })
      .catch((err) => {
        console.error("Failed to load project path suggestions:", err);
        if (cancelled) return;
        if (isApiRequestError(err) && err.status === 404) {
          setPathApiUnsupported(true);
          setPathSuggestionsOpen(false);
          setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
          return;
        }
        setPathSuggestions([]);
        setFormFeedback({
          tone: "error",
          message: resolvePathHelperErrorMessage(err, {
            ko: "경로 후보를 불러오지 못했습니다.",
            en: "Failed to load path suggestions.",
            ja: "パス候補を読み込めませんでした。",
            zh: "无法加载路径候选。",
          }),
        });
      })
      .finally(() => {
        if (cancelled) return;
        setPathSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    createNewProjectMode,
    pathSuggestionsOpen,
    newProjectPath,
    pathApiUnsupported,
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    setFormFeedback,
  ]);

  const loadManualPathEntries = useCallback(
    async (targetPath?: string) => {
      if (pathApiUnsupported) {
        setManualPathError(unsupportedPathApiMessage);
        return;
      }
      setManualPathLoading(true);
      setManualPathError(null);
      try {
        const result = await browseProjectPath(targetPath);
        setManualPathCurrent(result.current_path);
        setManualPathParent(result.parent_path);
        setManualPathEntries(result.entries);
        setManualPathTruncated(result.truncated);
      } catch (err) {
        console.error("Failed to browse project path:", err);
        if (isApiRequestError(err) && err.status === 404) {
          setPathApiUnsupported(true);
          setManualPathPickerOpen(false);
          setManualPathError(unsupportedPathApiMessage);
          setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
        } else {
          setManualPathError(
            resolvePathHelperErrorMessage(err, {
              ko: "경로 목록을 불러오지 못했습니다.",
              en: "Failed to load directories.",
              ja: "ディレクトリ一覧を読み込めませんでした。",
              zh: "无法加载目录列表。",
            }),
          );
        }
        setManualPathEntries([]);
        setManualPathTruncated(false);
      } finally {
        setManualPathLoading(false);
      }
    },
    [pathApiUnsupported, unsupportedPathApiMessage, resolvePathHelperErrorMessage, setFormFeedback],
  );

  const selectProject = useCallback(
    (project: Project | null) => {
      setFormFeedback(null);
      setSubmitWithoutProjectPromptOpen(false);
      if (!project) {
        setProjectId("");
        setProjectQuery("");
        setProjectDropdownOpen(false);
        setProjectActiveIndex(-1);
        setCreateNewProjectMode(false);
        setNewProjectPath("");
        return;
      }
      setProjectId(project.id);
      setProjectQuery(project.name);
      setProjectDropdownOpen(false);
      setProjectActiveIndex(-1);
      setCreateNewProjectMode(false);
      setNewProjectPath("");
    },
    [setFormFeedback, setSubmitWithoutProjectPromptOpen],
  );

  const handleProjectQueryChange = useCallback(
    (value: string) => {
      setFormFeedback(null);
      setSubmitWithoutProjectPromptOpen(false);
      setProjectQuery(value);
      setProjectId("");
      setProjectDropdownOpen(true);
      setCreateNewProjectMode(false);
      setNewProjectPath("");
    },
    [setFormFeedback, setSubmitWithoutProjectPromptOpen],
  );

  const handleToggleProjectDropdown = useCallback(() => {
    setProjectDropdownOpen((prev) => !prev);
    if (!projectDropdownOpen && filteredProjects.length > 0) {
      setProjectActiveIndex(0);
    }
  }, [projectDropdownOpen, filteredProjects]);

  const handleProjectHover = useCallback(
    (projectIdValue: string) => {
      const index = filteredProjects.findIndex((project) => project.id === projectIdValue);
      setProjectActiveIndex(index);
    },
    [filteredProjects],
  );

  const handleEnableCreateNewProject = useCallback(() => {
    setFormFeedback(null);
    setCreateNewProjectMode(true);
    setProjectDropdownOpen(false);
  }, [setFormFeedback]);

  const handleNewProjectPathChange = useCallback(
    (value: string) => {
      setNewProjectPath(value);
      setMissingPathPrompt(null);
      setFormFeedback(null);
    },
    [setFormFeedback],
  );

  const handleOpenManualPathBrowser = useCallback(() => {
    setFormFeedback(null);
    setManualPathPickerOpen(true);
    void loadManualPathEntries(newProjectPath.trim() || undefined);
  }, [loadManualPathEntries, newProjectPath, setFormFeedback]);

  const handleTogglePathSuggestions = useCallback(() => {
    setFormFeedback(null);
    setPathSuggestionsOpen((prev) => !prev);
  }, [setFormFeedback]);

  const handlePickNativePath = useCallback(async () => {
    setNativePickerUnsupported(false);
    setNativePathPicking(true);
    try {
      const picked = await pickProjectPathNative();
      if (picked.cancelled || !picked.path) return;
      setNewProjectPath(picked.path);
      setMissingPathPrompt(null);
      setPathSuggestionsOpen(false);
      setFormFeedback(null);
    } catch (err) {
      console.error("Failed to open native path picker:", err);
      if (isApiRequestError(err) && err.status === 404) {
        setPathApiUnsupported(true);
        setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
      } else {
        const message = resolvePathHelperErrorMessage(err, {
          ko: "운영체제 폴더 선택기를 열지 못했습니다.",
          en: "Failed to open OS folder picker.",
          ja: "OSフォルダ選択を開けませんでした。",
          zh: "无法打开系统文件夹选择器。",
        });
        if (
          isApiRequestError(err) &&
          (err.code === "native_picker_unavailable" || err.code === "native_picker_failed")
        ) {
          setNativePickerUnsupported(true);
          setManualPathPickerOpen(true);
          await loadManualPathEntries(newProjectPath.trim() || undefined);
          setFormFeedback({ tone: "info", message });
        } else {
          setFormFeedback({ tone: "error", message });
        }
      }
    } finally {
      setNativePathPicking(false);
    }
  }, [
    loadManualPathEntries,
    newProjectPath,
    resolvePathHelperErrorMessage,
    unsupportedPathApiMessage,
    setFormFeedback,
  ]);

  const handleSelectPathSuggestion = useCallback((candidate: string) => {
    setNewProjectPath(candidate);
    setMissingPathPrompt(null);
    setPathSuggestionsOpen(false);
  }, []);

  const handleProjectInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setProjectDropdownOpen(false);
        setProjectActiveIndex(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setProjectDropdownOpen(true);
        setProjectActiveIndex((prev) => {
          if (filteredProjects.length === 0) return -1;
          if (prev < 0) return 0;
          return Math.min(prev + 1, filteredProjects.length - 1);
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setProjectDropdownOpen(true);
        setProjectActiveIndex((prev) => {
          if (filteredProjects.length === 0) return -1;
          if (prev < 0) return filteredProjects.length - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (event.key === "Enter" && projectDropdownOpen) {
        event.preventDefault();
        if (projectActiveIndex >= 0 && projectActiveIndex < filteredProjects.length) {
          selectProject(filteredProjects[projectActiveIndex]);
        }
      }
    },
    [filteredProjects, projectActiveIndex, projectDropdownOpen, selectProject],
  );

  return {
    projectPickerRef,
    projectId,
    setProjectId,
    projectQuery,
    setProjectQuery,
    projectDropdownOpen,
    setProjectDropdownOpen,
    projectActiveIndex,
    setProjectActiveIndex,
    projects,
    setProjects,
    projectsLoading,
    selectedProject,
    filteredProjects,
    createNewProjectMode,
    setCreateNewProjectMode,
    newProjectPath,
    setNewProjectPath,
    pathSuggestionsOpen,
    setPathSuggestionsOpen,
    pathSuggestionsLoading,
    pathSuggestions,
    missingPathPrompt,
    setMissingPathPrompt,
    manualPathPickerOpen,
    setManualPathPickerOpen,
    nativePathPicking,
    manualPathLoading,
    manualPathCurrent,
    manualPathParent,
    manualPathEntries,
    manualPathTruncated,
    manualPathError,
    pathApiUnsupported,
    setPathApiUnsupported,
    nativePickerUnsupported,
    loadManualPathEntries,
    selectProject,
    handleProjectQueryChange,
    handleToggleProjectDropdown,
    handleProjectHover,
    handleEnableCreateNewProject,
    handleNewProjectPathChange,
    handleOpenManualPathBrowser,
    handleTogglePathSuggestions,
    handlePickNativePath,
    handleSelectPathSuggestion,
    handleProjectInputKeyDown,
  };
}
