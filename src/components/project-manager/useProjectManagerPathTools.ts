import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { browseProjectPath, getProjectPathSuggestions, isApiRequestError } from "../../api";
import type { FormFeedback, I18nTextMap, ManualPathEntry, MissingPathPrompt, ProjectI18nTranslate } from "./types";

interface UseProjectManagerPathToolsParams {
  t: ProjectI18nTranslate;
  projectPath: string;
  pathToolsVisible: boolean;
}

export interface ProjectManagerPathTools {
  pathSuggestionsOpen: boolean;
  setPathSuggestionsOpen: Dispatch<SetStateAction<boolean>>;
  pathSuggestionsLoading: boolean;
  pathSuggestions: string[];
  missingPathPrompt: MissingPathPrompt | null;
  setMissingPathPrompt: Dispatch<SetStateAction<MissingPathPrompt | null>>;
  manualPathPickerOpen: boolean;
  setManualPathPickerOpen: Dispatch<SetStateAction<boolean>>;
  nativePathPicking: boolean;
  setNativePathPicking: Dispatch<SetStateAction<boolean>>;
  manualPathLoading: boolean;
  manualPathCurrent: string;
  manualPathParent: string | null;
  manualPathEntries: ManualPathEntry[];
  manualPathTruncated: boolean;
  manualPathError: string | null;
  pathApiUnsupported: boolean;
  setPathApiUnsupported: Dispatch<SetStateAction<boolean>>;
  nativePickerUnsupported: boolean;
  setNativePickerUnsupported: Dispatch<SetStateAction<boolean>>;
  formFeedback: FormFeedback | null;
  setFormFeedback: Dispatch<SetStateAction<FormFeedback | null>>;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: (err: unknown, fallback: I18nTextMap) => string;
  resetPathHelperState: () => void;
  loadManualPathEntries: (targetPath?: string) => Promise<void>;
}

export function useProjectManagerPathTools({
  t,
  projectPath,
  pathToolsVisible,
}: UseProjectManagerPathToolsParams): ProjectManagerPathTools {
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
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);

  const unsupportedPathApiMessage = useMemo(
    () =>
      t({
        ko: "현재 서버 버전은 경로 탐색 보조 기능을 지원하지 않습니다. 경로를 직접 입력해주세요.",
        en: "This server does not support path helper APIs. Enter the path manually.",
        ja: "現在のサーバーではパス補助 API をサポートしていません。手入力してください。",
        zh: "当前服务器不支持路径辅助 API，请手动输入路径。",
        fr: "Ce serveur ne propose pas l’aide aux chemins. Saisir le chemin manuellement.",
      }),
    [t],
  );

  const nativePickerUnavailableMessage = useMemo(
    () =>
      t({
        ko: "운영체제 폴더 선택기를 사용할 수 없는 환경입니다. 앱 내 폴더 탐색 또는 직접 입력을 사용해주세요.",
        en: "OS folder picker is unavailable in this environment. Use in-app browser or manual input.",
        ja: "この環境では OS フォルダ選択が利用できません。アプリ内閲覧または手入力を使ってください。",
        zh: "当前环境无法使用系统文件夹选择器，请使用应用内浏览或手动输入。",
        fr: "Le sélecteur système est indisponible ici. Parcourir les dossiers ou saisir le chemin.",
      }),
    [t],
  );

  const formatAllowedRootsMessage = useCallback(
    (allowedRoots: string[]) => {
      if (allowedRoots.length === 0) {
        return t({
          ko: "허용된 프로젝트 경로 범위를 벗어났습니다.",
          en: "Path is outside allowed project roots.",
          ja: "許可されたプロジェクトパス範囲外です。",
          zh: "路径超出允许的项目根目录范围。",
          fr: "Ce chemin est hors des dossiers autorisés.",
        });
      }
      return t({
        ko: `허용된 프로젝트 경로 범위를 벗어났습니다. 허용 경로: ${allowedRoots.join(", ")}`,
        en: `Path is outside allowed project roots. Allowed roots: ${allowedRoots.join(", ")}`,
        ja: `許可されたプロジェクトパス範囲外です。許可パス: ${allowedRoots.join(", ")}`,
        zh: `路径超出允许的项目根目录范围。允许路径：${allowedRoots.join(", ")}`,
        fr: `Ce chemin est hors des dossiers autorisés. Dossiers autorisés : ${allowedRoots.join(", ")}`,
      });
    },
    [t],
  );

  const resolvePathHelperErrorMessage = useCallback(
    (err: unknown, fallback: I18nTextMap) => {
      if (!isApiRequestError(err)) return t(fallback);
      if (err.status === 404) {
        return unsupportedPathApiMessage;
      }
      if (err.code === "project_path_outside_allowed_roots") {
        const allowedRoots = Array.isArray((err.details as { allowed_roots?: unknown })?.allowed_roots)
          ? (err.details as { allowed_roots: unknown[] }).allowed_roots.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0,
            )
          : [];
        return formatAllowedRootsMessage(allowedRoots);
      }
      if (err.code === "native_picker_unavailable" || err.code === "native_picker_failed") {
        return nativePickerUnavailableMessage;
      }
      if (err.code === "project_path_not_directory") {
        return t({
          ko: "해당 경로는 폴더가 아닙니다. 디렉터리 경로를 입력해주세요.",
          en: "This path is not a directory. Please enter a directory path.",
          ja: "このパスはフォルダではありません。ディレクトリパスを入力してください。",
          zh: "该路径不是文件夹，请输入目录路径。",
          fr: "Ce chemin n’est pas un dossier. Saisir le chemin d’un dossier.",
        });
      }
      if (err.code === "project_path_not_found") {
        return t({
          ko: "해당 경로를 찾을 수 없습니다.",
          en: "Path not found.",
          ja: "パスが見つかりません。",
          zh: "找不到该路径。",
          fr: "Chemin introuvable.",
        });
      }
      return t(fallback);
    },
    [formatAllowedRootsMessage, nativePickerUnavailableMessage, t, unsupportedPathApiMessage],
  );

  const resetPathHelperState = useCallback(() => {
    setPathSuggestionsOpen(false);
    setPathSuggestionsLoading(false);
    setPathSuggestions([]);
    setMissingPathPrompt(null);
    setManualPathPickerOpen(false);
    setNativePathPicking(false);
    setManualPathLoading(false);
    setManualPathCurrent("");
    setManualPathParent(null);
    setManualPathEntries([]);
    setManualPathTruncated(false);
    setManualPathError(null);
    setPathApiUnsupported(false);
    setNativePickerUnsupported(false);
    setFormFeedback(null);
  }, []);

  useEffect(() => {
    if (pathToolsVisible) return;
    resetPathHelperState();
  }, [pathToolsVisible, resetPathHelperState]);

  useEffect(() => {
    if (!pathToolsVisible || !pathSuggestionsOpen || pathApiUnsupported) return;
    let cancelled = false;
    setPathSuggestionsLoading(true);
    getProjectPathSuggestions(projectPath.trim(), 30)
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
            fr: "Impossible de charger les suggestions.",
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
    pathApiUnsupported,
    pathSuggestionsOpen,
    pathToolsVisible,
    projectPath,
    resolvePathHelperErrorMessage,
    unsupportedPathApiMessage,
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
              fr: "Impossible de charger les dossiers.",
            }),
          );
        }
        setManualPathEntries([]);
        setManualPathTruncated(false);
      } finally {
        setManualPathLoading(false);
      }
    },
    [pathApiUnsupported, resolvePathHelperErrorMessage, unsupportedPathApiMessage],
  );

  return {
    pathSuggestionsOpen,
    setPathSuggestionsOpen,
    pathSuggestionsLoading,
    pathSuggestions,
    missingPathPrompt,
    setMissingPathPrompt,
    manualPathPickerOpen,
    setManualPathPickerOpen,
    nativePathPicking,
    setNativePathPicking,
    manualPathLoading,
    manualPathCurrent,
    manualPathParent,
    manualPathEntries,
    manualPathTruncated,
    manualPathError,
    pathApiUnsupported,
    setPathApiUnsupported,
    nativePickerUnsupported,
    setNativePickerUnsupported,
    formFeedback,
    setFormFeedback,
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    resetPathHelperState,
    loadManualPathEntries,
  };
}
