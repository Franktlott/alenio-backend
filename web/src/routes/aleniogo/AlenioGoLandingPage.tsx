import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlenioGoLogo } from "../../components/AlenioGoLogo";
import { fetchGoCodeLookup } from "../../lib/api";
import {
  getGoSessionToken,
  normalizeGoCodeInput,
  parseGoCodeFromUrl,
  setPendingGoLocation,
} from "../../lib/alenio-go-session";

export function AlenioGoLandingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const validateAndContinue = useCallback(
    async (rawCode: string) => {
      const goCode = normalizeGoCodeInput(rawCode);
      if (goCode.length < 4) {
        setErr("Enter a valid Go Code.");
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const data = await fetchGoCodeLookup(goCode);
        setPendingGoLocation({
          id: data.location.id,
          name: data.location.name,
          area: data.location.area,
          guestEnabled: data.location.guestEnabled,
          workspaceName: data.workspace.name,
          workspaceImage: data.workspace.image,
          quickUsers: data.quickUsers,
          goCode,
        });
        navigate("/aleniogo/welcome", { replace: true });
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message
            : "We couldn't find that Go Code. Check the code or ask your manager.",
        );
      } finally {
        setBusy(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (getGoSessionToken()) {
      navigate("/aleniogo/app", { replace: true });
      return;
    }
    const fromUrl = parseGoCodeFromUrl(params.toString());
    if (fromUrl) {
      setCode(fromUrl);
      setShowManual(true);
      void validateAndContinue(fromUrl);
    }
  }, [params, navigate, validateAndContinue]);

  return (
    <div className="alenio-go-public" data-testid="alenio-go-landing">
      <div className="alenio-go-public__shell">
        <header className="alenio-go-public__brand">
          <AlenioGoLogo variant="page" className="alenio-go-public__logo" />
        </header>

        <main className="alenio-go-public__main">
          <h1 className="alenio-go-public__title">Alenio Go</h1>
          <p className="alenio-go-public__subtitle">Start workplace tasks without signing in.</p>

          <div className="alenio-go-public__actions">
            <button
              type="button"
              className="alenio-go-public__btn alenio-go-public__btn--primary"
              onClick={() => setShowManual(true)}
            >
              Scan QR Code
            </button>
            <button
              type="button"
              className="alenio-go-public__btn alenio-go-public__btn--ghost"
              onClick={() => setShowManual(true)}
            >
              Enter Go Code
            </button>
          </div>

          {showManual || code ? (
            <form
              className="alenio-go-public__code-form"
              onSubmit={(e) => {
                e.preventDefault();
                void validateAndContinue(code);
              }}
            >
              <label className="alenio-go-public__label" htmlFor="go-code-input">
                Go Code
              </label>
              <input
                id="go-code-input"
                className="alenio-go-public__code-input"
                value={code}
                onChange={(e) => setCode(normalizeGoCodeInput(e.target.value))}
                placeholder="e.g. ABC12XYZ"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
              />
              {err ? (
                <p className="alenio-go-public__error" role="alert">
                  {err}
                </p>
              ) : null}
              <button type="submit" className="alenio-go-public__btn alenio-go-public__btn--primary alenio-go-public__btn--full" disabled={busy || code.length < 4}>
                {busy ? "Checking…" : "Continue"}
              </button>
              <p className="alenio-go-public__hint">
                Ask your manager for the Go Code posted at your location. This is not your Workplace Invite Code.
              </p>
            </form>
          ) : null}
        </main>

        <footer className="alenio-go-public__foot">
          <Link to="/login" className="alenio-go-public__link">
            Sign in to Alenio
          </Link>
        </footer>
      </div>
    </div>
  );
}
