import { FailureStepList } from "./FailureStepList";
import type { FailureProcedureDraft } from "./types";
import { emptyFailureProcedure } from "./types";

type Props = {
  value: FailureProcedureDraft;
  onChange: (value: FailureProcedureDraft) => void;
  showRequiredErrors?: boolean;
};

export function FailureProcedureBuilder({
  value,
  onChange,
  showRequiredErrors = false,
}: Props) {
  const draft = value ?? emptyFailureProcedure();
  const retestEnabled = draft.allowRetempAfterSteps;

  return (
    <div className="fp-builder">
      <ol className="fp-flow" aria-label="Failure procedure flow">
        <li className="fp-flow-step">
          <span className="fp-flow-icon fp-flow-icon--warn" aria-hidden>
            <IconWarn />
          </span>
          <div>
            <strong>Initial Failure</strong>
            <p>Complete these steps immediately.</p>
          </div>
        </li>
        <li className="fp-flow-connector" aria-hidden>
          →
        </li>
        <li className={`fp-flow-step${retestEnabled ? "" : " is-muted"}`}>
          <span className="fp-flow-icon fp-flow-icon--retest" aria-hidden>
            <IconRetest />
          </span>
          <div>
            <strong>Retest Item</strong>
            <p>Associate retests the item after completing steps.</p>
          </div>
        </li>
        <li className="fp-flow-connector" aria-hidden>
          →
        </li>
        <li className={`fp-flow-step${retestEnabled ? "" : " is-muted"}`}>
          <span className="fp-flow-icon fp-flow-icon--pass" aria-hidden>
            <IconPass />
          </span>
          <div>
            <strong>3A If Retest Passes</strong>
            <p>Associate continues the walk and advances to the next item.</p>
          </div>
        </li>
        <li className="fp-flow-connector" aria-hidden>
          →
        </li>
        <li className={`fp-flow-step${retestEnabled ? "" : " is-muted"}`}>
          <span className="fp-flow-icon fp-flow-icon--fail" aria-hidden>
            <IconFail />
          </span>
          <div>
            <strong>3B If Retest Fails</strong>
            <p>Complete the additional steps before advancing.</p>
          </div>
        </li>
      </ol>

      <div className="fp-main">
        <section className="fp-panel fp-panel--first" aria-labelledby="fp-initial-title">
          <header className="fp-panel-head">
            <div className="fp-panel-title-row">
              <span className="fp-panel-badge" aria-hidden>
                1
              </span>
              <h3 id="fp-initial-title">Initial Failure Procedure</h3>
              <span className="fp-required-pill">Required</span>
            </div>
            <p>Steps associates must complete after the first failure.</p>
          </header>

          <FailureStepList
            steps={draft.firstFailureSteps}
            onChange={(firstFailureSteps) => onChange({ ...draft, firstFailureSteps })}
            placeholder="e.g. Notify manager and explain the failure"
            accent="primary"
            showRequiredErrors={showRequiredErrors}
          />

          <div className={`fp-retest-block${retestEnabled ? " is-on" : ""}`}>
            <label className="fp-retest-toggle">
              <input
                type="checkbox"
                checked={retestEnabled}
                onChange={(e) =>
                  onChange({ ...draft, allowRetempAfterSteps: e.target.checked })
                }
              />
              <span className="fp-switch" aria-hidden />
              <span className="fp-retest-copy">
                <strong>Allow retest after steps are complete</strong>
                <span>If allowed, associates can retest the item after completing these steps.</span>
              </span>
            </label>

            {retestEnabled ? (
              <label className="fp-field">
                <span>Retest note (optional)</span>
                <input
                  value={draft.retempNote}
                  onChange={(e) => onChange({ ...draft, retempNote: e.target.value })}
                  placeholder="e.g. Retest the item after 2 minutes."
                />
                <em className="fp-field-hint">Shown to associates before retesting.</em>
              </label>
            ) : null}
          </div>
        </section>

        <div className={`fp-outcomes${retestEnabled ? "" : " is-disabled"}`} aria-disabled={!retestEnabled}>
          <section className="fp-panel fp-panel--pass" aria-labelledby="fp-pass-title">
            <header className="fp-panel-head">
              <div className="fp-panel-title-row">
                <span className="fp-panel-icon fp-panel-icon--pass" aria-hidden>
                  <IconPass />
                </span>
                <h3 id="fp-pass-title">3A If Retest Passes</h3>
              </div>
              <p>Associate continues the walk and advances to the next item.</p>
            </header>
            <label className="fp-field">
              <span>Note to associate (optional)</span>
              <input
                value={draft.ifPassNote}
                disabled={!retestEnabled}
                onChange={(e) => onChange({ ...draft, ifPassNote: e.target.value })}
                placeholder="e.g. Document the correction and continue"
              />
              <em className="fp-field-hint">This message is shown when the item passes on retest.</em>
            </label>
          </section>

          <section className="fp-panel fp-panel--fail" aria-labelledby="fp-fail-title">
            <header className="fp-panel-head">
              <div className="fp-panel-title-row">
                <span className="fp-panel-icon fp-panel-icon--fail" aria-hidden>
                  <IconFail />
                </span>
                <h3 id="fp-fail-title">3B If Retest Fails</h3>
              </div>
              <p>Additional steps associates must complete before advancing.</p>
            </header>
            <FailureStepList
              steps={draft.ifFailSteps}
              onChange={(ifFailSteps) => onChange({ ...draft, ifFailSteps })}
              placeholder="e.g. Discard product and notify food safety"
              accent="danger"
              disabled={!retestEnabled}
              showRequiredErrors={showRequiredErrors && retestEnabled}
            />
          </section>
        </div>
      </div>

      <p className="fp-banner">
        <IconInfo />
        <span>
          Once all required steps are complete and the item passes on retest, the item will be marked
          complete and the associate will advance.
        </span>
      </p>
    </div>
  );
}

function IconWarn() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function IconRetest() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M3 12a9 9 0 0 1 15.5-6.4M21 12a9 9 0 0 1-15.5 6.4" />
      <path d="M17 3v5h5M7 21v-5H2" />
    </svg>
  );
}

function IconPass() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M6.5 12.5l3.5 3.5 7.5-7.5" />
    </svg>
  );
}

function IconFail() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M8 8l8 8M16 8l-8 8" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export { FailureProcedureEmptyState } from "./FailureProcedureEmptyState";
