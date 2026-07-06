import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { TempCheckEquipmentPayload } from "../../lib/api";
import { CorrectiveStepsEditor } from "./CorrectiveStepsEditor";
import {
  buildFlowPreviewTree,
  defaultEquipmentFlowConfig,
  flowConfigToLegacyPayload,
  getWizardSteps,
  legacyEquipmentToFlowConfig,
  validateEquipmentFlow,
  type EquipmentCheckFlowConfig,
  type FlowWizardStepId,
} from "../../lib/equipment-check-flow";
import { formatTempRange } from "../../lib/temp-checks-display";

type Props = {
  pageTitle: string;
  pageSubtitle: string;
  busy?: boolean;
  error?: string | null;
  initial?: Parameters<typeof legacyEquipmentToFlowConfig>[0];
  onSubmit: (payload: TempCheckEquipmentPayload & Record<string, unknown>, publish: boolean) => Promise<void>;
  onCancel: () => void;
};

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="tc-flow-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function EquipmentCheckFlowWizard({
  pageTitle,
  pageSubtitle,
  busy,
  error,
  initial,
  onSubmit,
  onCancel,
}: Props) {
  const [step, setStep] = useState<FlowWizardStepId>("details");
  const [flow, setFlow] = useState<EquipmentCheckFlowConfig>(() =>
    initial ? legacyEquipmentToFlowConfig(initial) : defaultEquipmentFlowConfig(),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const wizardSteps = useMemo(() => getWizardSteps(flow.allowRecheck), [flow.allowRecheck]);
  const health = useMemo(() => validateEquipmentFlow(flow), [flow]);
  const previewTree = useMemo(() => buildFlowPreviewTree(flow), [flow]);
  const rangeLabel = formatTempRange(flow.details.tempMinF, flow.details.tempMaxF);
  const previewReading =
    flow.details.tempMaxF != null ? flow.details.tempMaxF + 5 : flow.details.tempMinF != null ? flow.details.tempMinF + 5 : 46;

  function patchFlow(patch: Partial<EquipmentCheckFlowConfig>) {
    setFlow((prev) => ({ ...prev, ...patch }));
    if (patch.allowRecheck === false) {
      setStep((current) => (current === "recheck-rules" ? "preview" : current));
    }
  }

  useEffect(() => {
    if (wizardSteps.some((wizardStep) => wizardStep.id === step)) return;
    setStep(wizardSteps[wizardSteps.length - 1]!.id);
  }, [wizardSteps, step]);

  async function handleSave(publish: boolean) {
    setLocalError(null);
    const validation = validateEquipmentFlow(flow);
    if (publish && !validation.complete) {
      setLocalError(validation.labels[0] ?? "Complete the flow before publishing.");
      setStep("preview");
      return;
    }
    if (!flow.details.name.trim()) {
      setLocalError("Add an equipment name.");
      setStep("details");
      return;
    }
    const payload = flowConfigToLegacyPayload({
      ...flow,
      publishedAt: publish ? new Date().toISOString() : flow.publishedAt,
    });
    await onSubmit(payload, publish);
  }

  const displayError = localError ?? error;
  const stepIndex = wizardSteps.findIndex((s) => s.id === step);
  const safeStepIndex = stepIndex >= 0 ? stepIndex : 0;
  const activeStep = wizardSteps[safeStepIndex]?.id ?? wizardSteps[0]!.id;
  const isLastStep = safeStepIndex >= wizardSteps.length - 1;

  function goNext() {
    const next = wizardSteps[safeStepIndex + 1];
    if (next) {
      setLocalError(null);
      setStep(next.id);
    }
  }

  function goBack() {
    const prev = wizardSteps[safeStepIndex - 1];
    if (prev) setStep(prev.id);
  }

  function renderStepContent() {
    switch (activeStep) {
      case "details":
        return (
          <section className="tc-flow-card">
            <h3>Equipment Details</h3>
            <p>Name and acceptable temperature range for this equipment.</p>
            <div className="tc-flow-field-grid">
              <label className="tc-flow-field">
                <span>Equipment name</span>
                <input
                  type="text"
                  value={flow.details.name}
                  onChange={(e) => patchFlow({ details: { ...flow.details, name: e.target.value } })}
                />
              </label>
              <label className="tc-flow-field">
                <span>Minimum temp (°F)</span>
                <input
                  type="number"
                  value={flow.details.tempMinF ?? ""}
                  onChange={(e) =>
                    patchFlow({ details: { ...flow.details, tempMinF: parseNumberInput(e.target.value) } })
                  }
                />
              </label>
              <label className="tc-flow-field">
                <span>Maximum temp (°F)</span>
                <input
                  type="number"
                  value={flow.details.tempMaxF ?? ""}
                  onChange={(e) =>
                    patchFlow({ details: { ...flow.details, tempMaxF: parseNumberInput(e.target.value) } })
                  }
                />
              </label>
            </div>
          </section>
        );

      case "corrective-actions":
        return (
          <section className="tc-flow-card tc-flow-card--fail">
            <h3>Corrective Actions</h3>
            <p>When a reading is out of range, leaders check off each step before continuing.</p>
            <CorrectiveStepsEditor
              steps={flow.correctiveSteps}
              onChange={(correctiveSteps) => patchFlow({ correctiveSteps })}
            />
            <div className="tc-flow-recheck-toggle">
              <ToggleRow
                label="Allow recheck once all corrective actions are complete"
                checked={flow.allowRecheck}
                onChange={(allowRecheck) => patchFlow({ allowRecheck })}
              />
            </div>
          </section>
        );

      case "recheck-rules":
        return (
          <>
            <section className="tc-flow-card tc-flow-card--pass">
              <h3>If Recheck Passes</h3>
              <p>When the new reading is in range, the leader proceeds to the next item.</p>
              <p className="tc-flow-pass-fixed">Proceed to next item</p>
            </section>
            <section className="tc-flow-card tc-flow-card--fail">
              <h3>If Recheck Fails</h3>
              <p>Leaders complete these final corrective steps, then choose what happens next.</p>
              <CorrectiveStepsEditor
                steps={flow.finalCorrectiveSteps}
                onChange={(finalCorrectiveSteps) => patchFlow({ finalCorrectiveSteps })}
              />
              <div className="tc-flow-recheck-toggle">
                <ToggleRow
                  label="Allow one additional recheck after final actions are complete"
                  checked={flow.allowSecondRecheck}
                  onChange={(allowSecondRecheck) => patchFlow({ allowSecondRecheck })}
                />
                <ToggleRow
                  label="Allow closure after final actions are complete"
                  checked={flow.allowClosureAfterFinal}
                  onChange={(allowClosureAfterFinal) => patchFlow({ allowClosureAfterFinal })}
                />
              </div>
            </section>
          </>
        );

      case "preview":
        return (
          <section className="tc-flow-card">
            <h3>Preview</h3>
            {health.complete ? (
              <>
                <p className="tc-flow-health tc-flow-health--ok">Ready to save.</p>
                <p className="tc-flow-preview-hint">Click Publish below to finish.</p>
              </>
            ) : (
              <ul className="tc-flow-health-list">
                {health.labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            )}
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <div className="temp-check-builder temp-check-builder--equipment-flow-wizard">
      <div className="temp-check-builder-inner temp-check-builder-inner--equipment-flow-wizard">
        <header className="temp-check-builder-header">
          <div>
            <Link to="/go/temp-checks" className="temp-check-builder-back" onClick={(e) => { e.preventDefault(); onCancel(); }}>
              ← Temp checks
            </Link>
            <h1 className="temp-check-builder-title">{pageTitle}</h1>
            <p className="temp-check-builder-subtitle">{pageSubtitle}</p>
          </div>
          <div className="temp-check-builder-header-actions">
            <button type="button" className="temp-check-btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="temp-check-btn-secondary" onClick={() => void handleSave(false)} disabled={busy}>
              Save draft
            </button>
            <button type="button" className="temp-check-btn-primary" onClick={() => void handleSave(true)} disabled={busy || !health.complete}>
              {busy ? "Saving…" : "Publish"}
            </button>
          </div>
        </header>

        {displayError ? <p className="temp-check-builder-error">{displayError}</p> : null}

        <div className="tc-flow-wizard-layout">
          <nav className="tc-flow-wizard-nav" aria-label="Wizard steps">
            {wizardSteps.map((wizardStep, index) => (
              <button
                key={wizardStep.id}
                type="button"
                className={`tc-flow-wizard-nav-item${activeStep === wizardStep.id ? " tc-flow-wizard-nav-item--active" : ""}${index < safeStepIndex ? " tc-flow-wizard-nav-item--done" : ""}`}
                onClick={() => setStep(wizardStep.id)}
              >
                <span className="tc-flow-wizard-nav-num">{index + 1}</span>
                <span>
                  <strong>{wizardStep.label}</strong>
                  <small>{wizardStep.description}</small>
                </span>
              </button>
            ))}
          </nav>

          <main className="tc-flow-wizard-main">
            {renderStepContent()}
            <div className="tc-flow-wizard-footer">
              <button type="button" className="temp-check-btn-secondary" disabled={safeStepIndex === 0} onClick={goBack}>
                Back
              </button>
              {isLastStep ? (
                <button
                  type="button"
                  className="temp-check-btn-primary"
                  disabled={busy || !health.complete}
                  onClick={() => void handleSave(true)}
                >
                  {busy ? "Saving…" : "Publish"}
                </button>
              ) : (
                <button type="button" className="temp-check-btn-primary" onClick={goNext}>
                  Continue
                </button>
              )}
            </div>
          </main>

          <aside className="tc-flow-wizard-preview">
            <section className="tc-flow-preview-card">
              <h3>Flow Preview</h3>
              <pre className="tc-flow-preview-tree">{previewTree.join("\n")}</pre>
            </section>
            <section className="tc-flow-preview-card">
              <h3>Leader Preview</h3>
              <div className="tc-es-phone-preview-inner">
                <div className="tc-es-phone-head">{flow.details.name || "Equipment"}</div>
                <div className="tc-es-phone-row">
                  <span>Safe range</span>
                  <strong>{rangeLabel}</strong>
                </div>
                <div className="tc-es-phone-row">
                  <span>Enter temp</span>
                  <strong>{previewReading}°F</strong>
                </div>
                <div className="tc-es-phone-status tc-es-phone-status--fail">Out of range</div>
                <div className="tc-es-phone-section">
                  <span className="tc-es-phone-section-label">Complete these steps</span>
                  <ul className="tc-es-phone-actions">
                    {flow.correctiveSteps.length > 0 ? (
                      flow.correctiveSteps.map((stepLabel) => <li key={stepLabel}>{stepLabel}</li>)
                    ) : (
                      <li className="tc-es-phone-actions-empty">Add steps above</li>
                    )}
                  </ul>
                  {flow.allowRecheck ? (
                    <p className="tc-flow-preview-recheck-note">Then recheck immediately</p>
                  ) : (
                    <p className="tc-flow-preview-recheck-note">Then continue</p>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
