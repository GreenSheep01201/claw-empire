import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dialog from "./Dialog";

describe("Dialog", () => {
  it("s'annonce par son titre et se ferme avec Échap", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="À valider" closeLabel="Fermer" onClose={onClose}>
        <p>Contenu</p>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "À valider" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se ferme au clic sur le fond mais pas sur le contenu", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="Rapports" closeLabel="Fermer" onClose={onClose}>
        <p>Contenu</p>
      </Dialog>,
    );

    await user.click(screen.getByText("Contenu"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rend le focus au bouton qui l'a ouverte", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Ouvrir</button>
          <Dialog open={open} title="Rapports" closeLabel="Fermer" onClose={() => setOpen(false)}>
            <p>Contenu</p>
          </Dialog>
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await user.click(screen.getByRole("button", { name: "Fermer" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir" })).toHaveFocus();
  });
});
