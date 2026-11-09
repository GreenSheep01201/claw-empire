import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "./Sidebar";
import { I18nProvider } from "../i18n";
import type { Agent, CompanySettings, Department } from "../types";

const departments = [
  { id: "dev", name: "Reequal", name_ko: "Reequal", icon: "", color: "#2E86AB", sort_order: 1 },
  { id: "game", name: "Atomic Battle", name_ko: "Atomic Battle", icon: "", color: "#F2C14E", sort_order: 2 },
] as Department[];
const agents = [
  { id: "a1", department_id: "dev", status: "working" },
  { id: "a2", department_id: "dev", status: "idle" },
  { id: "a3", department_id: "game", status: "idle" },
] as Agent[];
const settings = { companyName: "Mon QG", ceoName: "Riadh" } as CompanySettings;

function renderSidebar(onChangeView = vi.fn()) {
  render(
    <I18nProvider language="fr">
      <Sidebar
        currentView="office"
        onChangeView={onChangeView}
        departments={departments}
        agents={agents}
        settings={settings}
        connected
      />
    </I18nProvider>,
  );
  return onChangeView;
}

describe("Sidebar", () => {
  it("marque la vue courante et change de vue au clic", async () => {
    const user = userEvent.setup();
    const onChangeView = renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });

    expect(within(nav).getByRole("button", { name: "Bureau" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav).getByRole("button", { name: "Tâches" }));

    expect(onChangeView).toHaveBeenCalledWith("tasks");
  });

  it("liste les pôles avec leurs agents actifs", () => {
    renderSidebar();
    const poles = screen.getByRole("list", { name: "Pôles" });

    expect(within(poles).getByText("Reequal")).toBeInTheDocument();
    expect(within(poles).getByLabelText("1 agent actif sur 2")).toBeInTheDocument();
    expect(within(poles).getByLabelText("0 agent actif sur 1")).toBeInTheDocument();
  });
});
