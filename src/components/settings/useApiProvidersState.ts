import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { ApiProvider } from "../../api";
import type { Agent, CompanySettings, WorkflowPackKey } from "../../types";
import type {
  ApiAssignDepartment,
  ApiAssignTarget,
  ApiFormState,
  ApiStateBundle,
  SettingsTab,
  TFunction,
} from "./types";

const DEFAULT_API_FORM: ApiFormState = {
  name: "",
  type: "openai",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  preset_key: null,
};

const VALID_WORKFLOW_PACK_KEYS = new Set<WorkflowPackKey>([
  "development",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
]);

function normalizeWorkflowPackKey(value: unknown): WorkflowPackKey {
  return typeof value === "string" && VALID_WORKFLOW_PACK_KEYS.has(value as WorkflowPackKey)
    ? (value as WorkflowPackKey)
    : "development";
}

function resolveAssignablePackKeys(settings: Pick<CompanySettings, "officePackHydratedPacks">): WorkflowPackKey[] {
  const hydrated = Array.isArray(settings.officePackHydratedPacks) ? settings.officePackHydratedPacks : [];
  const orderedKeys: WorkflowPackKey[] = ["development"];
  for (const value of hydrated) {
    const packKey = normalizeWorkflowPackKey(value);
    if (!orderedKeys.includes(packKey)) orderedKeys.push(packKey);
  }
  return orderedKeys;
}

export function useApiProvidersState({
  tab,
  t,
  settings,
}: {
  tab: SettingsTab;
  t: TFunction;
  settings: Pick<CompanySettings, "officePackHydratedPacks">;
}): ApiStateBundle {
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([]);
  const [apiProvidersLoading, setApiProvidersLoading] = useState(false);
  const [apiOfficialPresets, setApiOfficialPresets] = useState<Record<string, api.ApiProviderOfficialPreset>>({});
  const [apiPresetsLoading, setApiPresetsLoading] = useState(false);
  const [apiAddMode, setApiAddMode] = useState(false);
  const [apiEditingId, setApiEditingId] = useState<string | null>(null);
  const [apiForm, setApiForm] = useState<ApiFormState>(DEFAULT_API_FORM);
  const [apiSaving, setApiSaving] = useState(false);
  const [apiSaveError, setApiSaveError] = useState<string | null>(null);
  const [apiTesting, setApiTesting] = useState<string | null>(null);
  const [apiTestResult, setApiTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [apiModelsExpanded, setApiModelsExpanded] = useState<Record<string, boolean>>({});
  const [apiAssignTarget, setApiAssignTarget] = useState<ApiAssignTarget | null>(null);
  const [apiAssignAgents, setApiAssignAgents] = useState<Agent[]>([]);
  const [apiAssignDepts, setApiAssignDepts] = useState<ApiAssignDepartment[]>([]);
  const [apiAssigning, setApiAssigning] = useState(false);

  const apiProvidersLoadedRef = useRef(false);
  const apiPresetsLoadedRef = useRef(false);

  const loadApiProviders = useCallback(async () => {
    setApiProvidersLoading(true);
    try {
      const providers = await api.getApiProviders();
      setApiProviders(providers);
      apiProvidersLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load API providers:", error);
    } finally {
      setApiProvidersLoading(false);
    }
  }, []);

  const loadApiPresets = useCallback(async () => {
    setApiPresetsLoading(true);
    try {
      const catalog = await api.getApiProviderPresets();
      setApiOfficialPresets(catalog.official_presets ?? {});
    } catch (error) {
      console.error("Failed to load API provider presets:", error);
    } finally {
      // Stop the effect from tight-loop retrying after a failed request.
      // Users can still retry explicitly via the API tab refresh action.
      apiPresetsLoadedRef.current = true;
      setApiPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "api" && !apiProvidersLoadedRef.current && !apiProvidersLoading) {
      void loadApiProviders();
    }
    if (tab === "api" && !apiPresetsLoadedRef.current && !apiPresetsLoading) {
      void loadApiPresets();
    }
  }, [tab, apiProvidersLoading, apiPresetsLoading, loadApiProviders, loadApiPresets]);

  const handleApiProviderSave = useCallback(async () => {
    if (!apiForm.name.trim() || !apiForm.base_url.trim()) return;
    setApiSaving(true);
    setApiSaveError(null);
    try {
      if (apiEditingId) {
        await api.updateApiProvider(apiEditingId, {
          name: apiForm.name,
          type: apiForm.type,
          base_url: apiForm.base_url,
          preset_key: apiForm.preset_key,
          ...(apiForm.api_key ? { api_key: apiForm.api_key } : {}),
        });
      } else {
        await api.createApiProvider({
          name: apiForm.name,
          type: apiForm.type,
          base_url: apiForm.base_url,
          api_key: apiForm.api_key || undefined,
          preset_key: apiForm.preset_key,
        });
      }
      setApiAddMode(false);
      setApiEditingId(null);
      setApiForm(DEFAULT_API_FORM);
      await loadApiProviders();
    } catch (error) {
      console.error("API provider save failed:", error);
      setApiSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setApiSaving(false);
    }
  }, [apiEditingId, apiForm, loadApiProviders]);

  const handleApiProviderDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteApiProvider(id);
        await loadApiProviders();
      } catch (error) {
        console.error("API provider delete failed:", error);
      }
    },
    [loadApiProviders],
  );

  const handleApiProviderTest = useCallback(
    async (id: string) => {
      setApiTesting(id);
      setApiTestResult((prev) => ({ ...prev, [id]: { ok: false, msg: "" } }));
      try {
        const result = await api.testApiProvider(id);
        setApiTestResult((prev) => ({
          ...prev,
          [id]: result.ok
            ? {
                ok: true,
                msg: `${result.model_count} ${t({ ko: "개 모델 발견", en: "models found", ja: "モデル検出", zh: "个模型", fr: "modèles trouvés" })}`,
              }
            : { ok: false, msg: result.error?.slice(0, 200) || `HTTP ${result.status}` },
        }));
        if (result.ok) await loadApiProviders();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setApiTestResult((prev) => ({ ...prev, [id]: { ok: false, msg: message } }));
      } finally {
        setApiTesting(null);
      }
    },
    [loadApiProviders, t],
  );

  const handleApiProviderToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await api.updateApiProvider(id, { enabled: !enabled });
        await loadApiProviders();
      } catch (error) {
        console.error("API provider toggle failed:", error);
      }
    },
    [loadApiProviders],
  );

  const handleApiEditStart = useCallback((provider: ApiProvider) => {
    setApiEditingId(provider.id);
    setApiAddMode(true);
    setApiSaveError(null);
    setApiForm({
      name: provider.name,
      type: provider.type,
      base_url: provider.base_url,
      api_key: "",
      preset_key: provider.preset_key,
    });
  }, []);

  const handleApiModelAssign = useCallback(
    async (providerId: string, model: string) => {
      setApiAssignTarget({ providerId, model });
      try {
        const assignPackKeys = resolveAssignablePackKeys(settings);
        const [agents, deptLists] = await Promise.all([
          api.getAgents({ includeSeed: true }),
          Promise.all(
            assignPackKeys.map(async (packKey) => {
              const depts = await api.getDepartments({ workflowPackKey: packKey });
              return depts.map((dept) => ({ ...dept, workflow_pack_key: packKey }));
            }),
          ),
        ]);
        const allowedPackKeys = new Set(assignPackKeys);
        setApiAssignAgents(
          agents.filter((agent) => allowedPackKeys.has(normalizeWorkflowPackKey(agent.workflow_pack_key))),
        );
        setApiAssignDepts(deptLists.flat());
      } catch (error) {
        console.error("Failed to load agents:", error);
      }
    },
    [settings],
  );

  const handleApiAssignToAgent = useCallback(
    async (agentId: string) => {
      if (!apiAssignTarget) return;
      setApiAssigning(true);
      try {
        await api.updateAgent(agentId, {
          cli_provider: "api",
          api_provider_id: apiAssignTarget.providerId,
          api_model: apiAssignTarget.model,
        });
        setApiAssignAgents((prev) =>
          prev.map((agent) =>
            agent.id === agentId
              ? {
                  ...agent,
                  cli_provider: "api",
                  api_provider_id: apiAssignTarget.providerId,
                  api_model: apiAssignTarget.model,
                }
              : agent,
          ),
        );
      } catch (error) {
        console.error("Failed to assign API model to agent:", error);
      } finally {
        setApiAssigning(false);
      }
    },
    [apiAssignTarget],
  );

  return {
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
    apiAssignTarget,
    apiAssignAgents,
    apiAssignDepts,
    apiAssigning,
    setApiAddMode,
    setApiEditingId,
    setApiForm,
    setApiSaveError,
    setApiModelsExpanded,
    setApiAssignTarget,
    loadApiProviders,
    loadApiPresets,
    handleApiProviderSave,
    handleApiProviderDelete,
    handleApiProviderTest,
    handleApiProviderToggle,
    handleApiEditStart,
    handleApiModelAssign,
    handleApiAssignToAgent,
  };
}

export { DEFAULT_API_FORM };
