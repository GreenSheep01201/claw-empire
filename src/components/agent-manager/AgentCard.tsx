import type { Agent, Department } from "../../types";
import { X } from "lucide-react";
import { localeName } from "../../i18n";
import AgentAvatar from "../AgentAvatar";
import { ROLE_BADGE, ROLE_LABEL, STATUS_DOT, STATUS_LABEL } from "./constants";
import type { Translator } from "./types";

interface AgentCardProps {
  agent: Agent;
  spriteMap: Map<string, number>;
  isKo: boolean;
  locale: string;
  tr: Translator;
  departments: Department[];
  onEdit: () => void;
  confirmDeleteId: string | null;
  onDeleteClick: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  saving: boolean;
}

export default function AgentCard({
  agent,
  spriteMap,
  locale,
  tr,
  departments,
  onEdit,
  confirmDeleteId,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
  saving,
}: AgentCardProps) {
  const isDeleting = confirmDeleteId === agent.id;
  const dept = departments.find((d) => d.id === agent.department_id);

  const name = localeName(locale, agent);
  const subName = (() => {
    const sub = locale === "en" ? agent.name_ko || "" : agent.name;
    return name !== sub ? sub : "";
  })();
  const role = ROLE_LABEL[agent.role];
  const status = STATUS_LABEL[agent.status] ?? STATUS_LABEL.idle;

  return (
    <div onClick={onEdit} className="qg-card group cursor-pointer transition-colors hover:border-[var(--qg-accent)]">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <AgentAvatar agent={agent} spriteMap={spriteMap} size={44} rounded="xl" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-sm truncate" style={{ color: "var(--th-text-heading)" }}>
              {name}
            </span>
            {subName && <span className="text-[13px] shrink-0 truncate qg-text-muted">{subName}</span>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] qg-text-secondary">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[agent.status] ?? STATUS_DOT.idle}`}
            />
            {tr(status.ko, status.en, status.fr)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={ROLE_BADGE[agent.role] || "qg-badge"}>
              {role ? tr(role.ko, role.en, role.fr) : agent.role}
            </span>
            {dept && (
              <span className="qg-badge">
                <span aria-hidden="true">{dept.icon}</span> {localeName(locale, dept)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 mt-3 pt-2.5"
        style={{ borderTop: "1px solid var(--th-border)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="qg-badge font-mono">{agent.cli_provider}</span>
          {agent.personality && (
            <span className="text-[13px] truncate max-w-[120px] qg-text-muted" title={agent.personality}>
              {agent.personality}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {isDeleting ? (
            <>
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={saving || agent.status === "working"}
                className="qg-btn qg-btn--sm qg-btn--danger"
              >
                {tr("해고", "Fire", "Retirer")}
              </button>
              <button type="button" onClick={onDeleteCancel} className="qg-btn qg-btn--sm qg-btn--ghost">
                {tr("취소", "No", "Annuler")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDeleteClick}
              className="qg-icon-btn qg-btn--ghost"
              style={{ width: 32, height: 32 }}
              aria-label={tr("해고", "Fire", "Retirer l'agent")}
              title={tr("해고", "Fire", "Retirer l'agent")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
