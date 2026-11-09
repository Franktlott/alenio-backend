import { useState } from "react";
import { SenecaAssistantDrawer } from "./SenecaAssistantDrawer";

export function SenecaTopBarButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`ac-seneca${open ? " is-open" : ""}`}
        aria-label="Open Seneca AI coaching assistant"
        title="Seneca — AI Coaching Assistant"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="seneca-topbar-launcher"
      >
        <img src="/seneca-button-icon.png" alt="" width={30} height={30} aria-hidden />
      </button>
      <SenecaAssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
