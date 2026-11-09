import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import type { Agent } from "../types";
import ClassroomOverlay from "./skills-library/ClassroomOverlay";
import CustomSkillModal from "./skills-library/CustomSkillModal";
import CustomSkillSection from "./skills-library/CustomSkillSection";
import LearningModal from "./skills-library/LearningModal";
import SkillsCategoryBar from "./skills-library/SkillsCategoryBar";
import SkillsGrid from "./skills-library/SkillsGrid";
import SkillsHeader from "./skills-library/SkillsHeader";
import SkillsMemorySection from "./skills-library/SkillsMemorySection";
import { useSkillsLibraryState } from "./skills-library/useSkillsLibraryState";

interface SkillsLibraryProps {
  agents: Agent[];
}

export default function SkillsLibrary({ agents }: SkillsLibraryProps) {
  const { t, locale: localeTag } = useI18n();
  const vm = useSkillsLibraryState({ agents, localeTag, t });

  if (vm.loading) {
    return (
      <div className="qg-empty flex flex-col items-center gap-3" role="status">
        <LoaderCircle size={28} className="animate-spin" aria-hidden="true" />
        {t({
          ko: "skills.sh 데이터 로딩중...",
          en: "Loading skills.sh data...",
          ja: "skills.sh データを読み込み中...",
          zh: "正在加载 skills.sh 数据...",
          fr: "Chargement de la bibliothèque…",
        })}
      </div>
    );
  }

  if (vm.error && vm.skills.length === 0) {
    return (
      <div className="qg-empty flex flex-col items-center gap-2" role="alert">
        <TriangleAlert size={28} aria-hidden="true" />
        <div className="qg-text-secondary">
          {t({
            ko: "스킬 데이터를 불러올 수 없습니다",
            en: "Unable to load skills data",
            ja: "スキルデータを読み込めません",
            zh: "无法加载技能数据",
            fr: "Impossible de charger les compétences",
          })}
        </div>
        <div className="text-[13px]">{vm.error}</div>
        <button type="button" onClick={vm.loadSkills} className="qg-btn mt-2">
          {t({ ko: "다시 시도", en: "Retry", ja: "再試行", zh: "重试", fr: "Réessayer" })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SkillsHeader
        t={t}
        skillsCount={vm.skills.length}
        search={vm.search}
        onSearchChange={vm.setSearch}
        sortBy={vm.sortBy}
        onSortByChange={vm.setSortBy}
        onOpenCustomSkillModal={vm.openCustomSkillModal}
      />

      <SkillsCategoryBar
        t={t}
        selectedCategory={vm.selectedCategory}
        onSelectCategory={vm.setSelectedCategory}
        categoryCounts={vm.categoryCounts}
        filteredLength={vm.filtered.length}
        search={vm.search}
      />

      <SkillsMemorySection
        t={t}
        agents={agents}
        historyRefreshToken={vm.historyRefreshToken}
        onRefreshHistory={() => vm.setHistoryRefreshToken((prev) => prev + 1)}
      />

      <SkillsGrid
        t={t}
        localeTag={localeTag}
        agents={agents}
        filtered={vm.filtered}
        learnedProvidersBySkill={vm.learnedProvidersBySkill}
        learnedRepresentatives={vm.learnedRepresentatives}
        hoveredSkill={vm.hoveredSkill}
        setHoveredSkill={vm.setHoveredSkill}
        detailCache={vm.detailCache}
        tooltipRef={vm.tooltipRef}
        hoverTimerRef={vm.hoverTimerRef}
        copiedSkill={vm.copiedSkill}
        onHoverEnter={vm.handleCardMouseEnter}
        onHoverLeave={vm.handleCardMouseLeave}
        onOpenLearningModal={vm.openLearningModal}
        onCopy={vm.handleCopy}
      />

      <LearningModal
        t={t}
        localeTag={localeTag}
        agents={agents}
        learningSkill={vm.learningSkill}
        learnInProgress={vm.learnInProgress}
        selectedProviders={vm.selectedProviders}
        representatives={vm.representatives}
        preferKoreanName={vm.preferKoreanName}
        modalLearnedProviders={vm.modalLearnedProviders}
        unlearningProviders={vm.unlearningProviders}
        unlearnEffects={vm.unlearnEffects}
        learnJob={vm.learnJob}
        learnError={vm.learnError}
        unlearnError={vm.unlearnError}
        learnSubmitting={vm.learnSubmitting}
        defaultSelectedProviders={vm.defaultSelectedProviders}
        onClose={vm.closeLearningModal}
        onToggleProvider={vm.toggleProvider}
        onUnlearnProvider={(provider) => {
          void vm.handleUnlearnProvider(provider);
        }}
        onStartLearning={() => {
          void vm.handleStartLearning();
        }}
      />

      <CustomSkillSection
        t={t}
        customSkills={vm.customSkills}
        localeTag={localeTag}
        onDeleteSkill={(skillName) => {
          void vm.handleDeleteCustomSkill(skillName);
        }}
      />

      <ClassroomOverlay
        t={t}
        show={vm.showClassroomAnimation}
        skillName={vm.classroomAnimSkillName}
        providers={vm.classroomAnimProviders}
        agents={agents}
      />

      <CustomSkillModal
        t={t}
        show={vm.showCustomModal}
        agents={agents}
        representatives={vm.representatives}
        preferKoreanName={vm.preferKoreanName}
        customSkillName={vm.customSkillName}
        setCustomSkillName={vm.setCustomSkillName}
        customSkillContent={vm.customSkillContent}
        customSkillFileName={vm.customSkillFileName}
        customSkillProviders={vm.customSkillProviders}
        customSkillSubmitting={vm.customSkillSubmitting}
        customSkillError={vm.customSkillError}
        customFileInputRef={vm.customFileInputRef}
        onClose={vm.closeCustomSkillModal}
        onFileSelect={vm.handleCustomFileSelect}
        onToggleProvider={vm.toggleCustomProvider}
        onSubmit={() => {
          void vm.handleCustomSkillSubmit();
        }}
      />

      <div className="py-4 text-center text-[13px] qg-text-muted">
        {t({
          ko: "데이터 출처: skills.sh · 설치: npx skills add <owner/repo>",
          en: "Source: skills.sh · Install: npx skills add <owner/repo>",
          ja: "データソース: skills.sh · インストール: npx skills add <owner/repo>",
          zh: "数据来源: skills.sh · 安装: npx skills add <owner/repo>",
          fr: "Source : skills.sh · Installation : npx skills add <owner/repo>",
        })}
      </div>
    </div>
  );
}
