import { useState } from "react";
import { SenecaAssistantDrawer } from "./SenecaAssistantDrawer";
import { SenecaIcon } from "./SenecaShared";

export function SenecaFloatingLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="seneca-floating-launcher"
        aria-label="Open Seneca AI coaching assistant"
        title="Seneca — AI Coaching Assistant"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="seneca-floating-launcher"
      >
        <span className="seneca-floating-launcher__ring" aria-hidden />
        <SenecaIcon size={56} className="seneca-floating-launcher__icon" />
      </button>
      <SenecaAssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
