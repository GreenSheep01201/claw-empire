import "@testing-library/jest-dom/vitest";

// jsdom does not implement the modal <dialog> API yet.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Like browsers, move focus to the first focusable control inside.
    this.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]")?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
