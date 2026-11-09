import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import AppHeaderBar from "./AppHeaderBar";

function createBaseProps(): ComponentProps<typeof AppHeaderBar> {
  return {
    currentView: "office" as const,
    connected: true,
    viewTitle: "Office",
    tasksPrimaryLabel: "Tasks",
    decisionLabel: "Decisions",
    decisionInboxLoading: false,
    decisionInboxCount: 0,
    agentStatusLabel: "Agent Status",
    reportLabel: "Reports",
    announcementLabel: "Announcement",
    roomManagerLabel: "Room Manager",
    officePackControl: null,
    theme: "dark" as const,
    mobileHeaderMenuOpen: true,
    onOpenMobileNav: vi.fn(),
    onOpenTasks: vi.fn(),
    onOpenDecisionInbox: vi.fn(),
    onOpenAgentStatus: vi.fn(),
    onOpenReportHistory: vi.fn(),
    onOpenAnnouncement: vi.fn(),
    onOpenRoomManager: vi.fn(),
    onToggleTheme: vi.fn(),
    onToggleMobileHeaderMenu: vi.fn(),
    onCloseMobileHeaderMenu: vi.fn(),
  };
}

describe("AppHeaderBar mobile office pack selector", () => {
  it("모바일 더보기 메뉴에서 오피스팩을 변경할 수 있다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCloseMobileHeaderMenu = vi.fn();
    const props = createBaseProps();
    props.officePackControl = {
      label: "Office Pack",
      value: "development",
      onChange,
      options: [
        { key: "development", label: "Development", summary: "", slug: "DEV", accent: 0 },
        { key: "report", label: "Report", summary: "", slug: "REP", accent: 1 },
      ],
    };
    props.onCloseMobileHeaderMenu = onCloseMobileHeaderMenu;

    render(<AppHeaderBar {...props} />);

    const selector = document.getElementById("mobile-office-pack-selector") as HTMLSelectElement | null;
    expect(selector).not.toBeNull();
    if (!selector) return;
    await user.selectOptions(selector, "report");

    expect(onChange).toHaveBeenCalledWith("report");
    expect(onCloseMobileHeaderMenu).toHaveBeenCalled();
  });

  it("오피스팩 컨트롤이 없으면 모바일 메뉴에 셀렉터를 표시하지 않는다", () => {
    const props = createBaseProps();
    render(<AppHeaderBar {...props} />);

    expect(screen.queryByLabelText("Office Pack")).not.toBeInTheDocument();
  });
});
