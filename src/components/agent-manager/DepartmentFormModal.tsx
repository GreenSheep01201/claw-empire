import { useState } from "react";
import { Check } from "lucide-react";
import type { Department, WorkflowPackKey } from "../../types";
import { useI18n } from "../../i18n";
import * as api from "../../api";
import { DEPT_BLANK, DEPT_COLORS } from "./constants";
import EmojiPicker from "./EmojiPicker";
import type { DeptForm, Translator } from "./types";
import Dialog from "../ui/Dialog";

export default function DepartmentFormModal({
  locale,
  department,
  departments,
  onSave,
  onClose,
  onSaveDepartment,
  onDeleteDepartment,
  workflowPackKey,
}: {
  locale: string;
  tr: Translator;
  department: Department | null;
  departments: Department[];
  onSave: () => void;
  onClose: () => void;
  onSaveDepartment?: (input: {
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
  }) => Promise<void>;
  onDeleteDepartment?: (departmentId: string) => Promise<void>;
  workflowPackKey?: WorkflowPackKey;
}) {
  const { t } = useI18n();
  const tr = (ko: string, en: string, fr?: string) => t({ ko, en, ja: en, zh: en, fr });
  const isEdit = !!department;
  const [form, setForm] = useState<DeptForm>(() => {
    if (department) {
      return {
        id: department.id,
        name: department.name,
        name_ko: department.name_ko || "",
        name_ja: department.name_ja || "",
        name_zh: department.name_zh || "",
        icon: department.icon,
        color: department.color,
        description: department.description || "",
        prompt: department.prompt || "",
      };
    }
    return { ...DEPT_BLANK };
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // sort_order 기반 다음 순번 계산
  const nextSortOrder = (() => {
    const orders = departments.map((d) => d.sort_order).filter((n) => typeof n === "number" && !isNaN(n));
    return Math.max(0, ...orders) + 1;
  })();

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        name_ko: form.name_ko.trim(),
        name_ja: form.name_ja.trim() || null,
        name_zh: form.name_zh.trim() || null,
        icon: form.icon,
        color: form.color,
        description: form.description.trim() || null,
        prompt: form.prompt.trim() || null,
        sort_order: department?.sort_order ?? nextSortOrder,
      };
      if (isEdit) {
        if (onSaveDepartment) {
          await onSaveDepartment({
            mode: "update",
            id: department!.id,
            payload: { ...payload, sort_order: department!.sort_order },
          });
        } else {
          await api.updateDepartment(department!.id, {
            name: payload.name,
            name_ko: payload.name_ko,
            name_ja: payload.name_ja,
            name_zh: payload.name_zh,
            icon: payload.icon,
            color: payload.color,
            description: payload.description,
            prompt: payload.prompt,
            workflow_pack_key: workflowPackKey,
          });
        }
      } else {
        // name 기반 slug 생성, 비라틴 문자만인 경우 dept-N fallback
        const slug = form.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        let deptId = slug || `dept-${nextSortOrder}`;
        // 기존 ID와 충돌 시 숫자 접미사 추가
        const existingIds = new Set(departments.map((d) => d.id));
        let suffix = 2;
        while (existingIds.has(deptId)) {
          deptId = `${slug || "dept"}-${suffix++}`;
        }
        if (onSaveDepartment) {
          await onSaveDepartment({
            mode: "create",
            id: deptId,
            payload: { ...payload, sort_order: nextSortOrder },
          });
        } else {
          await api.createDepartment({
            id: deptId,
            name: payload.name,
            name_ko: payload.name_ko,
            name_ja: payload.name_ja ?? "",
            name_zh: payload.name_zh ?? "",
            icon: payload.icon,
            color: payload.color,
            description: payload.description ?? undefined,
            prompt: payload.prompt ?? undefined,
            workflow_pack_key: workflowPackKey,
          });
        }
      }
      onSave();
      onClose();
    } catch (e: any) {
      console.error("Dept save failed:", e);
      if (api.isApiRequestError(e) && e.code === "department_id_exists") {
        alert(
          tr("이미 존재하는 부서 ID입니다.", "Department ID already exists.", "Cet identifiant de pôle existe déjà."),
        );
      } else if (api.isApiRequestError(e) && e.code === "sort_order_conflict") {
        alert(
          tr(
            "부서 정렬 순서가 충돌합니다. 잠시 후 다시 시도해주세요.",
            "Department sort order conflict. Please retry.",
            "Conflit d'ordre entre les pôles. Réessayez dans un instant.",
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      if (onDeleteDepartment) {
        await onDeleteDepartment(department!.id);
      } else {
        await api.deleteDepartment(department!.id, { workflowPackKey });
      }
      onSave();
      onClose();
    } catch (e: any) {
      console.error("Dept delete failed:", e);
      if (api.isApiRequestError(e) && e.code === "department_has_agents") {
        alert(
          tr(
            "소속 직원이 있어 삭제할 수 없습니다.",
            "Cannot delete: department has agents.",
            "Suppression impossible : ce pôle contient des agents.",
          ),
        );
      } else if (api.isApiRequestError(e) && e.code === "department_has_tasks") {
        alert(
          tr(
            "연결된 업무(Task)가 있어 삭제할 수 없습니다.",
            "Cannot delete: department has tasks.",
            "Suppression impossible : des tâches sont liées à ce pôle.",
          ),
        );
      } else if (api.isApiRequestError(e) && e.code === "department_protected") {
        alert(
          tr(
            "기본 시스템 부서는 삭제할 수 없습니다.",
            "Cannot delete: protected system department.",
            "Suppression impossible : pôle système protégé.",
          ),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      size="md"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={
        isEdit
          ? t({ ko: "부서 정보 수정", en: "Edit Department", fr: "Modifier le pôle" })
          : t({ ko: "신규 부서 추가", en: "Add Department", fr: "Ajouter un pôle" })
      }
    >
      <div className="space-y-4">
        {/* 아이콘 + 영문이름 */}
        <div className="flex items-start gap-3">
          <div className="qg-field">
            <span className="qg-field__label">{tr("아이콘", "Icon", "Icône")}</span>
            <EmojiPicker tr={tr} value={form.icon} onChange={(emoji) => setForm({ ...form, icon: emoji })} />
          </div>
          <div className="qg-field flex-1">
            <label className="qg-field__label" htmlFor="dept-form-name">
              {tr("영문 이름", "Name", "Nom")} <span aria-hidden="true">*</span>
            </label>
            <input
              id="dept-form-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Development"
              className="qg-input"
            />
          </div>
        </div>

        {/* 색상 선택 */}
        <div className="qg-field">
          <span className="qg-field__label" id="dept-form-color-label">
            {tr("테마 색상", "Theme Color", "Couleur")}
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="dept-form-color-label">
            {DEPT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={form.color === c}
                aria-label={c}
                onClick={() => setForm({ ...form, color: c })}
                className="w-7 h-7 rounded-full transition-all hover:scale-110 flex items-center justify-center"
                style={{
                  background: c,
                  outline: form.color === c ? `2px solid ${c}` : "2px solid transparent",
                  outlineOffset: "3px",
                  color: "#fff",
                }}
              >
                {form.color === c && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        {/* 로캘 이름 */}
        {locale.startsWith("ko") && (
          <div className="qg-field">
            <label className="qg-field__label" htmlFor="dept-form-name-ko">
              {tr("한글 이름", "Korean Name", "Nom en coréen")}
            </label>
            <input
              id="dept-form-name-ko"
              type="text"
              value={form.name_ko}
              onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
              placeholder="개발팀"
              className="qg-input"
            />
          </div>
        )}
        {locale.startsWith("ja") && (
          <div className="qg-field">
            <label className="qg-field__label" htmlFor="dept-form-name-ja">
              {t({ ko: "일본어 이름", en: "Japanese Name", ja: "日本語名", zh: "日语名", fr: "Nom en japonais" })}
            </label>
            <input
              id="dept-form-name-ja"
              type="text"
              value={form.name_ja}
              onChange={(e) => setForm({ ...form, name_ja: e.target.value })}
              placeholder="開発チーム"
              className="qg-input"
            />
          </div>
        )}
        {locale.startsWith("zh") && (
          <div className="qg-field">
            <label className="qg-field__label" htmlFor="dept-form-name-zh">
              {t({ ko: "중국어 이름", en: "Chinese Name", ja: "中国語名", zh: "中文名", fr: "Nom en chinois" })}
            </label>
            <input
              id="dept-form-name-zh"
              type="text"
              value={form.name_zh}
              onChange={(e) => setForm({ ...form, name_zh: e.target.value })}
              placeholder="开发部"
              className="qg-input"
            />
          </div>
        )}

        {/* 설명 */}
        <div className="qg-field">
          <label className="qg-field__label" htmlFor="dept-form-description">
            {tr("부서 설명", "Description", "Description")}
          </label>
          <input
            id="dept-form-description"
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={tr(
              "부서의 역할 간단 설명",
              "Brief description of the department",
              "Rôle du pôle en quelques mots",
            )}
            className="qg-input"
          />
        </div>

        {/* 프롬프트 */}
        <div className="qg-field">
          <label className="qg-field__label" htmlFor="dept-form-prompt">
            {tr("부서 프롬프트", "Department Prompt", "Consignes du pôle")}
          </label>
          <textarea
            id="dept-form-prompt"
            aria-describedby="dept-form-prompt-hint"
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            rows={4}
            placeholder={tr(
              "이 부서 소속 에이전트의 공통 시스템 프롬프트...",
              "Shared system prompt for agents in this department...",
              "Consignes communes aux agents de ce pôle…",
            )}
            className="qg-textarea"
          />
          <p className="qg-field__hint" id="dept-form-prompt-hint">
            {tr(
              "소속 에이전트의 작업 실행 시 공통으로 적용되는 시스템 프롬프트",
              "Applied as shared system prompt when agents in this department execute tasks",
              "Appliquées à chaque agent du pôle lorsqu'il exécute une tâche",
            )}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--th-border)" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="qg-btn qg-btn--primary flex-1"
        >
          {saving
            ? tr("처리 중...", "Saving...", "Enregistrement…")
            : isEdit
              ? tr("변경사항 저장", "Save Changes", "Enregistrer")
              : tr("부서 추가", "Add Department", "Ajouter le pôle")}
        </button>
        {isEdit &&
          (confirmDelete ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleDelete} disabled={saving} className="qg-btn qg-btn--danger">
                {tr("삭제 확인", "Confirm", "Confirmer")}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="qg-btn qg-btn--ghost">
                {tr("취소", "No", "Non")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="qg-btn qg-btn--danger">
              {tr("삭제", "Delete", "Supprimer")}
            </button>
          ))}
        <button type="button" onClick={onClose} className="qg-btn">
          {tr("취소", "Cancel", "Annuler")}
        </button>
      </div>
    </Dialog>
  );
}
