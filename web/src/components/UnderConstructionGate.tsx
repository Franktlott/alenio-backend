import { FormEvent, PropsWithChildren, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Sparkles } from "lucide-react";
import "./under-construction-gate.css";

const ACCESS_KEY = "alenio-developer-preview";
const DEFAULT_PREVIEW_PASSWORD = "Ft0230013.";

function hasPreviewAccess(): boolean {
  return window.sessionStorage.getItem(ACCESS_KEY) === "granted";
}

export function UnderConstructionGate({ children }: PropsWithChildren) {
  const [hasAccess, setHasAccess] = useState(hasPreviewAccess);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  if (hasAccess) return children;

  const expectedPassword =
    import.meta.env.VITE_DEVELOPER_PASSWORD?.trim() || DEFAULT_PREVIEW_PASSWORD;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== expectedPassword) {
      setError("That password doesn’t match. Please try again.");
      return;
    }

    window.sessionStorage.setItem(ACCESS_KEY, "granted");
    setError("");
    setHasAccess(true);
  }

  return (
    <main className="construction-page">
      <div className="construction-glow construction-glow-one" />
      <div className="construction-glow construction-glow-two" />

      <header className="construction-header">
        <a className="construction-brand" href="/" aria-label="Alenio home">
          <img
            className="construction-brand-logo"
            src="/alenio-logo.png"
            alt="Alenio"
          />
        </a>
        <span className="construction-status">
          <span className="construction-status-dot" />
          In development
        </span>
      </header>

      <section className="construction-content">
        <div className="construction-copy">
          <div className="construction-kicker">
            <Sparkles size={15} aria-hidden="true" />
            Something thoughtful is taking shape
          </div>
          <h1>
            Better work starts
            <br />
            with better <span>connection.</span>
          </h1>
          <p>
            Alenio is being built to help teams stay aligned, grow together,
            and turn everyday work into meaningful progress.
          </p>
          <div className="construction-progress" aria-label="Development in progress">
            <span />
          </div>
          <p className="construction-progress-label">Private preview in progress</p>
        </div>

        <aside className="construction-card">
          <div className="construction-lock">
            <LockKeyhole size={22} aria-hidden="true" />
          </div>
          <p className="construction-card-eyebrow">Developer access</p>
          <h2>Enter the preview</h2>
          <p className="construction-card-copy">
            This space is still under construction. Enter your developer
            password to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="developer-password">Password</label>
            <div className={`construction-input-wrap${error ? " has-error" : ""}`}>
              <input
                id="developer-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter developer password"
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                className="construction-reveal"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error ? <p className="construction-error">{error}</p> : null}
            <button className="construction-submit" type="submit" disabled={!password}>
              Continue to Alenio
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>

          <p className="construction-card-note">
            Access lasts until you close this browser tab.
          </p>
        </aside>
      </section>

      <footer className="construction-footer">
        <span>© {new Date().getFullYear()} Alenio</span>
        <nav aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </main>
  );
}
