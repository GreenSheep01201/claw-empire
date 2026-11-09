import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import AppHeaderBar from "./AppHeaderBar";

function createBaseProps(): ComponentProps<typeof AppHeaderBar> {
  return {
    connected: true,
    viewTitle: "Bureau",
    labels: {
      openNavigation: "Ouvrir la navigation",
      decisions: "À valider",
      announcement: "Annoncer à l'équipe",
      more: "Plus",
      agentStatus: "État des agents",
      reports: "Rapports",
      roomManager: "Aménager le bureau",
      themeToLight: "Passer en mode jour",
      themeToDark: "Passer en mode nuit",
      live: "En ligne",
      offline: "Hors ligne",
    },
    decisionInboxLoading: false,
    decisionInboxCount: 0,
    officePackControl: null,
    theme: "light" as const,
    menuOpen: false,
    onOpenMobileNav: vi.fn(),
    onOpenDecisionInbox: vi.fn(),
    onOpenAgentStatus: vi.fn(),
    onOpenReportHistory: vi.fn(),
    onOpenAnnouncement: vi.fn(),
    onOpenRoomManager: vi.fn(),
    onToggleTheme: vi.fn(),
    onToggleMenu: vi.fn(),
    onCloseMenu: vi.fn(),
  };
}

describe("AppHeaderBar", () => {
  it("annonce le nombre de validations en attente et ouvre la boîte À valider", async () => {
    const user = userEvent.setup();
    const props = createBaseProps();
    props.decisionInboxCount = 3;
    render(<AppHeaderBar {...props} />);

    const button = screen.getByRole("button", { name: /À valider.*3/ });
    await user.click(button);

    expect(props.onOpenDecisionInbox).toHaveBeenCalled();
  });

  it("le menu Plus expose son état et ses actions secondaires", async () => {
    const user = userEvent.setup();
    const props = createBaseProps();
    const { rerender } = render(<AppHeaderBar {...props} />);

    const trigger = screen.getByRole("button", { name: "Plus" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    rerender(<AppHeaderBar {...props} menuOpen />);
    expect(screen.getByRole("button", { name: "Plus" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("menuitem", { name: "Rapports" }));
    expect(props.onOpenReportHistory).toHaveBeenCalled();
    expect(props.onCloseMenu).toHaveBeenCalled();
  });

  it("Échap ferme le menu Plus", async () => {
    const user = userEvent.setup();
    const props = createBaseProps();
    render(<AppHeaderBar {...props} menuOpen />);

    await user.keyboard("{Escape}");

    expect(props.onCloseMenu).toHaveBeenCalled();
  });

  it("change le pack de bureau depuis le menu Plus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = createBaseProps();
    props.officePackControl = {
      label: "Pack de bureau",
      value: "development",
      onChange,
      options: [
        { key: "development", label: "Development", summary: "", slug: "DEV", accent: 0 },
        { key: "report", label: "Report", summary: "", slug: "REP", accent: 1 },
      ],
    };
    render(<AppHeaderBar {...props} menuOpen />);

    await user.selectOptions(screen.getByLabelText("Pack de bureau"), "report");

    expect(onChange).toHaveBeenCalledWith("report");
    expect(props.onCloseMenu).toHaveBeenCalled();
  });

  it("n'affiche pas de sélecteur de pack sans contrôle de pack", () => {
    render(<AppHeaderBar {...createBaseProps()} menuOpen />);

    expect(screen.queryByLabelText("Pack de bureau")).not.toBeInTheDocument();
  });
});
