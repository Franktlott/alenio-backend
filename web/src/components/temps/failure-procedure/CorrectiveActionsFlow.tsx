import { FailureStepList } from "./FailureStepList";
import type { FailureProcedureDraft } from "./types";
import { emptyFailureProcedure } from "./types";

type Props = {
  value: FailureProcedureDraft;
  onChange: (value: FailureProcedureDraft) => void;
  showRequiredErrors?: boolean;
};

export function CorrectiveActionsFlow({
  value,
  onChange,
  showRequiredErrors = false,
}: Props) {
  const draft = value ?? emptyFailureProcedure();
  const retestEnabled = draft.allowRetempAfterSteps;
  const finalStageNum = retestEnabled ? "3" : "2";

  return (
    <div className="ca-flow">
      <header className="ca-flow-head">
        <div className="ca-flow-head-main">
          <div className="ca-flow-title-row">
            <h3>Failure Procedure</h3>
            <span className="fp-required-pill fp-required-pill--accent">Required</span>
          </div>
          <p className="ca-flow-lede">Define what happens if this item does not pass.</p>
        </div>
        <label className="ca-flow-retest">
          <input
            type="checkbox"
            checked={retestEnabled}
            onChange={(e) => onChange({ ...draft, allowRetempAfterSteps: e.target.checked })}
          />
          <span className="fp-switch" aria-hidden />
          <span className="ca-flow-retest-copy">
            <strong>Allow one retest</strong>
            <span>If disabled, the item will go directly to Final Failure.</span>
          </span>
        </label>
      </header>

      <div className="ca-flow-body" aria-label="Failure procedure stages">
        <div className="ca-rail" aria-hidden>
          <span className="ca-rail-dot ca-rail-dot--green">1</span>
          <span className="ca-rail-connector">
            <span className="ca-rail-line" />
            <IconDownArrow />
          </span>
          {retestEnabled ? (
            <>
              <span className="ca-rail-dot ca-rail-dot--blue">2</span>
              <span className="ca-rail-connector">
                <span className="ca-rail-line" />
                <IconDownArrow />
              </span>
            </>
          ) : null}
          <span className="ca-rail-dot ca-rail-dot--red">{finalStageNum}</span>
        </div>

        <div className="ca-stages">
          <section className="ca-stage-block ca-stage-block--initial" aria-labelledby="ca-stage-1-title">
            <div className="ca-stage-top">
              <div className="ca-stage-copy">
                <div className="ca-stage-title-row">
                  <h4 id="ca-stage-1-title">Initial Test</h4>
                  <span className="ca-chip ca-chip--green">First temperature reading</span>
                </div>
                <p>Take the initial temperature reading.</p>
              </div>
              <div className="ca-outcome-pair" role="list" aria-label="Initial test outcomes">
                <div className="ca-outcome-tile ca-outcome-tile--pass" role="listitem">
                  <strong>PASS</strong>
                  <span>Continue walk</span>
                </div>
                <div className="ca-outcome-tile ca-outcome-tile--fail" role="listitem">
                  <strong>FAIL</strong>
                  <span>{retestEnabled ? "Go to Failure Procedure" : "Go to Final Failure"}</span>
                </div>
              </div>
            </div>

            {retestEnabled ? (
              <>
                <div className="ca-fail-bridge" aria-hidden>
                  <IconDownArrow />
                </div>
                <div className="ca-nested-card ca-nested-card--procedure">
                  <div className="ca-stage-top">
                    <div className="ca-stage-copy">
                      <div className="ca-stage-title-row">
                        <h4 id="ca-fp-nested-title">Failure Procedure</h4>
                        <span className="fp-required-pill fp-required-pill--accent">Required</span>
                      </div>
                      <p>Complete these steps before the retest.</p>
                    </div>
                  </div>

                  <div className="ca-final-grid">
                    <div className="ca-final-steps">
                      <FailureStepList
                        steps={draft.firstFailureSteps}
                        onChange={(firstFailureSteps) => onChange({ ...draft, firstFailureSteps })}
                        placeholder="e.g. Notify manager and document the issue"
                        accent="primary"
                        showRequiredErrors={showRequiredErrors}
                      />
                    </div>
                    <div className="ca-final-arrow ca-final-arrow--next" aria-hidden>
                      <IconRightArrow />
                    </div>
                    <aside className="ca-next-card">
                      <div className="ca-next-icon" aria-hidden>
                        <IconRetest />
                      </div>
                      <strong>Ready for Retest</strong>
                      <p>After these steps, the associate takes a second temperature reading.</p>
                    </aside>
                  </div>
                </div>
              </>
            ) : null}
          </section>

          {retestEnabled ? (
            <section className="ca-stage-block ca-stage-block--retest" aria-labelledby="ca-stage-2-title">
              <div className="ca-stage-top">
                <div className="ca-stage-copy">
                  <div className="ca-stage-title-row">
                    <h4 id="ca-stage-2-title">Retest</h4>
                    <span className="ca-chip ca-chip--blue">Second temperature reading</span>
                  </div>
                  <p>Take a second temperature reading.</p>
                </div>
                <div className="ca-outcome-pair" role="list" aria-label="Retest outcomes">
                  <div className="ca-outcome-tile ca-outcome-tile--pass" role="listitem">
                    <strong>PASS</strong>
                    <span>Continue walk</span>
                  </div>
                  <div className="ca-outcome-tile ca-outcome-tile--fail" role="listitem">
                    <strong>FAIL</strong>
                    <span>Go to Final Failure Procedure</span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section
            className="ca-stage-block ca-stage-block--final"
            aria-labelledby="ca-stage-final-title"
          >
            <div className="ca-stage-top">
              <div className="ca-stage-copy">
                <div className="ca-stage-title-row">
                  <h4 id="ca-stage-final-title">Final Failure Procedure</h4>
                  <span className="fp-required-pill fp-required-pill--danger">Required</span>
                </div>
                <p>
                  {retestEnabled
                    ? "Complete these steps if the retest also fails."
                    : "Complete these steps if the initial test fails."}
                </p>
              </div>
            </div>

            <div className="ca-final-grid">
              <div className="ca-final-steps">
                <FailureStepList
                  steps={retestEnabled ? draft.ifFailSteps : draft.firstFailureSteps}
                  onChange={(steps) =>
                    onChange(
                      retestEnabled
                        ? { ...draft, ifFailSteps: steps }
                        : { ...draft, firstFailureSteps: steps },
                    )
                  }
                  placeholder="e.g. Discard product and notify food safety"
                  accent="danger"
                  showRequiredErrors={showRequiredErrors}
                />
              </div>
              <div className="ca-final-arrow" aria-hidden>
                <IconRightArrow />
              </div>
              <aside className="ca-closed-card">
                <div className="ca-closed-icon" aria-hidden>
                  <IconLock />
                </div>
                <strong>Item Closed</strong>
                <p>Item will be closed after these steps are completed. No further action required.</p>
              </aside>
            </div>
          </section>
        </div>
      </div>

      <p className="ca-flow-footer">
        <IconInfo />
        <span>
          Associates must complete all required steps in order. Each step is recorded with a timestamp
          and user.
        </span>
      </p>
    </div>
  );
}

function IconDownArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRightArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRetest() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12a9 9 0 0 1 15.5-6.4M21 12a9 9 0 0 1-15.5 6.4" strokeLinecap="round" />
      <path d="M17 3v5h5M7 21v-5H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
