import { ClipboardList, FileText, Megaphone, Zap, type LucideIcon } from "lucide-react";

type ChatMode = "chat" | "task" | "announcement" | "report";

type Tr = (ko: string, en: string, ja?: string, zh?: string, fr?: string) => string;

interface ChatModeHintProps {
  mode: ChatMode;
  isDirectiveMode: boolean;
  tr: Tr;
}

export default function ChatModeHint({ mode, isDirectiveMode, tr }: ChatModeHintProps) {
  if (mode === "chat" && !isDirectiveMode) return null;

  let Icon: LucideIcon;
  let label: string;
  if (isDirectiveMode) {
    Icon = Zap;
    label = tr(
      "업무지시 모드 — 기획팀이 자동으로 주관합니다",
      "Directive mode - Planning team auto-coordinates",
      "業務指示モード — 企画チームが自動的に主管します",
      "业务指示模式 — 企划组自动主管",
      "Mode directive — le pôle Planification coordonne",
    );
  } else if (mode === "task") {
    Icon = ClipboardList;
    label = tr(
      "업무 지시 모드 — 에이전트에게 작업을 할당합니다",
      "Task mode - assign work to the agent",
      "タスク指示モード — エージェントに作業を割り当てます",
      "任务指示模式 — 向代理分配工作",
      "Mode tâche — confier un travail à ce membre",
    );
  } else if (mode === "announcement") {
    Icon = Megaphone;
    label = tr(
      "전사 공지 모드 — 모든 에이전트에게 전달됩니다",
      "Announcement mode - sent to all agents",
      "全体告知モード — すべてのエージェントに送信",
      "全员公告模式 — 将发送给所有代理",
      "Mode annonce — envoyée à toute l'équipe",
    );
  } else {
    Icon = FileText;
    label = tr(
      "보고 요청 모드 — 보고서/발표자료 작성 작업을 요청합니다",
      "Report mode - request report/deck authoring",
      "レポート依頼モード — レポート/資料作成を依頼します",
      "报告请求模式 — 请求撰写报告/演示资料",
      "Mode rapport — demander un rapport ou une présentation",
    );
  }

  return (
    <div className="flex-shrink-0 px-4 py-1">
      <p className={`qg-badge !h-auto max-w-full !whitespace-normal py-1${isDirectiveMode ? " qg-badge--accent" : ""}`}>
        <Icon size={16} aria-hidden className="shrink-0" />
        <span>{label}</span>
      </p>
    </div>
  );
}
