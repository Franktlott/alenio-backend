import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../../components/AlenioGoLogo";
import { createGoSession } from "../../lib/api";
import {
  getPendingGoLocation,
  getGoSessionToken,
  setGoSessionToken,
  type PendingGoLocation,
} from "../../lib/alenio-go-session";

export function AlenioGoWelcomePage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingGoLocation | null>(null);
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (getGoSessionToken()) {
      navigate("/aleniogo/app", { replace: true });
      return;
    }
    const loc = getPendingGoLocation();
    if (!loc) {
      navigate("/aleniogo", { replace: true });
      return;
    }
    setPending(loc);
  }, [navigate]);

  const startSession = async (displayName: string) => {
    if (!pending || !displayName.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const session = await createGoSession({ goCode: pending.goCode, displayName: displayName.trim() });
      setGoSessionToken(session.sessionToken);
      navigate("/aleniogo/app", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return null;

  return (
    <div className="alenio-go-public alenio-go-public--welcome" data-testid="alenio-go-welcome">
      <div className="alenio-go-public__shell">
        <header className="alenio-go-public__brand alenio-go-public__brand--compact">
          <AlenioGoLogo variant="header" className="alenio-go-public__logo alenio-go-public__logo--compact" />
        </header>

        <main className="alenio-go-public__main">
          <p className="alenio-go-public__kicker">{pending.workspaceName}</p>
          <h1 className="alenio-go-public__title alenio-go-public__title--sm">{pending.name}</h1>
          {pending.area ? <p className="alenio-go-public__subtitle">{pending.area}</p> : null}

          <section className="alenio-go-public__welcome-card">
            <h2 className="alenio-go-public__welcome-heading">Who&apos;s completing this?</h2>

            {pending.quickUsers.length > 0 ? (
              <div className="alenio-go-public__quick-users">
                {pending.quickUsers.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="alenio-go-public__quick-user"
                    disabled={busy}
                    onClick={() => void startSession(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="alenio-go-public__label" htmlFor="go-initials">
              Initials or name
            </label>
            <input
              id="go-initials"
              className="alenio-go-public__code-input"
              value={initials}
              onChange={(e) => setInitials(e.target.value.slice(0, 80))}
              placeholder="e.g. JM"
              autoComplete="name"
            />

            {err ? (
              <p className="alenio-go-public__error" role="alert">
                {err}
              </p>
            ) : null}

            <button
              type="button"
              className="alenio-go-public__btn alenio-go-public__btn--primary alenio-go-public__btn--full"
              disabled={busy || !initials.trim()}
              onClick={() => void startSession(initials)}
            >
              {busy ? "Starting…" : "Continue"}
            </button>

            {pending.guestEnabled ? (
              <button
                type="button"
                className="alenio-go-public__btn alenio-go-public__btn--ghost alenio-go-public__btn--full"
                disabled={busy}
                onClick={() => void startSession("Guest")}
              >
                Continue as Guest
              </button>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
