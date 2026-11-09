import { useId, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { API_TYPE_PRESETS } from "./constants";
import ApiAssignModal from "./ApiAssignModal";
import type { ApiStateBundle, TFunction } from "./types";
import { DEFAULT_API_FORM } from "./useApiProvidersState";

interface ApiSettingsTabProps {
  t: TFunction;
  localeTag: string;
  apiState: ApiStateBundle;
}

export default function ApiSettingsTab({ t, localeTag, apiState }: ApiSettingsTabProps) {
  const {
    apiProviders,
    apiProvidersLoading,
    apiOfficialPresets,
    apiPresetsLoading,
    apiAddMode,
    apiEditingId,
    apiForm,
    apiSaving,
    apiSaveError,
    apiTesting,
    apiTestResult,
    apiModelsExpanded,
    setApiAddMode,
    setApiEditingId,
    setApiForm,
    setApiSaveError,
    setApiModelsExpanded,
    loadApiProviders,
    loadApiPresets,
    handleApiProviderSave,
    handleApiProviderDelete,
    handleApiProviderTest,
    handleApiProviderToggle,
    handleApiEditStart,
    handleApiModelAssign,
  } = apiState;

  const [modelSearchQueries, setModelSearchQueries] = useState<Record<string, string>>({});
  const fieldId = useId();
  const selectedOfficialPreset = apiForm.preset_key ? apiOfficialPresets[apiForm.preset_key] : null;
  const isOfficialPresetSelected = Boolean(apiForm.preset_key);

  function resetForm(): void {
    setApiAddMode(false);
    setApiEditingId(null);
    setApiSaveError(null);
    setApiForm(DEFAULT_API_FORM);
  }

  function openAddMode(): void {
    setApiAddMode(true);
    setApiEditingId(null);
    setApiSaveError(null);
    setApiForm(DEFAULT_API_FORM);
  }

  return (
    <>
      <section className="qg-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold" style={{ color: "var(--th-text-heading)" }}>
            {t({
              ko: "API 프로바이더",
              en: "API Providers",
              ja: "API プロバイダー",
              zh: "API 提供方",
              fr: "Fournisseurs d'API",
            })}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void Promise.all([loadApiProviders(), loadApiPresets()]);
              }}
              disabled={apiProvidersLoading || apiPresetsLoading}
              className="qg-btn qg-btn--ghost qg-btn--sm"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新", fr: "Actualiser" })}
            </button>
            {!apiAddMode && (
              <button type="button" onClick={openAddMode} className="qg-btn qg-btn--primary qg-btn--sm">
                <Plus size={16} aria-hidden="true" />
                {t({ ko: "추가", en: "Add", ja: "追加", zh: "添加", fr: "Ajouter" })}
              </button>
            )}
          </div>
        </div>

        <p className="qg-field__hint">
          {t({
            ko: "로컬 모델, 프론티어 모델, 기타 호환 서비스용 API를 등록해 에이전트에 직접 연결할 수 있습니다.",
            en: "Register local, frontier, and compatible third-party APIs, then assign those models directly to agents.",
            ja: "ローカルモデルや先端モデル、互換サービスの API を登録してエージェントへ直接割り当てられます。",
            zh: "可注册本地模型、前沿模型和兼容第三方服务的 API，并将模型直接分配给代理。",
            fr: "Enregistrez des API locales, de grands fournisseurs ou compatibles, puis attribuez leurs modèles directement à vos agents.",
          })}
        </p>

        {apiAddMode && (
          <div
            className="space-y-4 rounded-[var(--qg-radius)] p-4"
            style={{ border: "1px solid var(--qg-accent)", background: "var(--th-bg-surface)" }}
          >
            <h4 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
              {apiEditingId
                ? t({
                    ko: "프로바이더 수정",
                    en: "Edit Provider",
                    ja: "プロバイダー編集",
                    zh: "编辑提供方",
                    fr: "Modifier le fournisseur",
                  })
                : t({
                    ko: "새 프로바이더 추가",
                    en: "Add New Provider",
                    ja: "新しいプロバイダーを追加",
                    zh: "添加新提供方",
                    fr: "Ajouter un fournisseur",
                  })}
            </h4>

            <div className="qg-field" role="group" aria-labelledby={`${fieldId}-presets`}>
              <span id={`${fieldId}-presets`} className="qg-field__label">
                {t({
                  ko: "공식 프리셋",
                  en: "Official Presets",
                  ja: "公式プリセット",
                  zh: "官方预设",
                  fr: "Préréglages officiels",
                })}
              </span>
              <p className="qg-field__hint">
                {t({
                  ko: "OpenCode Go와 Bailian Coding Plan용 공식 프리셋입니다.",
                  en: "Official presets for OpenCode Go and Bailian Coding Plan.",
                  ja: "OpenCode Go と Bailian Coding Plan 向けの公式プリセットです。",
                  zh: "适用于 OpenCode Go 与 Bailian Coding Plan 的官方预设。",
                  fr: "Préréglages officiels pour OpenCode Go et Bailian Coding Plan.",
                })}
              </p>

              {apiPresetsLoading ? (
                <div className="text-[13px] qg-text-muted">
                  {t({
                    ko: "프리셋 불러오는 중...",
                    en: "Loading presets...",
                    ja: "プリセットを読み込み中...",
                    zh: "正在加载预设...",
                    fr: "Chargement des préréglages…",
                  })}
                </div>
              ) : Object.keys(apiOfficialPresets).length === 0 ? (
                <div className="text-[13px] qg-text-muted">
                  {t({
                    ko: "공식 프리셋을 불러오지 못했습니다.",
                    en: "Official presets could not be loaded.",
                    ja: "公式プリセットを読み込めませんでした。",
                    zh: "无法加载官方预设。",
                    fr: "Impossible de charger les préréglages officiels.",
                  })}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(apiOfficialPresets).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={apiForm.preset_key === key}
                      onClick={() => {
                        setApiSaveError(null);
                        setApiForm((prev) => ({
                          ...prev,
                          preset_key: key,
                          name: preset.label,
                          type: preset.type,
                          base_url: preset.base_url,
                        }));
                      }}
                      className="qg-choice flex-col items-stretch"
                      style={{ gap: 4 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{preset.label}</span>
                        <span className="qg-badge">{preset.type}</span>
                      </div>
                      <div className="text-[13px] font-normal qg-text-secondary">{preset.description}</div>
                      <div className="break-all font-mono text-[13px] font-normal qg-text-muted">{preset.base_url}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedOfficialPreset && (
              <div
                className="rounded-[var(--qg-radius)] p-3"
                style={{ border: "1px solid var(--th-border)", background: "var(--qg-accent-soft)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                    {selectedOfficialPreset.label}
                  </div>
                  <a
                    href={selectedOfficialPreset.docs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-2 hover:underline"
                    style={{ color: "var(--qg-accent)" }}
                  >
                    {t({
                      ko: "문서 열기",
                      en: "Open docs",
                      ja: "ドキュメントを開く",
                      zh: "打开文档",
                      fr: "Ouvrir la documentation",
                    })}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
                <div className="mt-2 text-[13px] qg-text-secondary">{selectedOfficialPreset.api_key_hint}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedOfficialPreset.fallback_models.map((model) => (
                    <span key={model} className="qg-badge font-mono">
                      {model}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="qg-field" role="group" aria-labelledby={`${fieldId}-type`}>
              <span id={`${fieldId}-type`} className="qg-field__label">
                {t({ ko: "일반 타입", en: "Generic Type", ja: "汎用タイプ", zh: "通用类型", fr: "Type générique" })}
              </span>
              <p className="qg-field__hint">
                {isOfficialPresetSelected
                  ? t({
                      ko: "일반 타입을 선택하면 프리셋 잠금이 해제됩니다.",
                      en: "Choose a generic type to leave preset mode and unlock manual editing.",
                      ja: "汎用タイプを選ぶとプリセット固定が解除されます。",
                      zh: "选择通用类型即可退出预设模式并解锁手动编辑。",
                      fr: "Choisissez un type générique pour quitter le préréglage et tout modifier vous-même.",
                    })
                  : t({
                      ko: "프로토콜과 Base URL을 직접 설정하려면 일반 타입을 사용하세요.",
                      en: "Use a generic type when you want to manage protocol and Base URL yourself.",
                      ja: "プロトコルと Base URL を手動設定する場合は汎用タイプを使います。",
                      zh: "如果要自己管理协议与 Base URL，请使用通用类型。",
                      fr: "Choisissez un type générique pour gérer vous-même le protocole et l'URL de base.",
                    })}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  Object.entries(API_TYPE_PRESETS) as Array<
                    [keyof typeof API_TYPE_PRESETS, { label: string; base_url: string }]
                  >
                ).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={!apiForm.preset_key && apiForm.type === key}
                    onClick={() => {
                      setApiSaveError(null);
                      setApiForm((prev) => ({
                        ...prev,
                        preset_key: null,
                        type: key,
                        base_url: preset.base_url || prev.base_url,
                        name: prev.name || preset.label,
                      }));
                    }}
                    className="qg-choice"
                    style={{ width: "auto", minHeight: 36 }}
                  >
                    {key === "custom"
                      ? t({ ko: "사용자 지정", en: "Custom", ja: "カスタム", zh: "自定义", fr: "Personnalisé" })
                      : preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="qg-field">
              <label className="qg-field__label" htmlFor={`${fieldId}-name`}>
                {t({ ko: "이름", en: "Name", ja: "名前", zh: "名称", fr: "Nom" })}
              </label>
              <input
                id={`${fieldId}-name`}
                type="text"
                value={apiForm.name}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, name: e.target.value }));
                }}
                placeholder={t({
                  ko: "예: My OpenAI",
                  en: "e.g. My OpenAI",
                  ja: "例: My OpenAI",
                  zh: "例如：My OpenAI",
                  fr: "ex. : Mon OpenAI",
                })}
                className="qg-input"
              />
            </div>

            <div className="qg-field">
              <label className="qg-field__label" htmlFor={`${fieldId}-base-url`}>
                {t({ ko: "Base URL", en: "Base URL", fr: "URL de base" })}
              </label>
              <input
                id={`${fieldId}-base-url`}
                type="text"
                value={apiForm.base_url}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, base_url: e.target.value }));
                }}
                placeholder="https://api.openai.com/v1"
                readOnly={isOfficialPresetSelected}
                className="qg-input font-mono"
                style={isOfficialPresetSelected ? { background: "var(--th-bg-surface-hover)" } : undefined}
              />
              {isOfficialPresetSelected && (
                <p className="qg-field__hint">
                  {t({
                    ko: "선택한 프리셋이 프로토콜과 Base URL을 관리합니다.",
                    en: "The selected preset manages the protocol and Base URL.",
                    ja: "選択したプリセットがプロトコルと Base URL を管理します。",
                    zh: "所选预设会管理协议与 Base URL。",
                    fr: "Le préréglage choisi gère le protocole et l'URL de base.",
                  })}
                </p>
              )}
            </div>

            <div className="qg-field">
              <label className="qg-field__label" htmlFor={`${fieldId}-api-key`}>
                {t({ ko: "API 키", en: "API Key", fr: "Clé API" })}{" "}
                {!selectedOfficialPreset && apiForm.type === "ollama" && (
                  <span className="font-normal qg-text-muted">
                    (
                    {t({
                      ko: "로컬 환경에서는 보통 필요하지 않음",
                      en: "usually not needed for local",
                      ja: "ローカルでは通常不要",
                      zh: "本地环境通常不需要",
                      fr: "généralement inutile en local",
                    })}
                    )
                  </span>
                )}
              </label>
              <input
                id={`${fieldId}-api-key`}
                type="password"
                autoComplete="off"
                value={apiForm.api_key}
                onChange={(e) => {
                  setApiSaveError(null);
                  setApiForm((prev) => ({ ...prev, api_key: e.target.value }));
                }}
                placeholder={
                  apiEditingId
                    ? t({
                        ko: "변경하려면 입력 (빈값=유지)",
                        en: "Enter to change (blank=keep)",
                        ja: "変更する場合のみ入力 (空欄=維持)",
                        zh: "仅在修改时输入（留空=保持）",
                        fr: "Saisissez pour remplacer (vide = conserver)",
                      })
                    : (selectedOfficialPreset?.api_key_placeholder ?? "sk-...")
                }
                className="qg-input font-mono"
              />
              {selectedOfficialPreset && <p className="qg-field__hint">{selectedOfficialPreset.api_key_hint}</p>}
            </div>

            {apiSaveError && (
              <div role="alert" className="qg-field__error">
                {apiSaveError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleApiProviderSave()}
                disabled={apiSaving || !apiForm.name.trim() || !apiForm.base_url.trim()}
                className="qg-btn qg-btn--primary"
              >
                {apiSaving
                  ? t({ ko: "저장 중...", en: "Saving...", ja: "保存中...", zh: "保存中...", fr: "Enregistrement…" })
                  : apiEditingId
                    ? t({ ko: "수정", en: "Update", ja: "更新", zh: "更新", fr: "Mettre à jour" })
                    : t({ ko: "추가", en: "Add", ja: "追加", zh: "添加", fr: "Ajouter" })}
              </button>
              <button type="button" onClick={resetForm} className="qg-btn">
                {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消", fr: "Annuler" })}
              </button>
            </div>
          </div>
        )}

        {apiProvidersLoading ? (
          <div className="qg-empty motion-safe:animate-pulse">
            {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中...", fr: "Chargement…" })}
          </div>
        ) : apiProviders.length === 0 && !apiAddMode ? (
          <div className="qg-empty">
            {t({
              ko: "등록된 API 프로바이더가 없습니다. 위의 + 추가 버튼으로 시작하세요.",
              en: "No API providers registered. Click + Add above to get started.",
              ja: "API プロバイダーがありません。上の + Add から始めてください。",
              zh: "还没有注册 API 提供方。点击上方的 + Add 开始。",
              fr: "Aucun fournisseur d'API pour l'instant. Cliquez sur « Ajouter » ci-dessus pour commencer.",
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {apiProviders.map((provider) => {
              const testResult = apiTestResult[provider.id];
              const isExpanded = apiModelsExpanded[provider.id];
              const searchQuery = (modelSearchQueries[provider.id] || "").trim().toLowerCase();
              const filteredModels = isExpanded
                ? provider.models_cache.filter((m) => (searchQuery ? m.toLowerCase().includes(searchQuery) : true))
                : [];
              const presetLabel = provider.preset_key
                ? (apiOfficialPresets[provider.preset_key]?.label ?? provider.preset_key)
                : null;

              return (
                <div
                  key={provider.id}
                  className="rounded-[var(--qg-radius)] p-3"
                  style={{
                    border: "1px solid var(--th-border)",
                    background: "var(--th-bg-surface)",
                    opacity: provider.enabled ? 1 : 0.65,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ background: provider.enabled ? "var(--qg-accent)" : "var(--th-text-muted)" }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                        {provider.name}
                      </span>
                      <span className="qg-badge">{provider.type}</span>
                      {presetLabel && <span className="qg-badge">{presetLabel}</span>}
                      {provider.has_api_key && (
                        <span className="qg-badge qg-badge--accent">
                          {t({ ko: "키", en: "key", ja: "キー", zh: "密钥", fr: "clé API" })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleApiProviderTest(provider.id)}
                        disabled={apiTesting === provider.id}
                        className="qg-btn qg-btn--sm"
                        title={t({
                          ko: "연결 테스트",
                          en: "Test Connection",
                          ja: "接続テスト",
                          zh: "连接测试",
                          fr: "Tester la connexion",
                        })}
                      >
                        {apiTesting === provider.id ? (
                          <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
                        ) : null}
                        {t({ ko: "테스트", en: "Test", ja: "テスト", zh: "测试", fr: "Tester" })}
                      </button>
                      <button type="button" onClick={() => handleApiEditStart(provider)} className="qg-btn qg-btn--sm">
                        {t({ ko: "수정", en: "Edit", ja: "編集", zh: "编辑", fr: "Modifier" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApiProviderToggle(provider.id, provider.enabled)}
                        className="qg-btn qg-btn--sm"
                      >
                        {provider.enabled
                          ? t({ ko: "비활성화", en: "Disable", ja: "無効化", zh: "禁用", fr: "Désactiver" })
                          : t({ ko: "활성화", en: "Enable", ja: "有効化", zh: "启用", fr: "Activer" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApiProviderDelete(provider.id)}
                        className="qg-btn qg-btn--danger qg-btn--sm"
                      >
                        {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除", fr: "Supprimer" })}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 truncate font-mono text-[13px] qg-text-muted">{provider.base_url}</div>

                  {testResult && (
                    <div
                      role={testResult.ok ? "status" : "alert"}
                      className={`mt-2 ${testResult.ok ? "qg-field__hint" : "qg-field__error"}`}
                    >
                      {testResult.msg}
                    </div>
                  )}

                  {provider.models_cache && provider.models_cache.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        aria-expanded={Boolean(isExpanded)}
                        onClick={() => setApiModelsExpanded((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="qg-btn qg-btn--ghost qg-btn--sm"
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={16} aria-hidden="true" />
                        )}
                        {t({ ko: "모델 목록", en: "Models", ja: "モデル一覧", zh: "模型列表", fr: "Modèles" })} (
                        {provider.models_cache.length})
                        {provider.models_cached_at && (
                          <span className="ml-1 font-normal qg-text-muted">
                            {new Date(provider.models_cached_at).toLocaleString(localeTag, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder={t({
                              ko: "모델 검색...",
                              en: "Search models...",
                              ja: "モデル検索...",
                              zh: "搜索模型...",
                              fr: "Rechercher un modèle…",
                            })}
                            aria-label={t({
                              ko: "모델 검색",
                              en: "Search models",
                              ja: "モデルを検索",
                              zh: "搜索模型",
                              fr: "Rechercher un modèle",
                            })}
                            value={modelSearchQueries[provider.id] || ""}
                            onChange={(e) =>
                              setModelSearchQueries((prev) => ({ ...prev, [provider.id]: e.target.value }))
                            }
                            className="qg-input"
                          />
                          <div
                            className="max-h-48 overflow-y-auto rounded-[var(--qg-radius)] p-2"
                            style={{ border: "1px solid var(--th-border)", background: "var(--th-bg-primary)" }}
                          >
                            {filteredModels.map((model) => (
                              <div
                                key={model}
                                className="-mx-1 flex items-center justify-between rounded px-1 py-0.5 font-mono text-[13px] qg-text-secondary"
                              >
                                <span className="truncate">{model}</span>
                                <button
                                  type="button"
                                  onClick={() => void handleApiModelAssign(provider.id, model)}
                                  className="qg-btn qg-btn--ghost qg-btn--sm ml-2 whitespace-nowrap font-sans"
                                  title={t({
                                    ko: "에이전트에 배정",
                                    en: "Assign to agent",
                                    ja: "エージェントに割り当て",
                                    zh: "分配给代理",
                                    fr: "Attribuer à un agent",
                                  })}
                                >
                                  {t({ ko: "배정", en: "Assign", ja: "割当", zh: "分配", fr: "Attribuer" })}
                                </button>
                              </div>
                            ))}
                            {filteredModels.length === 0 && (
                              <div className="py-2 text-center text-[13px] qg-text-muted">
                                {t({
                                  ko: "검색 결과 없음",
                                  en: "No results",
                                  ja: "結果なし",
                                  zh: "无结果",
                                  fr: "Aucun résultat",
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ApiAssignModal t={t} localeTag={localeTag} apiState={apiState} />
    </>
  );
}
