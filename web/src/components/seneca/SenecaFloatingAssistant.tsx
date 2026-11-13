import { useState } from "react";
import { SenecaChatDrawer } from "./SenecaChatDrawer";

type Props = {
  /** When false, the floating control is not rendered (e.g. on /seneca). */
  visible?: boolean;
};

/**
 * Premium floating Seneca launcher — fixed bottom-right, opens the chat assistant panel.
 */
export function SenecaFloatingAssistant({ visible = true }: Props) {
  const [open, setOpen] = useState(false);

  if (!visible) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="seneca-floating-assistant"
          aria-label="Open Seneca assistant"
          title="Seneca assistant"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          data-testid="seneca-floating-assistant"
        >
          <span className="seneca-floating-assistant__glow" aria-hidden />
          <img
            src="/seneca-button-icon.png"
            alt=""
            width={40}
            height={40}
            className="seneca-floating-assistant__icon"
            aria-hidden
          />
        </button>
      ) : null}
      <SenecaChatDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** @deprecated Prefer SenecaFloatingAssistant */
export function SenecaFloatingLauncher() {
  return <SenecaFloatingAssistant />;
}
