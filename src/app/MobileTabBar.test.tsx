import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileTabBar from "./MobileTabBar";

const labels = {
  tabs: "Navigation mobile",
  office: "Bureau",
  tasks: "Tâches",
  announce: "Annoncer",
  decisions: "À valider",
  menu: "Menu",
};

function setup(overrides: Partial<Parameters<typeof MobileTabBar>[0]> = {}) {
  const props = {
    currentView: "office" as const,
    labels,
    decisionCount: 0,
    onChangeView: vi.fn(),
    onOpenAnnouncement: vi.fn(),
    onOpenDecisionInbox: vi.fn(),
    onOpenMenu: vi.fn(),
    ...overrides,
  };
  render(<MobileTabBar {...props} />);
  return props;
}

describe("MobileTabBar", () => {
  it("indique la vue courante et navigue vers les tâches", async () => {
    const user = userEvent.setup();
    const props = setup();

    expect(screen.getByRole("button", { name: "Bureau" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Tâches" }));

    expect(props.onChangeView).toHaveBeenCalledWith("tasks");
  });

  it("annonce les validations en attente et ouvre la boîte", async () => {
    const user = userEvent.setup();
    const props = setup({ decisionCount: 2 });

    await user.click(screen.getByRole("button", { name: "À valider (2)" }));

    expect(props.onOpenDecisionInbox).toHaveBeenCalled();
  });

  it("ouvre le menu complet", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(props.onOpenMenu).toHaveBeenCalled();
  });
});
