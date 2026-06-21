import { useState } from "react";
import { SenecaComingSoonModal } from "./SenecaComingSoonModal";

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
        <img src="/seneca-icon.png" alt="" className="seneca-floating-launcher__icon" width={56} height={56} />
      </button>
      <SenecaComingSoonModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
