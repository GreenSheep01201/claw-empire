import type { DragEvent } from "react";
import type { Agent, Department } from "../../types";
import { Building2, ChevronDown, ChevronUp, GripVertical, Pencil } from "lucide-react";
import { localeName } from "../../i18n";
import type { Translator } from "./types";

interface DepartmentsTabProps {
  tr: Translator;
  locale: string;
  agents: Agent[];
  departments: Department[];
  deptOrder: Department[];
  deptOrderDirty: boolean;
  reorderSaving: boolean;
  draggingDeptId: string | null;
  dragOverDeptId: string | null;
  dragOverPosition: "before" | "after" | null;
  onSaveOrder: () => void;
  onCancelOrder: () => void;
  onMoveDept: (index: number, direction: -1 | 1) => void;
  onEditDept: (department: Department) => void;
  onDragStart: (deptId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (deptId: string, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (deptId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export default function DepartmentsTab({
  tr,
  locale,
  agents,
  departments,
  deptOrder,
  deptOrderDirty,
  reorderSaving,
  draggingDeptId,
  dragOverDeptId,
  dragOverPosition,
  onSaveOrder,
  onCancelOrder,
  onMoveDept,
  onEditDept,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: DepartmentsTabProps) {
  return (
    <div className="space-y-4">
      {deptOrderDirty && (
        <div className="qg-card flex flex-wrap items-center gap-3" style={{ borderColor: "var(--qg-accent)" }}>
          <span className="text-sm" style={{ color: "var(--th-text-primary)" }}>
            {tr("순번이 변경되었습니다.", "Order has been changed.", "L'ordre des pôles a changé.")}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onCancelOrder} className="qg-btn qg-btn--sm qg-btn--ghost">
              {tr("취소", "Cancel", "Annuler")}
            </button>
            <button
              type="button"
              onClick={onSaveOrder}
              disabled={reorderSaving}
              className="qg-btn qg-btn--sm qg-btn--primary"
            >
              {reorderSaving
                ? tr("저장 중...", "Saving...", "Enregistrement…")
                : tr("순번 저장", "Save Order", "Enregistrer l'ordre")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {deptOrder.map((dept, index) => {
          const agentCountForDept = agents.filter((agent) => agent.department_id === dept.id).length;
          const isDragging = draggingDeptId === dept.id;
          const isDragTarget = dragOverDeptId === dept.id && draggingDeptId !== dept.id;
          const showDropBefore = isDragTarget && dragOverPosition === "before";
          const showDropAfter = isDragTarget && dragOverPosition === "after";
          const name = localeName(locale, dept);
          return (
            <div
              key={dept.id}
              draggable
              onDragStart={(e) => onDragStart(dept.id, e)}
              onDragOver={(e) => onDragOver(dept.id, e)}
              onDrop={(e) => onDrop(dept.id, e)}
              onDragEnd={onDragEnd}
              className={`qg-card relative flex items-center gap-3 group ${isDragging ? "opacity-60" : ""}`}
              style={{ borderLeft: `4px solid ${dept.color}` }}
            >
              {showDropBefore && (
                <div
                  className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded"
                  style={{ background: "var(--qg-accent)" }}
                />
              )}
              {showDropAfter && (
                <div
                  className="pointer-events-none absolute left-2 right-2 bottom-0 h-0.5 rounded"
                  style={{ background: "var(--qg-accent)" }}
                />
              )}

              <GripVertical
                size={16}
                aria-hidden="true"
                className="hidden shrink-0 cursor-grab qg-text-muted sm:block"
              />

              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveDept(index, -1)}
                  disabled={index === 0}
                  className="qg-icon-btn qg-btn--ghost"
                  style={{ width: 28, height: 24 }}
                  aria-label={tr(`${name} 위로 이동`, `Move ${name} up`, `Monter ${name}`)}
                >
                  <ChevronUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDept(index, 1)}
                  disabled={index === deptOrder.length - 1}
                  className="qg-icon-btn qg-btn--ghost"
                  style={{ width: 28, height: 24 }}
                  aria-label={tr(`${name} 아래로 이동`, `Move ${name} down`, `Descendre ${name}`)}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              </div>

              <span className="qg-count tabular-nums">{index + 1}</span>

              <span className="text-2xl" aria-hidden="true">
                {dept.icon}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: "var(--th-text-heading)" }}>
                    {name}
                  </span>
                  <span className="qg-badge">
                    {agentCountForDept} {tr("명", "agents", agentCountForDept > 1 ? "agents" : "agent")}
                  </span>
                </div>
                {dept.description && (
                  <div className="text-[13px] mt-0.5 truncate qg-text-muted">{dept.description}</div>
                )}
              </div>

              <code className="hidden text-[13px] qg-text-muted sm:inline">{dept.id}</code>

              <button
                type="button"
                onClick={() => onEditDept(dept)}
                className="qg-btn qg-btn--sm qg-btn--ghost sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <Pencil size={16} aria-hidden="true" />
                {tr("편집", "Edit", "Modifier")}
              </button>
            </div>
          );
        })}
      </div>

      {deptOrder.length === 0 && (
        <div className="qg-empty flex flex-col items-center gap-2">
          <Building2 size={28} aria-hidden="true" />
          {tr("등록된 부서가 없습니다.", "No departments found.", "Aucun pôle pour le moment.")}
        </div>
      )}
    </div>
  );
}
