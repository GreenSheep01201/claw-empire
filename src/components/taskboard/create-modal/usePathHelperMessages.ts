import type { LangText } from "../../../i18n";
import { useCallback, useMemo } from "react";
import { isApiRequestError } from "../../../api";
import type { Locale, TFunction } from "../constants";

export function usePathHelperMessages(t: TFunction) {
  const unsupportedPathApiMessage = useMemo(
    () =>
      t({
        ko: "현재 서버 버전은 경로 탐색 보조 기능을 지원하지 않습니다. 경로를 직접 입력해주세요.",
        en: "This server does not support path helper APIs. Enter the path manually.",
        ja: "現在のサーバーではパス補助 API をサポートしていません。手入力してください。",
        zh: "当前服务器不支持路径辅助 API，请手动输入路径。",
        fr: "Ce serveur ne propose pas l’aide à la saisie de chemin. Saisissez le chemin à la main.",
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
        fr: "Le sélecteur de dossiers du système n’est pas disponible ici. Parcourez les dossiers dans l’application ou saisissez le chemin.",
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
          fr: "Ce chemin est hors des dossiers de projet autorisés.",
        });
      }
      return t({
        ko: `허용된 프로젝트 경로 범위를 벗어났습니다. 허용 경로: ${allowedRoots.join(", ")}`,
        en: `Path is outside allowed project roots. Allowed roots: ${allowedRoots.join(", ")}`,
        ja: `許可されたプロジェクトパス範囲外です。許可パス: ${allowedRoots.join(", ")}`,
        zh: `路径超出允许的项目根目录范围。允许路径：${allowedRoots.join(", ")}`,
        fr: `Ce chemin est hors des dossiers de projet autorisés. Dossiers autorisés : ${allowedRoots.join(", ")}`,
      });
    },
    [t],
  );

  const resolvePathHelperErrorMessage = useCallback(
    (error: unknown, fallback: LangText) => {
      if (!isApiRequestError(error)) return t(fallback);

      if (error.status === 404) {
        return unsupportedPathApiMessage;
      }
      if (error.code === "project_path_outside_allowed_roots") {
        const allowedRoots = Array.isArray((error.details as { allowed_roots?: unknown })?.allowed_roots)
          ? (error.details as { allowed_roots: unknown[] }).allowed_roots.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0,
            )
          : [];
        return formatAllowedRootsMessage(allowedRoots);
      }
      if (error.code === "native_picker_unavailable" || error.code === "native_picker_failed") {
        return nativePickerUnavailableMessage;
      }
      if (error.code === "project_path_not_directory") {
        return t({
          ko: "해당 경로는 폴더가 아닙니다. 디렉터리 경로를 입력해주세요.",
          en: "This path is not a directory. Please enter a directory path.",
          ja: "このパスはフォルダではありません。ディレクトリパスを入力してください。",
          zh: "该路径不是文件夹，请输入目录路径。",
          fr: "Ce chemin n’est pas un dossier. Saisissez le chemin d’un dossier.",
        });
      }
      if (error.code === "project_path_not_found") {
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

  return {
    unsupportedPathApiMessage,
    nativePickerUnavailableMessage,
    resolvePathHelperErrorMessage,
  };
}
