import { KeyRound } from "lucide-react";
import type { OAuthConnectProvider } from "../../api";
import { OAUTH_INFO } from "./constants";
import { AntigravityLogo, GitHubCopilotLogo } from "./Logos";
import type { OAuthCommonProps } from "./types";

export default function OAuthConnectedProvidersSection({
  t,
  localeTag,
  form,
  setForm,
  persistSettings,
  oauthStatus,
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
}: OAuthCommonProps) {
  const detectedProviders = Object.entries(oauthStatus.providers).filter(([, info]) =>
    Boolean(info.detected ?? info.connected),
  );
  if (detectedProviders.length === 0) return null;

  const logoMap: Record<string, ({ className }: { className?: string }) => React.ReactElement> = {
    "github-copilot": GitHubCopilotLogo,
    antigravity: AntigravityLogo,
  };

  return (
    <div className="space-y-2">
      <h4 className="mb-2 text-sm font-semibold qg-text-secondary">
        {t({ ko: "인증 상태", en: "Auth Status", ja: "認証状態", zh: "认证状态", fr: "État de connexion" })}
      </h4>
      {detectedProviders.map(([provider, info]) => {
        const oauthInfo = OAUTH_INFO[provider];
        const LogoComp = logoMap[provider];
        const expiresAt = info.expires_at ? new Date(info.expires_at) : null;
        const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
        const isWebOAuth = info.source === "web-oauth";
        const isFileDetected = info.source === "file-detected";
        const isRunnable = Boolean(info.executionReady ?? info.connected);
        const accountList = info.accounts ?? [];

        return (
          <div
            key={provider}
            className="qg-card space-y-2 overflow-hidden"
            style={{ background: "var(--th-bg-surface)" }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                {LogoComp ? <LogoComp className="w-5 h-5" /> : <KeyRound size={16} aria-hidden="true" />}
                <span className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                  {oauthInfo?.label ?? provider}
                </span>
                {info.email && <span className="max-w-full break-all text-[13px] qg-text-secondary">{info.email}</span>}
                {isFileDetected && (
                  <span className="qg-badge">
                    {t({ ko: "CLI 감지", en: "CLI detected", ja: "CLI 検出", zh: "检测到 CLI", fr: "Détecté via CLI" })}
                  </span>
                )}
                {isWebOAuth && (
                  <span className="qg-badge">
                    {t({ ko: "웹 OAuth", en: "Web OAuth", ja: "Web OAuth", zh: "网页 OAuth", fr: "OAuth web" })}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {!isRunnable ? (
                  <span className="qg-badge">
                    {t({
                      ko: "감지됨 (실행 불가)",
                      en: "Detected (not runnable)",
                      ja: "検出済み（実行不可）",
                      zh: "已检测（不可执行）",
                      fr: "Détecté (inutilisable)",
                    })}
                  </span>
                ) : !isExpired ? (
                  <span className="qg-badge qg-badge--accent">
                    {info.lastRefreshed
                      ? t({
                          ko: "자동 갱신됨",
                          en: "Auto-refreshed",
                          ja: "自動更新済",
                          zh: "已自动刷新",
                          fr: "Renouvelé automatiquement",
                        })
                      : t({ ko: "연결됨", en: "Connected", ja: "接続中", zh: "已连接", fr: "Connecté" })}
                  </span>
                ) : info.refreshFailed ? (
                  <span className="qg-badge qg-badge--pin">
                    {t({
                      ko: "갱신 실패",
                      en: "Refresh failed",
                      ja: "更新失敗",
                      zh: "刷新失败",
                      fr: "Échec du renouvellement",
                    })}
                  </span>
                ) : isExpired && !info.hasRefreshToken ? (
                  <span className="qg-badge qg-badge--pin">
                    {t({
                      ko: "만료됨 — 재인증 필요",
                      en: "Expired — re-auth needed",
                      ja: "期限切れ — 再認証が必要",
                      zh: "已过期 — 需重新认证",
                      fr: "Expiré — reconnexion nécessaire",
                    })}
                  </span>
                ) : (
                  <span className="qg-badge qg-badge--pin">
                    {t({ ko: "만료됨", en: "Expired", ja: "期限切れ", zh: "已过期", fr: "Expiré" })}
                  </span>
                )}

                {info.hasRefreshToken && isWebOAuth && (
                  <button
                    type="button"
                    onClick={() => void onRefreshToken(provider as OAuthConnectProvider)}
                    disabled={refreshing === provider}
                    className="qg-btn qg-btn--sm"
                  >
                    {refreshing === provider
                      ? t({
                          ko: "갱신 중...",
                          en: "Refreshing...",
                          ja: "更新中...",
                          zh: "刷新中...",
                          fr: "Renouvellement…",
                        })
                      : t({ ko: "갱신", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
                  </button>
                )}

                {isExpired && !info.hasRefreshToken && isWebOAuth && (
                  <button
                    type="button"
                    onClick={() => onConnect(provider as OAuthConnectProvider)}
                    className="qg-btn qg-btn--primary qg-btn--sm"
                  >
                    {t({ ko: "재연결", en: "Reconnect", ja: "再接続", zh: "重新连接", fr: "Reconnecter" })}
                  </button>
                )}

                {isWebOAuth && (
                  <button
                    type="button"
                    onClick={() => void onDisconnect(provider as OAuthConnectProvider)}
                    disabled={disconnecting === provider}
                    className="qg-btn qg-btn--danger qg-btn--sm"
                  >
                    {disconnecting === provider
                      ? t({
                          ko: "해제 중...",
                          en: "Disconnecting...",
                          ja: "切断中...",
                          zh: "断开中...",
                          fr: "Déconnexion…",
                        })
                      : t({ ko: "연결 해제", en: "Disconnect", ja: "接続解除", zh: "断开连接", fr: "Déconnecter" })}
                  </button>
                )}
              </div>
            </div>

            {info.requiresWebOAuth && (
              <div
                className="rounded-[var(--qg-radius)] px-2.5 py-1.5 text-[13px] qg-text-secondary"
                style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface-hover)" }}
              >
                {t({
                  ko: "CLI에서 감지된 자격 증명은 Claw-Empire 실행에 직접 사용되지 않습니다. Web OAuth로 다시 연결하세요.",
                  en: "CLI-detected credentials are not used directly for Claw-Empire execution. Reconnect with Web OAuth.",
                  ja: "CLI 検出の資格情報は Claw-Empire 実行では直接利用されません。Web OAuth で再接続してください。",
                  zh: "CLI 检测到的凭据不会直接用于 Claw-Empire 执行。请使用 Web OAuth 重新连接。",
                  fr: "Les identifiants détectés via CLI ne servent pas directement à l'exécution. Reconnectez-vous avec l'OAuth web.",
                })}
              </div>
            )}

            {(info.scope || expiresAt || info.created_at > 0) && (
              <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                {info.scope && (
                  <div className="col-span-2">
                    <span className="qg-text-muted">
                      {t({ ko: "스코프", en: "Scope", ja: "スコープ", zh: "范围", fr: "Portée" })}:{" "}
                    </span>
                    <span className="break-all font-mono text-[13px] leading-relaxed qg-text-secondary">
                      {info.scope}
                    </span>
                  </div>
                )}
                {expiresAt && (
                  <div>
                    <span className="qg-text-muted">
                      {t({ ko: "만료", en: "Expires", ja: "期限", zh: "到期", fr: "Expire" })}:{" "}
                    </span>
                    <span style={{ color: isExpired ? "var(--qg-pin)" : "var(--th-text-secondary)" }}>
                      {expiresAt.toLocaleString(localeTag)}
                    </span>
                  </div>
                )}
                {info.created_at > 0 && (
                  <div>
                    <span className="qg-text-muted">
                      {t({ ko: "등록", en: "Created", ja: "登録", zh: "创建", fr: "Créé" })}:{" "}
                    </span>
                    <span className="qg-text-secondary">{new Date(info.created_at).toLocaleString(localeTag)}</span>
                  </div>
                )}
              </div>
            )}

            {(() => {
              const modelKey =
                provider === "github-copilot" ? "copilot" : provider === "antigravity" ? "antigravity" : null;
              if (!modelKey) return null;
              const modelList = models?.[modelKey];
              const currentModel = form.providerModelConfig?.[modelKey]?.model || "";

              return (
                <div className="flex min-w-0 flex-col items-stretch gap-1.5 pt-1 sm:flex-row sm:items-center sm:gap-2">
                  <label htmlFor={`oauth-model-${provider}`} className="qg-field__label w-auto shrink-0">
                    {t({ ko: "모델:", en: "Model:", ja: "モデル:", zh: "模型:", fr: "Modèle :" })}
                  </label>
                  {modelsLoading ? (
                    <span className="text-[13px] qg-text-muted motion-safe:animate-pulse">
                      {t({
                        ko: "로딩 중...",
                        en: "Loading...",
                        ja: "読み込み中...",
                        zh: "加载中...",
                        fr: "Chargement…",
                      })}
                    </span>
                  ) : modelList && modelList.length > 0 ? (
                    <select
                      id={`oauth-model-${provider}`}
                      value={currentModel}
                      onChange={(e) => {
                        const newConfig = {
                          ...form.providerModelConfig,
                          [modelKey]: { model: e.target.value },
                        };
                        const newForm = { ...form, providerModelConfig: newConfig };
                        setForm(newForm);
                        persistSettings(newForm);
                      }}
                      className="qg-select w-full min-w-0 sm:flex-1"
                    >
                      {!currentModel && (
                        <option value="">
                          {t({
                            ko: "선택하세요...",
                            en: "Select...",
                            ja: "選択してください...",
                            zh: "请选择...",
                            fr: "Choisir…",
                          })}
                        </option>
                      )}
                      {modelList.map((model, idx) => (
                        <option key={`${model}-${idx}`} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] qg-text-muted">
                        {t({
                          ko: "모델 목록 없음",
                          en: "No models",
                          ja: "モデル一覧なし",
                          zh: "无模型列表",
                          fr: "Aucun modèle",
                        })}
                      </span>
                      {provider === "github-copilot" && (
                        <span className="qg-field__hint">
                          {t({
                            ko: "GitHub Copilot 구독이 없으면 모델을 사용할 수 없습니다. 리포 가져오기만 사용하려면 무시해도 됩니다.",
                            en: "Models require a GitHub Copilot subscription. You can ignore this if you only need repo import.",
                            ja: "モデル利用には GitHub Copilot サブスクリプションが必要です。リポインポートのみなら無視できます。",
                            zh: "模型需要 GitHub Copilot 订阅。如果仅需导入仓库，可忽略此项。",
                            fr: "Les modèles nécessitent un abonnement GitHub Copilot. Ignorez ceci si vous voulez seulement importer des dépôts.",
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {accountList.length > 0 && (
              <div
                className="space-y-2 rounded-[var(--qg-radius)] p-2.5"
                style={{ border: "1px solid var(--th-border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="text-[13px] font-semibold qg-text-secondary">
                    {t({
                      ko: "계정 풀",
                      en: "Account Pool",
                      ja: "アカウントプール",
                      zh: "账号池",
                      fr: "Comptes disponibles",
                    })}
                  </div>
                  <div className="text-right text-[13px] qg-text-muted">
                    {t({
                      ko: "여러 계정을 동시에 활성 가능 · 우선순위 숫자가 낮을수록 먼저 시도",
                      en: "Multiple active accounts supported · lower priority runs first",
                      ja: "複数アクティブ対応 · 優先度の数字が小さいほど先に実行",
                      zh: "支持多账号同时激活 · 优先级数字越小越先执行",
                      fr: "Plusieurs comptes actifs possibles · la priorité la plus basse passe en premier",
                    })}
                  </div>
                </div>

                {accountList.map((account) => {
                  const modelKey =
                    provider === "github-copilot" ? "copilot" : provider === "antigravity" ? "antigravity" : null;
                  const modelList = modelKey ? (models?.[modelKey] ?? []) : [];
                  const draft = accountDrafts[account.id] ?? {
                    label: account.label ?? "",
                    modelOverride: account.modelOverride ?? "",
                    priority: String(account.priority ?? 100),
                  };
                  const hasCustomOverride = Boolean(draft.modelOverride) && !modelList.includes(draft.modelOverride);

                  return (
                    <div
                      key={account.id}
                      className="space-y-2 rounded-[var(--qg-radius)] p-2.5"
                      style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-primary)" }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={account.active ? "qg-badge qg-badge--accent" : "qg-badge"}>
                          {account.active
                            ? t({ ko: "활성", en: "Active", ja: "有効", zh: "活动", fr: "Actif" })
                            : t({ ko: "대기", en: "Standby", ja: "待機", zh: "待命", fr: "En réserve" })}
                        </span>
                        <span className={account.executionReady ? "qg-badge qg-badge--accent" : "qg-badge"}>
                          {account.executionReady
                            ? t({ ko: "실행 가능", en: "Runnable", ja: "実行可能", zh: "可执行", fr: "Utilisable" })
                            : t({
                                ko: "실행 불가",
                                en: "Not runnable",
                                ja: "実行不可",
                                zh: "不可执行",
                                fr: "Inutilisable",
                              })}
                        </span>
                        {account.email && (
                          <span className="break-all text-[13px] qg-text-secondary">{account.email}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="qg-field">
                          <span className="qg-field__label">
                            {t({ ko: "라벨", en: "Label", ja: "ラベル", zh: "标签", fr: "Libellé" })}
                          </span>
                          <input
                            value={draft.label}
                            onChange={(e) => onUpdateAccountDraft(account.id, { label: e.target.value })}
                            placeholder={t({
                              ko: "계정 별칭",
                              en: "Account alias",
                              ja: "アカウント別名",
                              zh: "账号别名",
                              fr: "Nom du compte",
                            })}
                            className="qg-input"
                          />
                        </label>

                        <label className="qg-field">
                          <span className="qg-field__label">
                            {t({
                              ko: "모델 오버라이드",
                              en: "Model Override",
                              ja: "モデル上書き",
                              zh: "模型覆盖",
                              fr: "Modèle imposé",
                            })}
                          </span>
                          <select
                            value={draft.modelOverride}
                            onChange={(e) => onUpdateAccountDraft(account.id, { modelOverride: e.target.value })}
                            className="qg-select w-full"
                          >
                            <option value="">
                              {t({
                                ko: "프로바이더 기본값 사용",
                                en: "Use provider default",
                                ja: "プロバイダ既定値を使用",
                                zh: "使用提供方默认值",
                                fr: "Modèle par défaut du fournisseur",
                              })}
                            </option>
                            {hasCustomOverride && <option value={draft.modelOverride}>{draft.modelOverride}</option>}
                            {modelList.map((model, idx) => (
                              <option key={`${model}-${idx}`} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="qg-field">
                          <span className="qg-field__label">
                            {t({ ko: "우선순위", en: "Priority", ja: "優先度", zh: "优先级", fr: "Priorité" })}
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.priority}
                            onChange={(e) => onUpdateAccountDraft(account.id, { priority: e.target.value })}
                            placeholder="100"
                            className="qg-input"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void onActivateAccount(provider as OAuthConnectProvider, account.id, account.active)
                          }
                          disabled={savingAccountId === account.id || account.status !== "active"}
                          className="qg-btn qg-btn--sm"
                        >
                          {account.active
                            ? t({
                                ko: "풀 해제",
                                en: "Pool Off",
                                ja: "プール解除",
                                zh: "移出池",
                                fr: "Retirer du roulement",
                              })
                            : t({
                                ko: "풀 추가",
                                en: "Pool On",
                                ja: "プール追加",
                                zh: "加入池",
                                fr: "Mettre en roulement",
                              })}
                        </button>

                        <button
                          type="button"
                          onClick={() => void onSaveAccount(account.id)}
                          disabled={savingAccountId === account.id}
                          className="qg-btn qg-btn--primary qg-btn--sm"
                        >
                          {t({ ko: "저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void onToggleAccount(account.id, account.status === "active" ? "disabled" : "active")
                          }
                          disabled={savingAccountId === account.id}
                          className="qg-btn qg-btn--sm"
                        >
                          {account.status === "active"
                            ? t({ ko: "비활성", en: "Disable", ja: "無効化", zh: "禁用", fr: "Désactiver" })
                            : t({ ko: "활성화", en: "Enable", ja: "有効化", zh: "启用", fr: "Activer" })}
                        </button>

                        <button
                          type="button"
                          onClick={() => void onDeleteAccount(provider as OAuthConnectProvider, account.id)}
                          disabled={savingAccountId === account.id}
                          className="qg-btn qg-btn--danger qg-btn--sm"
                        >
                          {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除", fr: "Supprimer" })}
                        </button>
                      </div>

                      {account.lastError && <div className="qg-field__error break-words">{account.lastError}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
