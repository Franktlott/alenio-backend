import { useState } from "react";
import { SenecaGoalModal } from "./SenecaGoalModal";
import { SenecaIcon } from "./SenecaShared";

export function SenecaFloatingLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="seneca-floating-launcher"
        aria-label="Open Seneca"
        title="Seneca"
        onClick={() => setOpen(true)}
      >
        <span className="seneca-floating-launcher__ring" aria-hidden />
        <SenecaIcon size={56} className="seneca-floating-launcher__icon" />
      </button>
      <SenecaGoalModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
