import { useEffect, useState, type ReactNode } from "react";
import { AlenioGoLogo } from "../AlenioGoLogo";
import {
  ALENIO_GO_DEV_GATE_ENABLED,
  isAlenioGoDevUnlocked,
  tryUnlockAlenioGoDev,
} from "../../lib/alenio-go-dev-gate";

type Props = {
  children: ReactNode;
};

export function AlenioGoDevGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(() => isAlenioGoDevUnlocked());
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ALENIO_GO_DEV_GATE_ENABLED || unlocked) return;
    const timer = window.setTimeout(() => setPhase("ready"), 1500);
    return () => window.clearTimeout(timer);
  }, [unlocked]);

  if (!ALENIO_GO_DEV_GATE_ENABLED || unlocked) {
    return <>{children}</>;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (tryUnlockAlenioGoDev(code)) {
      setUnlocked(true);
      setError(null);
      return;
    }
    setError("Invalid developer code.");
  }

  return (
    <div className="go-dev-gate-shell">
      <div className="go-dev-gate" data-testid="alenio-go-dev-gate">
      <div className="go-dev-gate-glow go-dev-gate-glow--one" aria-hidden />
      <div className="go-dev-gate-glow go-dev-gate-glow--two" aria-hidden />

      <div className="go-dev-gate-main">
        <div className={`go-dev-gate-logo-wrap${phase === "loading" ? " go-dev-gate-logo-wrap--loading" : ""}`}>
          <AlenioGoLogo variant="page" className="go-dev-gate-logo" />
          {phase === "loading" ? <span className="go-dev-gate-spinner" aria-hidden /> : null}
        </div>

        {phase === "loading" ? (
          <div className="go-dev-gate-loading">
            <p className="go-dev-gate-loading-text">Alenio Go is loading</p>
            <span className="go-dev-gate-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : (
          <div className="go-dev-gate-copy">
            <p className="go-dev-gate-kicker">Frontline workspace</p>
            <h1 className="go-dev-gate-title">Something big is cooking</h1>
            <p className="go-dev-gate-sub">
              We&apos;re putting the finishing touches on Alenio Go — devices, alerts, and the tools your floor teams
              will use every shift.
            </p>
          </div>
        )}
      </div>

      <form className="go-dev-gate-dev-form" onSubmit={onSubmit}>
        <label className="go-dev-gate-dev-label" htmlFor="go-dev-code">
          Developer code
        </label>
        <div className="go-dev-gate-dev-row">
          <input
            id="go-dev-code"
            type="password"
            className="go-dev-gate-dev-input"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Enter code"
            data-testid="alenio-go-dev-code"
          />
          <button type="submit" className="go-dev-gate-dev-btn" data-testid="alenio-go-dev-unlock">
            Unlock
          </button>
        </div>
        {error ? (
          <p className="go-dev-gate-dev-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      </div>
    </div>
  );
}
