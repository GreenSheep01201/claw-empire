import { Lock, RefreshCw, TriangleAlert, X } from "lucide-react";
import GitHubOAuthAppConfig from "./GitHubOAuthAppConfig";
import OAuthConnectCards from "./OAuthConnectCards";
import OAuthConnectedProvidersSection from "./OAuthConnectedProvidersSection";
import { OAUTH_INFO } from "./constants";
import type { DeviceCodeStart } from "../../api";
import type { OAuthCallbackResultLike, OAuthCommonProps, TFunction } from "./types";

type OAuthSettingsTabProps = Omit<OAuthCommonProps, "oauthStatus"> & {
  t: TFunction;
  oauthLoading: boolean;
  oauthStatus: OAuthCommonProps["oauthStatus"] | null;
  oauthResult?: OAuthCallbackResultLike | null;
  onOauthResultClear?: () => void;
  onRefresh: () => void;
  deviceCode: DeviceCodeStart | null;
  deviceStatus: string | null;
  deviceError: string | null;
  onStartDeviceCodeFlow: () => Promise<void>;
};

export default function OAuthSettingsTab({
  t,
  localeTag,
  form,
  setForm,
  persistSettings,
  oauthLoading,
  oauthStatus,
  oauthResult,
  onOauthResultClear,
  onRefresh,
  models,
  modelsLoading,
  refreshing,
  disconnecting,
  savingAccountId,
  accountDrafts,
  onConnect,
  onDisconnect,
  onRefreshToken,
  onUpdateAccountDraft,
  onActivateAccount,
  onSaveAccount,
  onToggleAccount,
  onDeleteAccount,
  deviceCode,
  deviceStatus,
  deviceError,
  onStartDeviceCodeFlow,
}: OAuthSettingsTabProps) {
  return (
    <section className="qg-card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {t({
            ko: "OAuth 인증 현황",
            en: "OAuth Status",
            ja: "OAuth 認証状態",
            zh: "OAuth 认证状态",
            fr: "État OAuth",
          })}
        </h3>
        <button type="button" onClick={onRefresh} className="qg-btn qg-btn--ghost qg-btn--sm">
          <RefreshCw size={16} aria-hidden="true" />
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
        </button>
      </div>

      {oauthResult && (
        <div
          role={oauthResult.error ? "alert" : "status"}
          className="flex items-center justify-between gap-2 rounded-[var(--qg-radius)] px-3 py-2 text-sm"
          style={{
            border: `1px solid ${oauthResult.error ? "var(--qg-pin)" : "var(--qg-accent)"}`,
            background: oauthResult.error
              ? "color-mix(in srgb, var(--qg-pin) 8%, transparent)"
              : "var(--qg-accent-soft)",
            color: oauthResult.error ? "var(--qg-pin)" : "var(--th-text-heading)",
          }}
        >
          <span>
            {oauthResult.error
              ? `${t({ ko: "OAuth 연결 실패", en: "OAuth connection failed", ja: "OAuth 接続失敗", zh: "OAuth 连接失败", fr: "Échec de la connexion OAuth" })} : ${oauthResult.error}`
              : `${OAUTH_INFO[oauthResult.provider || ""]?.label || oauthResult.provider} ${t({ ko: "연결 완료!", en: "connected!", ja: "接続完了!", zh: "连接成功!", fr: "connecté !" })}`}
          </span>
          <button
            type="button"
            onClick={() => onOauthResultClear?.()}
            className="qg-icon-btn qg-btn--ghost"
            style={{ width: 32, height: 32 }}
            aria-label={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {oauthStatus && (
        <div
          className="flex items-center gap-2 rounded-[var(--qg-radius)] px-3 py-2 text-[13px]"
          style={{
            border: "1px solid var(--th-border)",
            background: oauthStatus.storageReady ? "var(--qg-accent-soft)" : "var(--th-bg-surface)",
            color: "var(--th-text-secondary)",
          }}
        >
          {oauthStatus.storageReady ? (
            <Lock size={16} aria-hidden="true" style={{ color: "var(--qg-accent)" }} />
          ) : (
            <TriangleAlert size={16} aria-hidden="true" />
          )}
          <span>
            {oauthStatus.storageReady
              ? t({
                  ko: "OAuth 저장소 활성화됨 (암호화 키 설정됨)",
                  en: "OAuth storage is active (encryption key configured)",
                  ja: "OAuth ストレージ有効（暗号化キー設定済み）",
                  zh: "OAuth 存储已启用（已配置加密密钥）",
                  fr: "Le stockage OAuth est actif (clé de chiffrement configurée)",
                })
              : t({
                  ko: "OAUTH_ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다",
                  en: "OAUTH_ENCRYPTION_SECRET environment variable is not set",
                  ja: "OAUTH_ENCRYPTION_SECRET 環境変数が設定されていません",
                  zh: "未设置 OAUTH_ENCRYPTION_SECRET 环境变量",
                  fr: "La variable d'environnement OAUTH_ENCRYPTION_SECRET n'est pas définie",
                })}
          </span>
        </div>
      )}

      {oauthLoading ? (
        <div className="qg-empty">
          {t({ ko: "로딩 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
        </div>
      ) : oauthStatus ? (
        <>
          <OAuthConnectedProvidersSection
            t={t}
            localeTag={localeTag}
            form={form}
            setForm={setForm}
            persistSettings={persistSettings}
            oauthStatus={oauthStatus}
            models={models}
            modelsLoading={modelsLoading}
            refreshing={refreshing}
            disconnecting={disconnecting}
            savingAccountId={savingAccountId}
            accountDrafts={accountDrafts}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onRefreshToken={onRefreshToken}
            onUpdateAccountDraft={onUpdateAccountDraft}
            onActivateAccount={onActivateAccount}
            onSaveAccount={onSaveAccount}
            onToggleAccount={onToggleAccount}
            onDeleteAccount={onDeleteAccount}
          />

          <OAuthConnectCards
            t={t}
            oauthStatus={oauthStatus}
            deviceCode={deviceCode}
            deviceStatus={deviceStatus}
            deviceError={deviceError}
            onConnect={onConnect}
            onStartDeviceCodeFlow={onStartDeviceCodeFlow}
          />

          <GitHubOAuthAppConfig t={t} />
        </>
      ) : null}
    </section>
  );
}
