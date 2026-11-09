import { useId } from "react";
import { RefreshCw, TerminalSquare } from "lucide-react";
import { CLI_INFO } from "./constants";
import type { CliSettingsTabProps } from "./types";

export default function CliSettingsTab({
  t,
  cliStatus,
  cliModels,
  cliModelsLoading,
  form,
  setForm,
  persistSettings,
  onRefresh,
}: CliSettingsTabProps) {
  const baseId = useId();
  return (
    <section className="qg-card space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {t({
            ko: "CLI 도구 상태",
            en: "CLI Tool Status",
            ja: "CLI ツール状態",
            zh: "CLI 工具状态",
            fr: "État des outils CLI",
          })}
        </h3>
        <button type="button" onClick={onRefresh} className="qg-btn qg-btn--ghost qg-btn--sm">
          <RefreshCw size={16} aria-hidden="true" />
          {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
        </button>
      </div>

      {cliStatus ? (
        <div className="space-y-2">
          {Object.entries(cliStatus)
            .filter(([provider]) => !["copilot", "antigravity"].includes(provider))
            .map(([provider, status]) => {
              const info = CLI_INFO[provider];
              const isReady = status.installed && status.authenticated;
              const hasSubModel = provider === "claude" || provider === "codex";
              const modelList = cliModels?.[provider] ?? [];
              const currentModel = form.providerModelConfig?.[provider]?.model || "";
              const currentSubModel = form.providerModelConfig?.[provider]?.subModel || "";
              const currentReasoningLevel = form.providerModelConfig?.[provider]?.reasoningLevel || "";

              const selectedModel = modelList.find((m) => m.slug === currentModel);
              const reasoningLevels = selectedModel?.reasoningLevels;
              const defaultReasoning = selectedModel?.defaultReasoningLevel || "";

              return (
                <div
                  key={provider}
                  className="space-y-2 rounded-[var(--qg-radius)] p-3"
                  style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-surface)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center text-lg" aria-hidden="true">
                      {info?.icon ?? <TerminalFallback />}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                        {info?.label ?? provider}
                      </div>
                      <div className="text-[13px] qg-text-muted">
                        {status.version ??
                          (status.installed
                            ? t({
                                ko: "버전 확인 불가",
                                en: "Version unknown",
                                ja: "バージョン不明",
                                zh: "版本未知",
                                fr: "Version inconnue",
                              })
                            : t({
                                ko: "미설치",
                                en: "Not installed",
                                ja: "未インストール",
                                zh: "未安装",
                                fr: "Non installé",
                              }))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className={status.installed ? "qg-badge qg-badge--accent" : "qg-badge"}>
                        {status.installed
                          ? t({ ko: "설치됨", en: "Installed", ja: "インストール済み", zh: "已安装", fr: "Installé" })
                          : t({
                              ko: "미설치",
                              en: "Not installed",
                              ja: "未インストール",
                              zh: "未安装",
                              fr: "Non installé",
                            })}
                      </span>
                      {status.installed && (
                        <span className={status.authenticated ? "qg-badge qg-badge--accent" : "qg-badge"}>
                          {status.authenticated
                            ? t({ ko: "인증됨", en: "Authenticated", ja: "認証済み", zh: "已认证", fr: "Connecté" })
                            : t({
                                ko: "미인증",
                                en: "Not Authenticated",
                                ja: "未認証",
                                zh: "未认证",
                                fr: "Non connecté",
                              })}
                        </span>
                      )}
                    </div>
                  </div>

                  {isReady && (
                    <div className="space-y-1.5 pl-0 sm:pl-8">
                      <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                        <label
                          htmlFor={`${baseId}-${provider}-model`}
                          className="qg-field__label w-auto shrink-0 sm:w-40"
                        >
                          {hasSubModel
                            ? t({
                                ko: "메인 모델:",
                                en: "Main model:",
                                ja: "メインモデル:",
                                zh: "主模型:",
                                fr: "Modèle principal :",
                              })
                            : t({ ko: "모델:", en: "Model:", ja: "モデル:", zh: "模型:", fr: "Modèle :" })}
                        </label>
                        {cliModelsLoading ? (
                          <span className="text-[13px] qg-text-muted motion-safe:animate-pulse">
                            {t({
                              ko: "로딩 중...",
                              en: "Loading...",
                              ja: "読み込み中...",
                              zh: "加载中...",
                              fr: "Chargement…",
                            })}
                          </span>
                        ) : modelList.length > 0 ? (
                          <select
                            id={`${baseId}-${provider}-model`}
                            value={currentModel}
                            onChange={(e) => {
                              const newSlug = e.target.value;
                              const newModel = modelList.find((m) => m.slug === newSlug);
                              const prev = form.providerModelConfig?.[provider] || {};
                              const newConfig = {
                                ...form.providerModelConfig,
                                [provider]: {
                                  ...prev,
                                  model: newSlug,
                                  reasoningLevel: newModel?.defaultReasoningLevel || undefined,
                                },
                              };
                              const newForm = { ...form, providerModelConfig: newConfig };
                              setForm(newForm);
                              persistSettings(newForm);
                            }}
                            className="qg-select w-full min-w-0 sm:flex-1"
                          >
                            <option value="">
                              {t({ ko: "기본값", en: "Default", ja: "デフォルト", zh: "默认", fr: "Par défaut" })}
                            </option>
                            {modelList.map((m) => (
                              <option key={m.slug} value={m.slug}>
                                {m.displayName || m.slug}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[13px] qg-text-muted">
                            {t({
                              ko: "모델 목록 없음",
                              en: "No models",
                              ja: "モデル一覧なし",
                              zh: "无模型列表",
                              fr: "Aucun modèle",
                            })}
                          </span>
                        )}
                      </div>

                      {provider === "codex" && reasoningLevels && reasoningLevels.length > 0 && (
                        <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                          <label
                            htmlFor={`${baseId}-${provider}-reasoning`}
                            className="qg-field__label w-auto shrink-0 sm:w-40"
                          >
                            {t({
                              ko: "추론 레벨:",
                              en: "Reasoning:",
                              ja: "推論レベル:",
                              zh: "推理级别:",
                              fr: "Raisonnement :",
                            })}
                          </label>
                          <select
                            id={`${baseId}-${provider}-reasoning`}
                            value={currentReasoningLevel || defaultReasoning}
                            onChange={(e) => {
                              const prev = form.providerModelConfig?.[provider] || { model: "" };
                              const newConfig = {
                                ...form.providerModelConfig,
                                [provider]: { ...prev, reasoningLevel: e.target.value },
                              };
                              const newForm = { ...form, providerModelConfig: newConfig };
                              setForm(newForm);
                              persistSettings(newForm);
                            }}
                            className="qg-select w-full min-w-0 sm:flex-1"
                          >
                            {reasoningLevels.map((rl) => (
                              <option key={rl.effort} value={rl.effort}>
                                {rl.effort} ({rl.description})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {hasSubModel && (
                        <>
                          <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                            <label
                              htmlFor={`${baseId}-${provider}-submodel`}
                              className="qg-field__label w-auto shrink-0 sm:w-40"
                            >
                              {t({
                                ko: "알바생 모델:",
                                en: "Sub-agent model:",
                                ja: "サブモデル:",
                                zh: "子代理模型:",
                                fr: "Modèle des sous-agents :",
                              })}
                            </label>
                            {cliModelsLoading ? (
                              <span className="text-[13px] qg-text-muted motion-safe:animate-pulse">
                                {t({
                                  ko: "로딩 중...",
                                  en: "Loading...",
                                  ja: "読み込み中...",
                                  zh: "加载中...",
                                  fr: "Chargement…",
                                })}
                              </span>
                            ) : modelList.length > 0 ? (
                              <select
                                id={`${baseId}-${provider}-submodel`}
                                value={currentSubModel}
                                onChange={(e) => {
                                  const newSlug = e.target.value;
                                  const newSubModel = modelList.find((m) => m.slug === newSlug);
                                  const prev = form.providerModelConfig?.[provider] || { model: "" };
                                  const newConfig = {
                                    ...form.providerModelConfig,
                                    [provider]: {
                                      ...prev,
                                      subModel: newSlug,
                                      subModelReasoningLevel: newSubModel?.defaultReasoningLevel || undefined,
                                    },
                                  };
                                  const newForm = { ...form, providerModelConfig: newConfig };
                                  setForm(newForm);
                                  persistSettings(newForm);
                                }}
                                className="qg-select w-full min-w-0 sm:flex-1"
                              >
                                <option value="">
                                  {t({ ko: "기본값", en: "Default", ja: "デフォルト", zh: "默认", fr: "Par défaut" })}
                                </option>
                                {modelList.map((m) => (
                                  <option key={m.slug} value={m.slug}>
                                    {m.displayName || m.slug}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[13px] qg-text-muted">
                                {t({
                                  ko: "모델 목록 없음",
                                  en: "No models",
                                  ja: "モデル一覧なし",
                                  zh: "无模型列表",
                                  fr: "Aucun modèle",
                                })}
                              </span>
                            )}
                          </div>

                          {(() => {
                            const subSelected = modelList.find((m) => m.slug === currentSubModel);
                            const subLevels = subSelected?.reasoningLevels;
                            const subDefault = subSelected?.defaultReasoningLevel || "";
                            const currentSubRL = form.providerModelConfig?.[provider]?.subModelReasoningLevel || "";
                            if (provider !== "codex" || !subLevels || subLevels.length === 0) return null;
                            return (
                              <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                <label
                                  htmlFor={`${baseId}-${provider}-subreasoning`}
                                  className="qg-field__label w-auto shrink-0 sm:w-40"
                                >
                                  {t({
                                    ko: "알바 추론:",
                                    en: "Sub reasoning:",
                                    ja: "サブ推論:",
                                    zh: "子推理:",
                                    fr: "Raisonnement des sous-agents :",
                                  })}
                                </label>
                                <select
                                  id={`${baseId}-${provider}-subreasoning`}
                                  value={currentSubRL || subDefault}
                                  onChange={(e) => {
                                    const prev = form.providerModelConfig?.[provider] || { model: "" };
                                    const newConfig = {
                                      ...form.providerModelConfig,
                                      [provider]: { ...prev, subModelReasoningLevel: e.target.value },
                                    };
                                    const newForm = { ...form, providerModelConfig: newConfig };
                                    setForm(newForm);
                                    persistSettings(newForm);
                                  }}
                                  className="qg-select w-full min-w-0 sm:flex-1"
                                >
                                  {subLevels.map((rl) => (
                                    <option key={rl.effort} value={rl.effort}>
                                      {rl.effort} ({rl.description})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="qg-empty">
          {t({ ko: "로딩 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
        </div>
      )}

      <p className="qg-field__hint">
        {t({
          ko: "각 에이전트의 CLI 도구는 오피스에서 에이전트 클릭 후 변경할 수 있습니다. Copilot/Antigravity 모델은 OAuth 탭에서 설정합니다.",
          en: "Each agent's CLI tool can be changed in Office by clicking an agent. Configure Copilot/Antigravity models in OAuth tab.",
          ja: "各エージェントの CLI ツールは Office でエージェントをクリックして変更できます。Copilot/Antigravity のモデルは OAuth タブで設定してください。",
          zh: "每个代理的 CLI 工具可在 Office 中点击代理后修改。Copilot/Antigravity 模型请在 OAuth 页签配置。",
          fr: "L'outil CLI de chaque agent se change dans le Bureau, en cliquant sur l'agent. Les modèles Copilot et Antigravity se règlent dans l'onglet Comptes OAuth.",
        })}
      </p>
    </section>
  );
}

function TerminalFallback() {
  return <TerminalSquare size={16} aria-hidden="true" />;
}
