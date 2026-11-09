import type { RefObject } from "react";
import type { SkillLearnProvider } from "../../api";
import type { Agent } from "../../types";
import AgentAvatar from "../AgentAvatar";
import Dialog from "../ui/Dialog";
import { providerLabel, type TFunction } from "./model";

interface CustomSkillModalProps {
  t: TFunction;
  show: boolean;
  agents: Agent[];
  representatives: Array<{ provider: SkillLearnProvider; agent: Agent | null }>;
  preferKoreanName: boolean;
  customSkillName: string;
  setCustomSkillName: (value: string) => void;
  customSkillContent: string;
  customSkillFileName: string;
  customSkillProviders: SkillLearnProvider[];
  customSkillSubmitting: boolean;
  customSkillError: string | null;
  customFileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleProvider: (provider: SkillLearnProvider) => void;
  onSubmit: () => void;
}

export default function CustomSkillModal({
  t,
  show,
  agents,
  representatives,
  preferKoreanName,
  customSkillName,
  setCustomSkillName,
  customSkillContent,
  customSkillFileName,
  customSkillProviders,
  customSkillSubmitting,
  customSkillError,
  customFileInputRef,
  onClose,
  onFileSelect,
  onToggleProvider,
  onSubmit,
}: CustomSkillModalProps) {
  if (!show) return null;

  return (
    <Dialog
      className="custom-skill-modal-card"
      open
      size="md"
      onClose={onClose}
      closeLabel={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭", fr: "Fermer" })}
      title={t({
        ko: "커스텀 스킬 추가",
        en: "Add Custom Skill",
        ja: "カスタムスキル追加",
        zh: "添加自定义技能",
        fr: "Ajouter une compétence personnalisée",
      })}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={customSkillSubmitting}
            className="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300 hover:bg-slate-800 transition-all"
          >
            {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
          </button>
          <button
            onClick={onSubmit}
            disabled={
              !customSkillName.trim() ||
              !customSkillContent.trim() ||
              customSkillProviders.length === 0 ||
              customSkillSubmitting
            }
            className={`custom-skill-submit-btn px-4 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
              !customSkillName.trim() || !customSkillContent.trim() || customSkillProviders.length === 0
                ? "cursor-not-allowed border-slate-700 text-slate-600"
                : "border-violet-500/50 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
            }`}
          >
            {customSkillSubmitting ? (
              <>
                <span className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
                {t({ ko: "등록중...", en: "Submitting...", ja: "登録中...", zh: "提交中..." })}
              </>
            ) : (
              <>
                <span>🎓</span>
                {t({ ko: "학습 시작", en: "Start Training", ja: "学習開始", zh: "开始培训" })}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-xs text-slate-400">
          {t({
            ko: "skills.md 파일을 첨부하고 CLI 대표자를 선택하세요",
            en: "Attach a skills.md file and select CLI representatives",
            ja: "skills.md ファイルを添付し、CLI代表を選択してください",
            zh: "附加 skills.md 文件并选择 CLI 代表",
          })}
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            {t({ ko: "스킬명", en: "Skill Name", ja: "スキル名", zh: "技能名称" })}
          </label>
          <input
            type="text"
            value={customSkillName}
            onChange={(e) => setCustomSkillName(e.target.value)}
            placeholder={t({
              ko: "예: my-custom-skill",
              en: "e.g. my-custom-skill",
              ja: "例: my-custom-skill",
              zh: "例如: my-custom-skill",
            })}
            className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25"
          />
          <div className="text-[10px] text-slate-500 mt-1">
            {t({
              ko: "영문, 숫자, 하이픈(-), 언더스코어(_)만 사용 가능",
              en: "Only alphanumeric, dash (-), underscore (_) allowed",
              ja: "英数字、ハイフン(-)、アンダースコア(_)のみ使用可能",
              zh: "仅允许字母数字、短划线(-)或下划线(_)",
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            {t({ ko: "skills.md 파일", en: "skills.md File", ja: "skills.md ファイル", zh: "skills.md 文件" })}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => customFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-300 hover:bg-slate-700/60 transition-all"
            >
              <span>📎</span>
              {t({ ko: "파일 선택", en: "Choose File", ja: "ファイル選択", zh: "选择文件" })}
            </button>
            <input
              ref={customFileInputRef}
              type="file"
              accept=".md,.txt,.markdown"
              onChange={onFileSelect}
              className="hidden"
            />
            {customSkillFileName && (
              <span className="text-xs text-emerald-300 truncate max-w-[200px]">📄 {customSkillFileName}</span>
            )}
          </div>
          {customSkillContent && (
            <div className="mt-2 rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 max-h-32 overflow-y-auto">
              <pre className="text-[10px] text-slate-400 whitespace-pre-wrap break-all">
                {customSkillContent.slice(0, 500)}
                {customSkillContent.length > 500 && "..."}
              </pre>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            {t({
              ko: "학습시킬 CLI 대표자",
              en: "CLI Representatives to Train",
              ja: "学習させるCLI代表",
              zh: "要培训的 CLI 代表",
            })}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {representatives.map((row) => {
              const isSelected = customSkillProviders.includes(row.provider);
              const hasAgent = !!row.agent;
              const displayName = row.agent
                ? preferKoreanName
                  ? row.agent.name_ko || row.agent.name
                  : row.agent.name || row.agent.name_ko
                : t({ ko: "없음", en: "None", ja: "なし", zh: "无" });
              return (
                <button
                  key={`custom-${row.provider}`}
                  onClick={() => hasAgent && onToggleProvider(row.provider)}
                  disabled={!hasAgent}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                    !hasAgent
                      ? "cursor-not-allowed border-slate-700/60 bg-slate-800/30 opacity-50"
                      : isSelected
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-slate-700/60 bg-slate-800/50 hover:border-slate-500/70"
                  }`}
                >
                  <AgentAvatar agent={row.agent ?? undefined} agents={agents} size={32} rounded="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-500">{providerLabel(row.provider)}</div>
                    <div className="text-xs text-white truncate">{displayName}</div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                      isSelected
                        ? "border-violet-400 bg-violet-500/30 text-violet-200"
                        : "border-slate-600 bg-slate-800/60"
                    }`}
                  >
                    {isSelected && "✓"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {customSkillError && (
          <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {customSkillError}
          </div>
        )}
      </div>
    </Dialog>
  );
}
