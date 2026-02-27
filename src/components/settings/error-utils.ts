import { isApiRequestError } from "../../api/core";
import type { SettingsSectionError } from "./types";

type SettingsErrorSection = "cli" | "oauth" | "settings";

const SECTION_DEFAULTS: Record<
  SettingsErrorSection,
  {
    message: string;
    actionHint: string;
  }
> = {
  cli: {
    message: "Failed to load CLI status.",
    actionHint: "Check local CLI installations/auth, then click Refresh.",
  },
  oauth: {
    message: "Failed to load OAuth status.",
    actionHint: "Check OAUTH_ENCRYPTION_SECRET and local OAuth storage, then click Refresh.",
  },
  settings: {
    message: "Failed to load settings.",
    actionHint: "Check runtime database permissions and retry.",
  },
};

function buildSectionError(
  section: SettingsErrorSection,
  payload: Partial<SettingsSectionError> & Pick<SettingsSectionError, "message" | "actionHint">,
): SettingsSectionError {
  return {
    errorCode: payload.errorCode ?? null,
    message: payload.message,
    actionHint: payload.actionHint,
    recoverable: payload.recoverable ?? true,
  };
}

export function toSettingsSectionError(section: SettingsErrorSection, err: unknown): SettingsSectionError {
  const defaults = SECTION_DEFAULTS[section];
  if (!isApiRequestError(err)) {
    return buildSectionError(section, defaults);
  }

  if (err.status === 401 || err.status === 403) {
    return buildSectionError(section, {
      errorCode: err.code,
      message: "Authentication failed while loading Settings data.",
      actionHint: "Open the app via 127.0.0.1/localhost and refresh your session.",
    });
  }

  if (err.code === "cli_detection_failed") {
    return buildSectionError("cli", {
      errorCode: err.code,
      message: "CLI detection degraded.",
      actionHint: "Check PATH and CLI auth files, then retry from Settings.",
    });
  }

  if (err.code === "oauth_status_unavailable") {
    return buildSectionError("oauth", {
      errorCode: err.code,
      message: "OAuth status is temporarily unavailable.",
      actionHint: "Verify OAUTH_ENCRYPTION_SECRET and runtime DB write access, then retry.",
    });
  }

  if (err.code === "settings_read_failed" || err.code === "settings_write_failed") {
    return buildSectionError("settings", {
      errorCode: err.code,
      message: "Settings storage is temporarily unavailable.",
      actionHint: "Check SQLite file permissions/locks and retry.",
    });
  }

  return buildSectionError(section, {
    errorCode: err.code,
    message: defaults.message,
    actionHint: defaults.actionHint,
  });
}

