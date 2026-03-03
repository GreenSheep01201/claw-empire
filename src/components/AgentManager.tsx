import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import type { Agent, Department } from "../types";
import { useI18n } from "../i18n";
import * as api from "../api";
import { normalizeOfficeWorkflowPack } from "../app/office-workflow-pack";
import { buildSpriteMap } from "./AgentAvatar";
import AgentFormModal from "./agent-manager/AgentFormModal";
import AgentsTab from "./agent-manager/AgentsTab";
import { BLANK, ICON_SPRITE_POOL } from "./agent-manager/constants";
import DepartmentFormModal from "./agent-manager/DepartmentFormModal";
import DepartmentsTab from "./agent-manager/DepartmentsTab";
import { StackedSpriteIcon } from "./agent-manager/EmojiPicker";
import type { AgentManagerProps, FormData } from "./agent-manager/types";
import { pickRandomSpritePair } from "./agent-manager/utils";

export default function AgentManager({
  agents,
  departments,
  onAgentsChange,
  activeOfficeWorkflowPack,
  dbBackedOfficePack = false,
  onSaveOfficePackProfile,
  patrolCountMap,
}: AgentManagerProps) {
  const { t, locale } = useI18n();
  const isKo = locale.startsWith("ko");
  const tr = (ko: string, en: string) => t({ ko, en, ja: en, zh: en });
  const officePackKey = normalizeOfficeWorkflowPack(activeOfficeWorkflowPack);
  const isIsolatedPack = officePackKey !== "development";
  const useDbBackedPack = isIsolatedPack && dbBackedOfficePack;

  const [subTab, setSubTab] = useState<"agents" | "departments">("agents");
  const [search, setSearch] = useState("");
  const [deptTab, setDeptTab] = useState("all");
  const [modalAgent, setModalAgent] = useState<Agent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormData>({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deptOrder, setDeptOrder] = useState<Department[]>([]);
  const [deptOrderDirty, setDeptOrderDirty] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [draggingDeptId, setDraggingDeptId] = useState<string | null>(null);
  const [dragOverDeptId, setDragOverDeptId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);

  const persistIsolatedProfile = useCallback(
    async (nextDepartments: Department[], nextAgents: Agent[]) => {
      if (!isIsolatedPack) return;
      await onSaveOfficePackProfile(officePackKey, {
        departments: nextDepartments,
        agents: nextAgents,
        updated_at: Date.now(),
      });
    },
    [isIsolatedPack, officePackKey, onSaveOfficePackProfile],
  );

  useEffect(() => {
    setDeptOrder([...departments].sort((a, b) => a.sort_order - b.sort_order));
    setDeptOrderDirty(false);
    setDraggingDeptId(null);
    setDragOverDeptId(null);
    setDragOverPosition(null);
  }, [departments]);

  const spriteMap = buildSpriteMap(agents);
  const randomIconSprites = useMemo(
    () => ({
      tab: pickRandomSpritePair(ICON_SPRITE_POOL),
      total: pickRandomSpritePair(ICON_SPRITE_POOL),
    }),
    [],
  );

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (deptTab !== "all" && agent.department_id !== deptTab) return false;
        if (!search) return true;
        const query = search.toLowerCase();
        return (
          agent.name.toLowerCase().includes(query) ||
          agent.name_ko.toLowerCase().includes(query) ||
          (agent.name_ja || "").toLowerCase().includes(query) ||
          (agent.name_zh || "").toLowerCase().includes(query)
        );
      }),
    [agents, deptTab, search],
  );

  const sortedAgents = useMemo(() => {
    const roleOrder: Record<string, number> = { team_leader: 0, senior: 1, junior: 2, intern: 3 };
    return [...filteredAgents].sort(
      (a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name),
    );
  }, [filteredAgents]);

  const openCreate = useCallback(() => {
    setModalAgent(null);
    setForm({ ...BLANK, department_id: deptTab !== "all" ? deptTab : departments[0]?.id || "" });
    setShowModal(true);
  }, [deptTab, departments]);

  const openEdit = useCallback(
    (agent: Agent) => {
      setModalAgent(agent);
      const computed = agent.sprite_number ?? buildSpriteMap(agents).get(agent.id) ?? null;
      setForm({
        name: agent.name,
        name_ko: agent.name_ko,
        name_ja: agent.name_ja || "",
        name_zh: agent.name_zh || "",
        department_id: agent.department_id || "",
        role: agent.role,
        cli_provider: agent.cli_provider,
        avatar_emoji: agent.avatar_emoji,
        sprite_number: computed,
        personality: agent.personality || "",
      });
      setShowModal(true);
    },
    [agents],
  );

  const closeModal = useCallback(() => {
    setShowModal(false);
    setModalAgent(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const departmentId = form.department_id.trim();
      const basePayload = {
        name: form.name.trim(),
        name_ko: form.name_ko.trim(),
        name_ja: form.name_ja.trim(),
        name_zh: form.name_zh.trim(),
        role: form.role,
        cli_provider: form.cli_provider,
        avatar_emoji: form.avatar_emoji || "🤖",
        sprite_number: form.sprite_number,
        personality: form.personality.trim() || null,
      };
      if (isIsolatedPack) {
        if (useDbBackedPack) {
          if (modalAgent) {
            await api.updateAgent(modalAgent.id, {
              ...basePayload,
              department_id: departmentId || null,
              workflow_pack_key: officePackKey,
            });
            const nextAgents = agents.map((agent) =>
              agent.id === modalAgent.id
                ? {
                    ...agent,
                    ...basePayload,
                    department_id: departmentId || null,
                  }
                : agent,
            );
            await persistIsolatedProfile(departments, nextAgents);
          } else {
            const createdAgent = await api.createAgent({
              ...basePayload,
              department_id: departmentId || null,
              workflow_pack_key: officePackKey,
            });
            await persistIsolatedProfile(departments, [...agents, createdAgent]);
          }
          onAgentsChange();
        } else {
          const nextAgents = modalAgent
            ? agents.map((agent) =>
                agent.id === modalAgent.id
                  ? {
                      ...agent,
                      ...basePayload,
                      department_id: departmentId || null,
                    }
                  : agent,
              )
            : [
                ...agents,
                {
                  id:
                    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                      ? crypto.randomUUID()
                      : `agent-${Date.now()}`,
                  ...basePayload,
                  department_id: departmentId || null,
                  status: "idle" as const,
                  current_task_id: null,
                  stats_tasks_done: 0,
                  stats_xp: 0,
                  created_at: Date.now(),
                },
              ];
          await persistIsolatedProfile(departments, nextAgents);
        }
      } else {
        if (modalAgent) {
          await api.updateAgent(modalAgent.id, {
            ...basePayload,
            department_id: departmentId || null,
          });
        } else {
          await api.createAgent({
            ...basePayload,
            department_id: departmentId || null,
          });
        }
        onAgentsChange();
      }
      closeModal();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [
    agents,
    closeModal,
    departments,
    form,
    isIsolatedPack,
    modalAgent,
    onAgentsChange,
    persistIsolatedProfile,
    useDbBackedPack,
  ]);

  const handleDelete = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        if (isIsolatedPack) {
          if (useDbBackedPack) {
            await api.deleteAgent(id);
            const nextAgents = agents.filter((agent) => agent.id !== id);
            await persistIsolatedProfile(departments, nextAgents);
            onAgentsChange();
          } else {
            const nextAgents = agents.filter((agent) => agent.id !== id);
            await persistIsolatedProfile(departments, nextAgents);
          }
        } else {
          await api.deleteAgent(id);
          onAgentsChange();
        }
        setConfirmDeleteId(null);
        if (modalAgent?.id === id) closeModal();
      } catch (err) {
        console.error("Delete failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [
      agents,
      closeModal,
      departments,
      isIsolatedPack,
      modalAgent,
      onAgentsChange,
      persistIsolatedProfile,
      useDbBackedPack,
    ],
  );

  const openCreateDept = useCallback(() => {
    setEditDept(null);
    setShowDeptModal(true);
  }, []);

  const openEditDept = useCallback((department: Department) => {
    setEditDept(department);
    setShowDeptModal(true);
  }, []);

  const closeDeptModal = useCallback(() => {
    setShowDeptModal(false);
    setEditDept(null);
  }, []);

  const moveDept = useCallback(
    (index: number, direction: -1 | 1) => {
      const nextOrder = [...deptOrder];
      const target = index + direction;
      if (target < 0 || target >= nextOrder.length) return;
      [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
      setDeptOrder(nextOrder);
      setDeptOrderDirty(true);
    },
    [deptOrder],
  );

  const getDropPosition = useCallback((event: DragEvent<HTMLDivElement>): "before" | "after" => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }, []);

  const clearDeptDragState = useCallback(() => {
    setDraggingDeptId(null);
    setDragOverDeptId(null);
    setDragOverPosition(null);
  }, []);

  const moveDeptByDrag = useCallback(
    (dragDeptId: string, targetDeptId: string, position: "before" | "after") => {
      if (dragDeptId === targetDeptId) return;
      const fromIndex = deptOrder.findIndex((department) => department.id === dragDeptId);
      const targetIndex = deptOrder.findIndex((department) => department.id === targetDeptId);
      if (fromIndex < 0 || targetIndex < 0) return;

      const nextOrder = [...deptOrder];
      const [dragged] = nextOrder.splice(fromIndex, 1);
      let insertIndex = targetIndex + (position === "after" ? 1 : 0);
      if (fromIndex < insertIndex) insertIndex -= 1;
      insertIndex = Math.max(0, Math.min(insertIndex, nextOrder.length));
      nextOrder.splice(insertIndex, 0, dragged);

      const changed = nextOrder.some((department, i) => department.id !== deptOrder[i]?.id);
      if (!changed) return;
      setDeptOrder(nextOrder);
      setDeptOrderDirty(true);
    },
    [deptOrder],
  );

  const saveDeptOrder = useCallback(async () => {
    setReorderSaving(true);
    try {
      const nextDepartments = deptOrder.map((department, index) => ({
        ...department,
        sort_order: index + 1,
      }));
      if (isIsolatedPack) {
        if (useDbBackedPack) {
          const orders = nextDepartments.map((department) => ({
            id: department.id,
            sort_order: department.sort_order,
          }));
          await api.reorderDepartments(orders, { workflowPackKey: officePackKey });
          await persistIsolatedProfile(nextDepartments, agents);
          onAgentsChange();
        } else {
          await persistIsolatedProfile(nextDepartments, agents);
        }
      } else {
        const orders = nextDepartments.map((department) => ({ id: department.id, sort_order: department.sort_order }));
        await api.reorderDepartments(orders);
        onAgentsChange();
      }
      setDeptOrderDirty(false);
    } catch (err) {
      console.error("Reorder failed:", err);
    } finally {
      setReorderSaving(false);
    }
  }, [agents, deptOrder, isIsolatedPack, onAgentsChange, persistIsolatedProfile, useDbBackedPack]);

  const resetDeptOrder = useCallback(() => {
    setDeptOrder([...departments].sort((a, b) => a.sort_order - b.sort_order));
    setDeptOrderDirty(false);
  }, [departments]);

  const handleDeptDragStart = useCallback((deptId: string, event: DragEvent<HTMLDivElement>) => {
    setDraggingDeptId(deptId);
    setDragOverDeptId(null);
    setDragOverPosition(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", deptId);
  }, []);

  const handleDeptDragOver = useCallback(
    (deptId: string, event: DragEvent<HTMLDivElement>) => {
      if (!draggingDeptId || draggingDeptId === deptId) return;
      event.preventDefault();
      const nextPosition = getDropPosition(event);
      if (dragOverDeptId !== deptId || dragOverPosition !== nextPosition) {
        setDragOverDeptId(deptId);
        setDragOverPosition(nextPosition);
      }
      event.dataTransfer.dropEffect = "move";
    },
    [dragOverDeptId, dragOverPosition, draggingDeptId, getDropPosition],
  );

  const handleDeptDrop = useCallback(
    (deptId: string, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const droppedId = event.dataTransfer.getData("text/plain") || draggingDeptId;
      if (droppedId && droppedId !== deptId) {
        moveDeptByDrag(droppedId, deptId, getDropPosition(event));
      }
      clearDeptDragState();
    },
    [clearDeptDragState, draggingDeptId, getDropPosition, moveDeptByDrag],
  );

  const handleIsolatedDepartmentSave = useCallback(
    async (input: {
      mode: "create" | "update";
      id: string;
      payload: {
        name: string;
        name_ko: string;
        name_ja: string | null;
        name_zh: string | null;
        icon: string;
        color: string;
        description: string | null;
        prompt: string | null;
        sort_order: number;
      };
    }) => {
      if (!isIsolatedPack) return;
      const nextDepartments =
        input.mode === "create"
          ? [
              ...departments,
              {
                id: input.id,
                name: input.payload.name,
                name_ko: input.payload.name_ko,
                name_ja: input.payload.name_ja,
                name_zh: input.payload.name_zh,
                icon: input.payload.icon,
                color: input.payload.color,
                description: input.payload.description,
                prompt: input.payload.prompt,
                sort_order: input.payload.sort_order,
                created_at: Date.now(),
              },
            ]
          : departments.map((department) =>
              department.id === input.id
                ? {
                    ...department,
                    name: input.payload.name,
                    name_ko: input.payload.name_ko,
                    name_ja: input.payload.name_ja,
                    name_zh: input.payload.name_zh,
                    icon: input.payload.icon,
                    color: input.payload.color,
                    description: input.payload.description,
                    prompt: input.payload.prompt,
                    sort_order: input.payload.sort_order,
                  }
                : department,
            );
      await persistIsolatedProfile(nextDepartments, agents);
    },
    [agents, departments, isIsolatedPack, persistIsolatedProfile],
  );

  const handleIsolatedDepartmentDelete = useCallback(
    async (departmentId: string) => {
      if (!isIsolatedPack) return;
      const filteredDepartments = departments
        .filter((department) => department.id !== departmentId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((department, index) => ({
          ...department,
          sort_order: index + 1,
        }));
      const nextAgents = agents.map((agent) =>
        agent.department_id === departmentId
          ? {
              ...agent,
              department_id: null,
            }
          : agent,
      );
      await persistIsolatedProfile(filteredDepartments, nextAgents);
    },
    [agents, departments, isIsolatedPack, persistIsolatedProfile],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={openCreateDept}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 active:opacity-80 shadow-sm"
          style={{ background: "#7c3aed", color: "#ffffff", boxShadow: "0 1px 3px rgba(124,58,237,0.3)" }}
        >
          + {tr("부서 추가", "Add Dept")}
        </button>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-sm shadow-blue-600/20"
        >
          + {tr("신규 채용", "Hire Agent")}
        </button>
      </div>

      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        {[
          {
            key: "agents" as const,
            label: tr("직원관리", "Agents"),
            icon: <StackedSpriteIcon sprites={randomIconSprites.tab} />,
          },
          { key: "departments" as const, label: tr("부서관리", "Departments"), icon: "🏢" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === tab.key ? "bg-blue-600 text-white shadow-sm" : "hover:bg-white/5"
            }`}
            style={subTab !== tab.key ? { color: "var(--th-text-muted)" } : undefined}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "agents" && (
        <AgentsTab
          tr={tr}
          locale={locale}
          isKo={isKo}
          agents={agents}
          departments={departments}
          deptTab={deptTab}
          setDeptTab={setDeptTab}
          search={search}
          setSearch={setSearch}
          sortedAgents={sortedAgents}
          spriteMap={spriteMap}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
          onEditAgent={openEdit}
          onEditDepartment={openEditDept}
          onDeleteAgent={handleDelete}
          saving={saving}
          randomIconSprites={{ total: randomIconSprites.total }}
          patrolCountMap={patrolCountMap}
        />
      )}

      {subTab === "departments" && (
        <DepartmentsTab
          tr={tr}
          locale={locale}
          agents={agents}
          departments={departments}
          deptOrder={deptOrder}
          deptOrderDirty={deptOrderDirty}
          reorderSaving={reorderSaving}
          draggingDeptId={draggingDeptId}
          dragOverDeptId={dragOverDeptId}
          dragOverPosition={dragOverPosition}
          onSaveOrder={saveDeptOrder}
          onCancelOrder={resetDeptOrder}
          onMoveDept={moveDept}
          onEditDept={openEditDept}
          onDragStart={handleDeptDragStart}
          onDragOver={handleDeptDragOver}
          onDrop={handleDeptDrop}
          onDragEnd={clearDeptDragState}
        />
      )}

      {showModal && (
        <AgentFormModal
          isKo={isKo}
          locale={locale}
          tr={tr}
          form={form}
          setForm={setForm}
          departments={departments}
          isEdit={!!modalAgent}
          saving={saving}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {showDeptModal && (
        <DepartmentFormModal
          locale={locale}
          tr={tr}
          department={editDept}
          departments={departments}
          workflowPackKey={isIsolatedPack ? officePackKey : undefined}
          onSave={() => {
            if (!isIsolatedPack || useDbBackedPack) onAgentsChange();
          }}
          onSaveDepartment={isIsolatedPack && !useDbBackedPack ? handleIsolatedDepartmentSave : undefined}
          onDeleteDepartment={isIsolatedPack && !useDbBackedPack ? handleIsolatedDepartmentDelete : undefined}
          onClose={closeDeptModal}
        />
      )}
    </div>
  );
}
