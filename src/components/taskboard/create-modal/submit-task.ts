import type { LangText } from "../../../i18n";
import type { Dispatch, SetStateAction } from "react";
import type { Project, TaskType, WorkflowPackKey } from "../../../types";
import { checkProjectPath, createProject, getProjects, isApiRequestError } from "../../../api";
import type { FormFeedback, Locale, MissingPathPrompt, TFunction } from "../constants";

type CreateTaskHandler = (input: {
  title: string;
  description?: string;
  department_id?: string;
  task_type?: string;
  priority?: number;
  project_id?: string;
  project_path?: string;
  assigned_agent_id?: string;
  workflow_pack_key?: WorkflowPackKey;
}) => void | Promise<void>;

type ResolvePathHelperErrorMessage = (error: unknown, fallback: LangText) => string;

type SubmitTaskOptions = {
  allowCreateMissingPath?: boolean;
  allowWithoutProject?: boolean;
};

interface SubmitTaskContext {
  title: string;
  description: string;
  departmentId: string;
  taskType: TaskType;
  priority: number;
  assignAgentId: string;
  projectId: string;
  projectQuery: string;
  createNewProjectMode: boolean;
  newProjectPath: string;
  selectedProject: Project | null;
  projects: Project[];
  submitBusy: boolean;
  t: TFunction;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: ResolvePathHelperErrorMessage;
  onCreate: CreateTaskHandler;
  onClose: () => void;
  selectProject: (project: Project | null) => void;
  setFormFeedback: (feedback: FormFeedback | null) => void;
  setSubmitWithoutProjectPromptOpen: (open: boolean) => void;
  setSubmitBusy: (busy: boolean) => void;
  setProjectId: (projectId: string) => void;
  setProjectQuery: (query: string) => void;
  setCreateNewProjectMode: (enabled: boolean) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setMissingPathPrompt: (prompt: MissingPathPrompt | null) => void;
  setNewProjectPath: (path: string) => void;
  setPathApiUnsupported: (unsupported: boolean) => void;
  setProjectDropdownOpen: (open: boolean) => void;
}

export async function submitTaskWithProjectHandling(
  context: SubmitTaskContext,
  options: SubmitTaskOptions = {},
): Promise<void> {
  const allowCreateMissingPath = options.allowCreateMissingPath ?? false;
  const allowWithoutProject = options.allowWithoutProject ?? false;
  const {
    title,
    description,
    departmentId,
    taskType,
    priority,
    assignAgentId,
    projectId,
    projectQuery,
    createNewProjectMode,
    newProjectPath,
    selectedProject,
    projects,
    submitBusy,
    t,
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    onCreate,
    onClose,
    selectProject,
    setFormFeedback,
    setSubmitWithoutProjectPromptOpen,
    setSubmitBusy,
    setProjectId,
    setProjectQuery,
    setCreateNewProjectMode,
    setProjects,
    setMissingPathPrompt,
    setNewProjectPath,
    setPathApiUnsupported,
    setProjectDropdownOpen,
  } = context;

  if (!title.trim()) return;
  if (submitBusy) return;
  setFormFeedback(null);
  setSubmitWithoutProjectPromptOpen(false);

  let resolvedProject = selectedProject;

  if (!resolvedProject && projectQuery.trim()) {
    const query = projectQuery.trim().toLowerCase();
    const exact = projects.find(
      (project) => project.name.toLowerCase() === query || project.project_path.toLowerCase() === query,
    );
    if (exact) {
      resolvedProject = exact;
    } else {
      const prefixMatches = projects.filter(
        (project) =>
          project.name.toLowerCase().startsWith(query) || project.project_path.toLowerCase().startsWith(query),
      );
      if (prefixMatches.length === 1) {
        resolvedProject = prefixMatches[0];
      }
    }
  }

  if (projectId && !resolvedProject) {
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "선택한 프로젝트를 찾을 수 없습니다. 다시 선택해주세요.",
        en: "The selected project was not found. Please select again.",
        ja: "選択したプロジェクトが見つかりません。再度選択してください。",
        zh: "找不到所选项目，请重新选择。",
        fr: "Le projet sélectionné est introuvable. Sélectionnez-le à nouveau.",
      }),
    });
    return;
  }

  if (!resolvedProject && projectQuery.trim() && !createNewProjectMode) {
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "입력한 프로젝트를 확정할 수 없습니다. 목록에서 선택하거나 비워두고 진행해주세요.",
        en: "Could not resolve the typed project. Pick from the list or clear it to continue.",
        ja: "入力したプロジェクトを特定できません。リストから選択するか、空欄で続行してください。",
        zh: "无法确定输入的项目。请从列表选择，或清空后继续。",
        fr: "Projet saisi non reconnu. Choisissez-le dans la liste ou videz le champ pour continuer.",
      }),
    });
    setProjectDropdownOpen(true);
    return;
  }

  if (!resolvedProject && createNewProjectMode) {
    const projectName = projectQuery.trim();
    const coreGoal = description.trim();
    if (!projectName) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "신규 프로젝트명을 입력해주세요.",
          en: "Please enter a new project name.",
          ja: "新規プロジェクト名を入力してください。",
          zh: "请输入新项目名称。",
          fr: "Saisissez le nom du nouveau projet.",
        }),
      });
      return;
    }
    if (!newProjectPath.trim()) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "신규 프로젝트 경로를 입력해주세요.",
          en: "Please enter a new project path.",
          ja: "新規プロジェクトのパスを入力してください。",
          zh: "请输入新项目路径。",
          fr: "Saisissez le chemin du nouveau projet.",
        }),
      });
      return;
    }
    if (!coreGoal) {
      setFormFeedback({
        tone: "error",
        message: t({
          ko: "신규 프로젝트 생성 시 설명은 필수이며, 프로젝트 핵심 목표로 저장됩니다.",
          en: "Description is required for new project creation and will be saved as the project core goal.",
          ja: "新規プロジェクト作成時は説明が必須で、プロジェクトのコア目標として保存されます。",
          zh: "创建新项目时说明为必填，并会保存为项目核心目标。",
          fr: "La description est obligatoire pour créer un projet : elle devient son objectif principal.",
        }),
      });
      return;
    }

    setSubmitBusy(true);
    try {
      const rawNewProjectPath = newProjectPath.trim();
      let normalizedPath = rawNewProjectPath;
      let createPathIfMissing = true;

      try {
        const pathCheck = await checkProjectPath(rawNewProjectPath);
        normalizedPath = pathCheck.normalized_path || rawNewProjectPath;
        if (normalizedPath !== rawNewProjectPath) {
          setNewProjectPath(normalizedPath);
        }

        if (pathCheck.exists && !pathCheck.is_directory) {
          setFormFeedback({
            tone: "error",
            message: t({
              ko: "입력한 경로가 폴더가 아닙니다. 디렉터리 경로를 입력해주세요.",
              en: "The path is not a directory. Please enter a directory path.",
              ja: "入力したパスはフォルダではありません。ディレクトリパスを指定してください。",
              zh: "该路径不是文件夹，请输入目录路径。",
              fr: "Ce chemin n’est pas un dossier. Saisissez le chemin d’un dossier.",
            }),
          });
          return;
        }

        if (!pathCheck.exists && !allowCreateMissingPath) {
          setMissingPathPrompt({
            normalizedPath,
            canCreate: pathCheck.can_create,
            nearestExistingParent: pathCheck.nearest_existing_parent,
          });
          return;
        }
        createPathIfMissing = !pathCheck.exists && allowCreateMissingPath;
      } catch (pathCheckError) {
        if (isApiRequestError(pathCheckError) && pathCheckError.status === 404) {
          setPathApiUnsupported(true);
          setFormFeedback({ tone: "info", message: unsupportedPathApiMessage });
          createPathIfMissing = true;
        } else {
          setFormFeedback({
            tone: "error",
            message: resolvePathHelperErrorMessage(pathCheckError, {
              ko: "프로젝트 경로 확인에 실패했습니다.",
              en: "Failed to verify project path.",
              ja: "プロジェクトパスの確認に失敗しました。",
              zh: "项目路径校验失败。",
              fr: "Impossible de vérifier le chemin du projet.",
            }),
          });
          return;
        }
      }

      const createdProject = await createProject({
        name: projectName,
        project_path: normalizedPath,
        core_goal: coreGoal,
        create_path_if_missing: createPathIfMissing,
      });
      setMissingPathPrompt(null);
      resolvedProject = createdProject;
      setProjectId(createdProject.id);
      setProjectQuery(createdProject.name);
      setCreateNewProjectMode(false);
      setProjects((prev) => {
        if (prev.some((project) => project.id === createdProject.id)) return prev;
        return [createdProject, ...prev];
      });
    } catch (error) {
      console.error("Failed to create project during task creation:", error);
      if (isApiRequestError(error) && error.code === "project_path_conflict") {
        const details =
          (error.details as {
            existing_project_id?: unknown;
            existing_project_name?: unknown;
            existing_project_path?: unknown;
          } | null) ?? null;
        const existingProjectId = typeof details?.existing_project_id === "string" ? details.existing_project_id : "";
        const existingProjectName =
          typeof details?.existing_project_name === "string" ? details.existing_project_name : "";
        const existingProjectPath =
          typeof details?.existing_project_path === "string" ? details.existing_project_path : "";
        const existingProject = projects.find(
          (project) =>
            (existingProjectId && project.id === existingProjectId) ||
            (existingProjectPath && project.project_path === existingProjectPath),
        );
        if (existingProject) {
          selectProject(existingProject);
        } else {
          setCreateNewProjectMode(false);
          setProjectDropdownOpen(true);
          void getProjects({ page: 1, page_size: 50 })
            .then((response) => setProjects(response.projects))
            .catch((loadError) => {
              console.error("Failed to refresh projects after path conflict:", loadError);
            });
        }
        setFormFeedback({
          tone: "info",
          message: t({
            ko: existingProjectName
              ? `이미 '${existingProjectName}' 프로젝트에서 사용 중인 경로입니다. 기존 프로젝트를 선택해주세요.`
              : "이미 등록된 프로젝트 경로입니다. 기존 프로젝트를 선택해주세요.",
            en: existingProjectName
              ? `This path is already used by '${existingProjectName}'. Please use the existing project.`
              : "This path is already used by another project. Please use the existing project.",
            ja: existingProjectName
              ? `このパスは既に '${existingProjectName}' で使用中です。既存プロジェクトを選択してください。`
              : "このパスは既存プロジェクトで使用中です。既存プロジェクトを選択してください。",
            zh: existingProjectName
              ? `该路径已被‘${existingProjectName}’使用，请选择已有项目。`
              : "该路径已被现有项目使用，请选择已有项目。",
            fr: existingProjectName
              ? `Ce chemin est déjà utilisé par « ${existingProjectName} ». Utilisez ce projet existant.`
              : "Ce chemin est déjà utilisé par un autre projet. Utilisez ce projet existant.",
          }),
        });
        return;
      }
      if (isApiRequestError(error) && error.code === "project_path_not_found") {
        const details =
          (error.details as {
            normalized_path?: unknown;
            can_create?: unknown;
            nearest_existing_parent?: unknown;
          } | null) ?? null;
        setMissingPathPrompt({
          normalizedPath:
            typeof details?.normalized_path === "string" ? details.normalized_path : newProjectPath.trim(),
          canCreate: Boolean(details?.can_create),
          nearestExistingParent:
            typeof details?.nearest_existing_parent === "string" ? details.nearest_existing_parent : null,
        });
        return;
      }
      setFormFeedback({
        tone: "error",
        message: resolvePathHelperErrorMessage(error, {
          ko: "신규 프로젝트 생성에 실패했습니다. 프로젝트명/경로를 확인해주세요.",
          en: "Failed to create a new project. Please check name/path.",
          ja: "新規プロジェクトの作成に失敗しました。名前/パスを確認してください。",
          zh: "新项目创建失败，请检查名称/路径。",
          fr: "Impossible de créer le projet. Vérifiez le nom et le chemin.",
        }),
      });
      return;
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!resolvedProject && !allowWithoutProject) {
    setSubmitWithoutProjectPromptOpen(true);
    return;
  }

  setSubmitBusy(true);
  try {
    await Promise.resolve(
      onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        department_id: departmentId || undefined,
        task_type: taskType,
        priority,
        project_id: resolvedProject?.id,
        project_path: resolvedProject?.project_path,
        assigned_agent_id: assignAgentId || undefined,
      }),
    );
    onClose();
  } catch (error) {
    console.error("Failed to create task:", error);
    setFormFeedback({
      tone: "error",
      message: t({
        ko: "업무 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        en: "Failed to create task. Please try again shortly.",
        ja: "タスク作成中にエラーが発生しました。しばらくしてから再試行してください。",
        zh: "创建任务时发生错误，请稍后重试。",
        fr: "Impossible de créer la tâche. Réessayez dans un instant.",
      }),
    });
  } finally {
    setSubmitBusy(false);
  }
}
