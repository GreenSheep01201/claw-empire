import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteCustomSkill,
  getCustomSkills,
  uploadCustomSkill,
  type CustomSkillEntry,
  type SkillLearnProvider,
} from "../../api";
import type { TFunction } from "./model";

export function useCustomSkillsState({
  defaultSelectedProviders,
  t,
  onHistoryChanged,
}: {
  defaultSelectedProviders: SkillLearnProvider[];
  t: TFunction;
  onHistoryChanged: () => void;
}) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customSkillName, setCustomSkillName] = useState("");
  const [customSkillContent, setCustomSkillContent] = useState("");
  const [customSkillFileName, setCustomSkillFileName] = useState("");
  const [customSkillProviders, setCustomSkillProviders] = useState<SkillLearnProvider[]>([]);
  const [customSkillSubmitting, setCustomSkillSubmitting] = useState(false);
  const [customSkillError, setCustomSkillError] = useState<string | null>(null);
  const [customSkills, setCustomSkills] = useState<CustomSkillEntry[]>([]);
  const [showClassroomAnimation, setShowClassroomAnimation] = useState(false);
  const [classroomAnimSkillName, setClassroomAnimSkillName] = useState("");
  const [classroomAnimProviders, setClassroomAnimProviders] = useState<SkillLearnProvider[]>([]);
  const customFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCustomSkills()
      .then(setCustomSkills)
      .catch(() => setCustomSkills([]));
  }, []);

  const openCustomSkillModal = useCallback(() => {
    setCustomSkillName("");
    setCustomSkillContent("");
    setCustomSkillFileName("");
    setCustomSkillProviders(defaultSelectedProviders);
    setCustomSkillError(null);
    setShowCustomModal(true);
  }, [defaultSelectedProviders]);

  const closeCustomSkillModal = useCallback(() => {
    if (customSkillSubmitting) return;
    setShowCustomModal(false);
  }, [customSkillSubmitting]);

  const handleCustomFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomSkillFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCustomSkillContent(reader.result as string);
    };
    reader.onerror = () => {
      setCustomSkillError("ファイルの読み込みに失敗しました");
    };
    reader.readAsText(file);
  }, []);

  const toggleCustomProvider = useCallback((provider: SkillLearnProvider) => {
    setCustomSkillProviders((prev) =>
      prev.includes(provider) ? prev.filter((item) => item !== provider) : [...prev, provider],
    );
  }, []);

  const handleCustomSkillSubmit = useCallback(async () => {
    if (!customSkillName.trim() || !customSkillContent.trim() || customSkillProviders.length === 0) return;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(customSkillName.trim())) {
      setCustomSkillError(
        t({
          ko: "스킬명은 영문, 숫자, 하이픈, 언더스코어만 사용 가능합니다 (최대 80자)",
          en: "Skill name must be alphanumeric, dash or underscore (max 80 chars)",
          ja: "スキル名は英数字、ハイフン、アンダースコアのみ使用可能です（最大80文字）",
          zh: "技能名称仅限字母数字、短划线或下划线（最多80个字符）",
        }),
      );
      return;
    }

    setCustomSkillSubmitting(true);
    setCustomSkillError(null);
    try {
      await uploadCustomSkill({
        skillName: customSkillName.trim(),
        content: customSkillContent,
        providers: customSkillProviders,
      });
      setClassroomAnimSkillName(customSkillName.trim());
      setClassroomAnimProviders(customSkillProviders);
      setShowCustomModal(false);
      setShowClassroomAnimation(true);
      getCustomSkills()
        .then(setCustomSkills)
        .catch(() => {});
      onHistoryChanged();
      setTimeout(() => setShowClassroomAnimation(false), 5500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setCustomSkillError(msg);
    } finally {
      setCustomSkillSubmitting(false);
    }
  }, [customSkillContent, customSkillName, customSkillProviders, onHistoryChanged, t]);

  const handleDeleteCustomSkill = useCallback(
    async (skillName: string) => {
      try {
        await deleteCustomSkill(skillName);
        setCustomSkills((prev) => prev.filter((skill) => skill.skillName !== skillName));
        onHistoryChanged();
      } catch {
        // ignore
      }
    },
    [onHistoryChanged],
  );

  return {
    showCustomModal,
    setShowCustomModal,
    customSkillName,
    setCustomSkillName,
    customSkillContent,
    customSkillFileName,
    customSkillProviders,
    customSkillSubmitting,
    customSkillError,
    customSkills,
    showClassroomAnimation,
    setShowClassroomAnimation,
    classroomAnimSkillName,
    classroomAnimProviders,
    customFileInputRef,
    openCustomSkillModal,
    closeCustomSkillModal,
    handleCustomFileSelect,
    toggleCustomProvider,
    handleCustomSkillSubmit,
    handleDeleteCustomSkill,
  };
}
