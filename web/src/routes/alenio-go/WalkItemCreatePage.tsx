import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  apiActionsToProcedure,
  emptyFailureProcedure,
  FailureProcedureBuilder,
  getFailureProcedureMissing,
  procedureToApiActions,
  TempsButton,
  TempsPageHeader,
  TempsPageShell,
  useTempsNotice,
  type FailureProcedureDraft,
} from "../../components/temps";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  createLibraryItem,
  fetchLibraryCategories,
  fetchLibraryItem,
  patchLibraryItem,
  putLibraryCorrectiveActions,
  type WalkLibraryItem,
} from "../../lib/walks/library-api";
import { isPhase2ItemType, type WalkItemType } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type StepId = "details" | "corrective" | "review";

const STEPS: { id: StepId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "corrective", label: "Failure Procedure" },
  { id: "review", label: "Review" },
];

const DEFAULT_CATEGORIES = [
  "Cold Storage",
  "Food Safety",
  "Hot Holding",
  "Corrective Action",
  "Administration",
  "Custom",
];

function typeLabel(type: WalkItemType) {
  if (type === "MULTIPLE_CHOICE") return "Multiple Choice";
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

function StepFooter({
  onBack,
  onNext,
  nextLabel,
  busy,
  onSaveDraft,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
  onSaveDraft?: () => void;
}) {
  return (
    <div className="wic-card-footer">
      <TempsButton variant="ghost" disabled={busy} onClick={onBack}>
        ← Back
      </TempsButton>
      <div className="wic-card-footer-actions">
        {onSaveDraft ? (
          <TempsButton variant="secondary" disabled={busy} onClick={onSaveDraft}>
            {busy ? "Saving…" : "Save Draft"}
          </TempsButton>
        ) : null}
        <TempsButton variant="primary" disabled={busy} onClick={onNext}>
          {nextLabel}
        </TempsButton>
      </div>
    </div>
  );
}

function asWalkType(value: string): WalkItemType {
  return (isPhase2ItemType(value) ? value : "TEMPERATURE") as WalkItemType;
}

function linesFromArray(value: unknown, fallback: string) {
  if (Array.isArray(value) && value.length) {
    return value.map((v) => String(v)).join("\n");
  }
  return fallback;
}

export function WalkItemCreatePage() {
  const { canManage, teamId } = useAlenioGoShell();
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId?: string }>();
  const isEdit = Boolean(itemId);
  const [step, setStep] = useState<StepId>("details");
  const [loadingItem, setLoadingItem] = useState(isEdit);
  const { showNotice, noticeDialog } = useTempsNotice();

  // Step 1
  const [name, setName] = useState("");
  const [type, setType] = useState<WalkItemType>("TEMPERATURE");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(true);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Shared / type config
  const [comparisonType, setComparisonType] = useState<"ABOVE" | "BELOW" | "BETWEEN">("BELOW");
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [minTemp, setMinTemp] = useState("0");
  const [maxTemp, setMaxTemp] = useState("41");
  const [allowManual, setAllowManual] = useState(true);
  const [allowBluetooth, setAllowBluetooth] = useState(true);
  const [requireRetest, setRequireRetest] = useState(false);
  const [maxRetests, setMaxRetests] = useState("1");
  const [passingAnswer, setPassingAnswer] = useState<"YES" | "NO">("YES");
  const [yesLabel, setYesLabel] = useState("Yes");
  const [noLabel, setNoLabel] = useState("No");
  const [passingOptions, setPassingOptions] = useState("Pass\nLooks good");
  const [failingOptions, setFailingOptions] = useState("Fail\nNeeds attention");
  const [requirePhotoOnFail, setRequirePhotoOnFail] = useState(true);
  const [minPhotos, setMinPhotos] = useState("1");
  const [maxPhotos, setMaxPhotos] = useState("3");
  const [photoGuidance, setPhotoGuidance] = useState("");
  const [mcOptions, setMcOptions] = useState("Option A\nOption B\nOption C");
  const [mcPassing, setMcPassing] = useState("Option A");
  const [mcAllowMultiple, setMcAllowMultiple] = useState(false);
  const [qtyComparison, setQtyComparison] = useState<"EXACT" | "AT_LEAST" | "AT_MOST" | "BETWEEN">(
    "AT_LEAST",
  );
  const [qtyMin, setQtyMin] = useState("1");
  const [qtyMax, setQtyMax] = useState("");
  const [qtyUnit, setQtyUnit] = useState("items");
  const [textPlaceholder, setTextPlaceholder] = useState("Enter notes…");
  const [textRequireNonEmpty, setTextRequireNonEmpty] = useState(true);
  const [instructionBody, setInstructionBody] = useState("");
  const [acknowledgeRequired, setAcknowledgeRequired] = useState(false);

  // Step 3 — failure procedure (1st failure → if pass / if fail)
  const [failureProcedure, setFailureProcedure] =
    useState<FailureProcedureDraft>(emptyFailureProcedure);
  const [showFpErrors, setShowFpErrors] = useState(false);

  // Step 5–6
  const [photoCaptureEnabled, setPhotoCaptureEnabled] = useState(true);
  const [associateInstructions, setAssociateInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!teamId) return;
    void fetchLibraryCategories(teamId)
      .then((cats) => {
        if (cats.length) setCategories(cats);
      })
      .catch(() => {});
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !itemId) {
      setLoadingItem(false);
      return;
    }
    let cancelled = false;
    setLoadingItem(true);
    setError(null);
    void fetchLibraryItem(teamId, itemId)
      .then((item) => {
        if (cancelled) return;
        hydrateFromItem(item);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load item");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingItem(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, itemId]);

  function hydrateFromItem(item: WalkLibraryItem) {
    const current = item.current;
    const config = (current?.config ?? {}) as Record<string, unknown>;
    setName(item.name ?? current?.name ?? "");
    setType(asWalkType(String(item.type)));
    setCategory(item.category || "Custom");
    setDescription(item.description ?? current?.description ?? "");
    setRequired(current?.requiredDefault ?? true);
    setAssociateInstructions(current?.instructions ?? "");

    const itemType = asWalkType(String(item.type));
    if (itemType === "TEMPERATURE") {
      const comparison = String(config.comparisonType ?? "BELOW");
      setComparisonType(
        comparison === "ABOVE" || comparison === "BETWEEN" || comparison === "BELOW"
          ? comparison
          : "BELOW",
      );
      setUnit(config.unit === "C" ? "C" : "F");
      setMinTemp(config.minimumTemperature != null ? String(config.minimumTemperature) : "0");
      setMaxTemp(config.maximumTemperature != null ? String(config.maximumTemperature) : "41");
      setAllowManual(config.allowManualEntry !== false);
      setAllowBluetooth(config.allowBluetoothProbe !== false);
      setRequireRetest(config.requireRetestOnFailure === true);
      setMaxRetests(config.maximumRetests != null ? String(config.maximumRetests) : "1");
    } else if (itemType === "YES_NO") {
      setPassingAnswer(config.passingAnswer === "NO" ? "NO" : "YES");
      setYesLabel(String(config.yesLabel ?? "Yes"));
      setNoLabel(String(config.noLabel ?? "No"));
    } else if (itemType === "VISUAL_CHECK") {
      setPassingOptions(linesFromArray(config.passingOptions, "Pass\nLooks good"));
      setFailingOptions(linesFromArray(config.failingOptions, "Fail\nNeeds attention"));
      setRequirePhotoOnFail(config.requirePhotoOnFailure !== false);
    } else if (itemType === "PHOTO") {
      setMinPhotos(config.minimumPhotos != null ? String(config.minimumPhotos) : "1");
      setMaxPhotos(config.maximumPhotos != null ? String(config.maximumPhotos) : "3");
      setPhotoGuidance(String(config.instructions ?? ""));
    } else if (itemType === "MULTIPLE_CHOICE") {
      setMcOptions(linesFromArray(config.options, "Option A\nOption B\nOption C"));
      setMcPassing(linesFromArray(config.passingOptions, "Option A"));
      setMcAllowMultiple(config.allowMultiple === true);
    } else if (itemType === "QUANTITY") {
      const qc = String(config.comparisonType ?? "AT_LEAST");
      setQtyComparison(
        qc === "EXACT" || qc === "AT_LEAST" || qc === "AT_MOST" || qc === "BETWEEN"
          ? qc
          : "AT_LEAST",
      );
      setQtyMin(
        config.minimum != null
          ? String(config.minimum)
          : config.target != null
            ? String(config.target)
            : "1",
      );
      setQtyMax(config.maximum != null ? String(config.maximum) : "");
      setQtyUnit(String(config.unitLabel ?? "items"));
    } else if (itemType === "TEXT") {
      setTextPlaceholder(String(config.placeholder ?? "Enter notes…"));
      setTextRequireNonEmpty(config.requireNonEmpty !== false);
    } else if (itemType === "INSTRUCTION") {
      setInstructionBody(String(config.body ?? ""));
      setAcknowledgeRequired(config.acknowledgeRequired === true);
    }

    setFailureProcedure(
      apiActionsToProcedure(current?.correctiveActions ?? [], {
        allowRetempAfterSteps: config.requireRetestOnFailure === true,
        retempNote:
          typeof config.retestGuidance === "string" ? config.retestGuidance : "",
      }),
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const detailsMissing = useMemo(() => {
    const missing: string[] = [];
    if (!name.trim()) missing.push("Item name");
    if (!category) missing.push("Category");
    if (type === "TEMPERATURE" && !allowManual && !allowBluetooth) {
      missing.push("At least one recording method (Manual or Bluetooth)");
    }
    return missing;
  }, [name, category, type, allowManual, allowBluetooth]);

  const canContinueDetails = detailsMissing.length === 0;

  function showDetailsMissingNotice(context: "continue" | "save" | "step") {
    const intro =
      context === "save"
        ? "Complete the following before saving:"
        : context === "step"
          ? "Complete the following before moving ahead:"
          : "Complete the following before continuing:";
    showNotice({
      title: detailsMissing.length === 1 ? "Required field missing" : "Required fields missing",
      message: intro,
      items: detailsMissing,
      tone: "warning",
    });
  }

  const failureMissing = useMemo(
    () => getFailureProcedureMissing(failureProcedure),
    [failureProcedure],
  );
  const canContinueFailure = failureMissing.length === 0;

  function showFailureMissingNotice(context: "continue" | "save" | "step") {
    setShowFpErrors(true);
    const intro =
      context === "save"
        ? "Complete the following before saving:"
        : context === "step"
          ? "Complete the following before moving ahead:"
          : "Complete the following before continuing:";
    showNotice({
      title: failureMissing.length === 1 ? "Required field missing" : "Required fields missing",
      message: intro,
      items: failureMissing,
      tone: "warning",
    });
  }

  function updateFailureProcedure(next: FailureProcedureDraft) {
    setFailureProcedure(next);
    if (showFpErrors && getFailureProcedureMissing(next).length === 0) {
      setShowFpErrors(false);
    }
  }

  const criteriaSummary = useMemo(() => {
    if (type === "TEMPERATURE") {
      const u = unit === "C" ? "°C" : "°F";
      if (comparisonType === "BELOW") return `At or below ${maxTemp || "—"}${u}`;
      if (comparisonType === "BETWEEN") return `Between ${minTemp || "—"}${u} and ${maxTemp || "—"}${u}`;
      return `At or above ${minTemp || "—"}${u}`;
    }
    if (type === "YES_NO") return `Passing answer: ${passingAnswer === "YES" ? yesLabel : noLabel}`;
    if (type === "QUANTITY") return `${qtyComparison.replace(/_/g, " ").toLowerCase()} ${qtyMin || qtyMax}`;
    if (type === "MULTIPLE_CHOICE") return `Passing: ${mcPassing.split("\n").filter(Boolean).join(", ") || "—"}`;
    if (type === "VISUAL_CHECK") return `Pass options: ${passingOptions.split("\n").filter(Boolean).join(", ")}`;
    return "Configured on next steps";
  }, [
    type,
    unit,
    comparisonType,
    minTemp,
    maxTemp,
    passingAnswer,
    yesLabel,
    noLabel,
    qtyComparison,
    qtyMin,
    qtyMax,
    mcPassing,
    passingOptions,
  ]);

  function lines(raw: string) {
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildConfig(): Record<string, unknown> {
    if (type === "TEMPERATURE") {
      return {
        comparisonType,
        unit,
        minimumTemperature: comparisonType === "BELOW" ? null : Number(minTemp) || null,
        maximumTemperature: comparisonType === "ABOVE" ? null : Number(maxTemp) || null,
        allowManualEntry: allowManual,
        allowBluetoothProbe: allowBluetooth,
        requireRetestOnFailure: failureProcedure.allowRetempAfterSteps,
        maximumRetests: failureProcedure.allowRetempAfterSteps
          ? Math.max(1, Number(maxRetests) || 1)
          : Math.max(0, Number(maxRetests) || 0),
        retestGuidance: failureProcedure.allowRetempAfterSteps
          ? failureProcedure.retempNote.trim() || null
          : null,
      };
    }
    if (type === "YES_NO") {
      return { passingAnswer, yesLabel: yesLabel.trim() || "Yes", noLabel: noLabel.trim() || "No" };
    }
    if (type === "VISUAL_CHECK") {
      return {
        passingOptions: lines(passingOptions),
        failingOptions: lines(failingOptions),
        requirePhotoOnFailure: requirePhotoOnFail,
      };
    }
    if (type === "PHOTO") {
      const minimumPhotos = Math.max(1, Number(minPhotos) || 1);
      const maximumPhotos = Math.max(minimumPhotos, Number(maxPhotos) || 3);
      return {
        minimumPhotos,
        maximumPhotos,
        instructions: photoGuidance.trim() || null,
      };
    }
    if (type === "MULTIPLE_CHOICE") {
      return {
        options: lines(mcOptions),
        passingOptions: lines(mcPassing),
        allowMultiple: mcAllowMultiple,
      };
    }
    if (type === "QUANTITY") {
      return {
        comparisonType: qtyComparison,
        target: Number(qtyMin) || null,
        minimum: Number(qtyMin) || null,
        maximum: qtyMax.trim() === "" ? null : Number(qtyMax),
        unitLabel: qtyUnit.trim() || null,
      };
    }
    if (type === "TEXT") {
      return {
        placeholder: textPlaceholder.trim() || null,
        minLength: 0,
        maxLength: 500,
        requireNonEmpty: textRequireNonEmpty,
      };
    }
    return {
      body: instructionBody.trim(),
      acknowledgeRequired,
    };
  }

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  async function saveItem() {
    if (!canContinueDetails) {
      setStep("details");
      showDetailsMissingNotice("save");
      return;
    }
    if (!canContinueFailure) {
      setStep("corrective");
      showFailureMissingNotice("save");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const actions = procedureToApiActions(failureProcedure);

      if (isEdit && itemId) {
        await patchLibraryItem(teamId!, itemId, {
          name: name.trim(),
          category,
          description: description.trim() || null,
          instructions: associateInstructions.trim() || null,
          requiredDefault: required,
          config: buildConfig(),
        });
        await putLibraryCorrectiveActions(teamId!, itemId, actions);
        navigate("/go/temp-checks/library", { state: { editedItemId: itemId } });
        return;
      }

      const item = await createLibraryItem(teamId!, {
        name: name.trim(),
        type,
        category,
        description: description.trim() || null,
        instructions: associateInstructions.trim() || null,
        requiredDefault: required,
        config: buildConfig(),
      });
      if (actions.length > 0) {
        await putLibraryCorrectiveActions(teamId!, item.id, actions);
      }
      navigate("/go/temp-checks/library", { state: { createdItemId: item.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save item");
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (step === "details" && !canContinueDetails) {
      showDetailsMissingNotice("continue");
      return;
    }
    if (step === "corrective" && !canContinueFailure) {
      showFailureMissingNotice("continue");
      return;
    }
    setError(null);
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function goBack() {
    setError(null);
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  function continueLabel() {
    const next = STEPS[stepIndex + 1];
    if (next) return `Continue to ${next.label} →`;
    return isEdit ? "Save changes" : "Save Item";
  }

  if (loadingItem) {
    return (
      <TempsPageShell testId="walk-item-create-page" wide className="wic-page">
        <EnterprisePageLoading label="Loading item…" />
      </TempsPageShell>
    );
  }

  return (
    <TempsPageShell testId="walk-item-create-page" wide className="wic-page">
      <TempsPageHeader
        breadcrumb={
          <>
            <Link to="/go/temp-checks/library">Item Library</Link>
            <span aria-hidden>/</span>
            <span>{isEdit ? "Edit Item" : "Create Item"}</span>
          </>
        }
        title={name.trim() || (isEdit ? "Edit Item" : "Create New Item")}
        actions={
          <>
            <TempsButton
              variant="secondary"
              disabled={busy}
              onClick={() => navigate("/go/temp-checks/library")}
            >
              Cancel
            </TempsButton>
            <TempsButton variant="primary" disabled={busy} onClick={() => void saveItem()}>
              {busy ? "Saving…" : "Save as Draft"}
            </TempsButton>
          </>
        }
      />

      {error ? <p className="temps-error">{error}</p> : null}
      {noticeDialog}

      <div className="wic-body">
        <aside className="wic-steps" aria-label="Create steps">
          <nav className="wic-steps-nav">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`wic-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
                  onClick={() => {
                    if (i > 0 && !canContinueDetails) {
                      setStep("details");
                      showDetailsMissingNotice("step");
                      return;
                    }
                    if (i > 1 && !canContinueFailure) {
                      setStep("corrective");
                      showFailureMissingNotice("step");
                      return;
                    }
                    setError(null);
                    setStep(s.id);
                  }}
                >
                  <span className="wic-step-num" aria-hidden>
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="wic-step-label">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="wic-main">
          {step === "details" ? (
            <section className="wic-card wic-card--details">
              <header className="wic-card-top wic-card-top--compact">
                <div className="wic-card-title-row">
                  <h2>1. Item Details</h2>
                  <span className="wic-inline-summary" aria-live="polite">
                    {criteriaSummary}
                  </span>
                </div>
              </header>
              <div className="wic-details-fit">
                <div className="wic-details-top">
                  <section className="wic-panel wic-panel--compact" aria-labelledby="wic-basics-title">
                    <header className="wic-panel-head wic-panel-head--compact">
                      <h3 id="wic-basics-title">Basics</h3>
                    </header>
                    <div className="wic-panel-body wic-panel-body--compact">
                      <label className="wic-field wic-field--full">
                        <span>
                          Item name <i>*</i>
                        </span>
                        <input
                          value={name}
                          maxLength={100}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Walk-In Cooler Temperature"
                        />
                      </label>
                      <div className="wic-grid wic-grid--2">
                        <label className="wic-field">
                          <span>
                            Type <i>*</i>
                          </span>
                          <div className="wic-select-with-icon">
                            <span className="wic-select-ico">
                              <WalkTypeIcon type={type} size={16} />
                            </span>
                            <select
                              value={type}
                              disabled={isEdit}
                              onChange={(e) => setType(e.target.value as WalkItemType)}
                            >
                              {WALK_PALETTE_CARDS.map((c) => (
                                <option key={c.type} value={c.type}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </label>
                        <label className="wic-field">
                          <span>
                            Category <i>*</i>
                          </span>
                          <select value={category} onChange={(e) => setCategory(e.target.value)}>
                            <option value="">Select…</option>
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="wic-field">
                        <span>Default on walks</span>
                        <div className="wic-segment" role="group" aria-label="Required default">
                          <button
                            type="button"
                            className={required ? "is-active" : undefined}
                            onClick={() => setRequired(true)}
                          >
                            Required
                          </button>
                          <button
                            type="button"
                            className={!required ? "is-active" : undefined}
                            onClick={() => setRequired(false)}
                          >
                            Optional
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="wic-panel wic-panel--compact" aria-labelledby="wic-methods-title">
                    <header className="wic-panel-head wic-panel-head--compact">
                      <h3 id="wic-methods-title">Recording methods</h3>
                    </header>
                    <div className="wic-panel-body wic-panel-body--compact">
                      <div className="wic-method-list" role="group" aria-label="Recording methods">
                        {type === "TEMPERATURE" ? (
                          <>
                            <label className={`wic-method-row${allowManual ? " is-on" : ""}`}>
                              <input
                                type="checkbox"
                                checked={allowManual}
                                onChange={(e) => setAllowManual(e.target.checked)}
                              />
                              <span>
                                <strong>Manual entry</strong>
                                <em>Associates type the temperature on the device</em>
                              </span>
                            </label>
                            <label className={`wic-method-row${allowBluetooth ? " is-on" : ""}`}>
                              <input
                                type="checkbox"
                                checked={allowBluetooth}
                                onChange={(e) => setAllowBluetooth(e.target.checked)}
                              />
                              <span>
                                <strong>Bluetooth thermometer</strong>
                                <em>Capture readings from a connected probe</em>
                              </span>
                            </label>
                          </>
                        ) : null}
                        <label className={`wic-method-row${photoCaptureEnabled ? " is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={photoCaptureEnabled}
                            onChange={(e) => setPhotoCaptureEnabled(e.target.checked)}
                          />
                          <span>
                            <strong>Photo capture</strong>
                            <em>Allow associates to attach a photo</em>
                          </span>
                        </label>
                      </div>
                    </div>
                  </section>
                </div>

                <section className="wic-panel wic-panel--criteria" aria-labelledby="wic-criteria-title">
                  <header className="wic-panel-head wic-panel-head--compact">
                    <h3 id="wic-criteria-title">Passing criteria</h3>
                    <span className="wic-type-chip">
                      <WalkTypeIcon type={type} size={14} />
                      {typeLabel(type)}
                    </span>
                  </header>
                  <div className="wic-panel-body wic-panel-body--compact wic-criteria-body">
                    {type === "TEMPERATURE" ? (
                      <div className="wic-grid wic-grid--3">
                        <label className="wic-field">
                          <span>Unit</span>
                          <select value={unit} onChange={(e) => setUnit(e.target.value as "F" | "C")}>
                            <option value="F">°F</option>
                            <option value="C">°C</option>
                          </select>
                        </label>
                        <label className="wic-field">
                          <span>Pass when</span>
                          <select
                            value={comparisonType}
                            onChange={(e) =>
                              setComparisonType(e.target.value as "ABOVE" | "BELOW" | "BETWEEN")
                            }
                          >
                            <option value="ABOVE">At or above min</option>
                            <option value="BELOW">At or below max</option>
                            <option value="BETWEEN">Between min & max</option>
                          </select>
                        </label>
                        {comparisonType !== "BELOW" ? (
                          <label className="wic-field">
                            <span>Minimum (°{unit})</span>
                            <input
                              type="number"
                              value={minTemp}
                              onChange={(e) => setMinTemp(e.target.value)}
                            />
                          </label>
                        ) : null}
                        {comparisonType !== "ABOVE" ? (
                          <label className="wic-field">
                            <span>Maximum (°{unit})</span>
                            <input
                              type="number"
                              value={maxTemp}
                              onChange={(e) => setMaxTemp(e.target.value)}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    {type === "YES_NO" ? (
                      <div className="wic-grid wic-grid--3">
                        <label className="wic-field">
                          <span>Yes label</span>
                          <input value={yesLabel} onChange={(e) => setYesLabel(e.target.value)} />
                        </label>
                        <label className="wic-field">
                          <span>No label</span>
                          <input value={noLabel} onChange={(e) => setNoLabel(e.target.value)} />
                        </label>
                        <label className="wic-field">
                          <span>Passing answer</span>
                          <select
                            value={passingAnswer}
                            onChange={(e) => setPassingAnswer(e.target.value as "YES" | "NO")}
                          >
                            <option value="YES">Yes passes</option>
                            <option value="NO">No passes</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {type === "VISUAL_CHECK" ? (
                      <>
                        <div className="wic-grid wic-grid--2">
                          <label className="wic-field">
                            <span>Passing options</span>
                            <textarea
                              rows={3}
                              value={passingOptions}
                              onChange={(e) => setPassingOptions(e.target.value)}
                              placeholder={"Pass\nLooks good"}
                            />
                          </label>
                          <label className="wic-field">
                            <span>Failing options</span>
                            <textarea
                              rows={3}
                              value={failingOptions}
                              onChange={(e) => setFailingOptions(e.target.value)}
                              placeholder={"Fail\nNeeds attention"}
                            />
                          </label>
                        </div>
                        <label className="wic-check">
                          <input
                            type="checkbox"
                            checked={requirePhotoOnFail}
                            onChange={(e) => setRequirePhotoOnFail(e.target.checked)}
                          />
                          Require photo on fail
                        </label>
                      </>
                    ) : null}

                    {type === "PHOTO" ? (
                      <div className="wic-grid wic-grid--3">
                        <label className="wic-field">
                          <span>Min photos</span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={minPhotos}
                            onChange={(e) => setMinPhotos(e.target.value)}
                          />
                        </label>
                        <label className="wic-field">
                          <span>Max photos</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={maxPhotos}
                            onChange={(e) => setMaxPhotos(e.target.value)}
                          />
                        </label>
                        <label className="wic-field">
                          <span>Guidance</span>
                          <input
                            value={photoGuidance}
                            onChange={(e) => setPhotoGuidance(e.target.value)}
                            placeholder="What to capture"
                          />
                        </label>
                      </div>
                    ) : null}

                    {type === "MULTIPLE_CHOICE" ? (
                      <>
                        <div className="wic-grid wic-grid--2">
                          <label className="wic-field">
                            <span>All options</span>
                            <textarea
                              rows={3}
                              value={mcOptions}
                              onChange={(e) => setMcOptions(e.target.value)}
                              placeholder={"Option A\nOption B"}
                            />
                          </label>
                          <label className="wic-field">
                            <span>Passing options</span>
                            <textarea
                              rows={3}
                              value={mcPassing}
                              onChange={(e) => setMcPassing(e.target.value)}
                              placeholder="Option A"
                            />
                          </label>
                        </div>
                        <label className="wic-check">
                          <input
                            type="checkbox"
                            checked={mcAllowMultiple}
                            onChange={(e) => setMcAllowMultiple(e.target.checked)}
                          />
                          Allow multiple selections
                        </label>
                      </>
                    ) : null}

                    {type === "QUANTITY" ? (
                      <div className="wic-grid wic-grid--3">
                        <label className="wic-field">
                          <span>Unit</span>
                          <input
                            value={qtyUnit}
                            onChange={(e) => setQtyUnit(e.target.value)}
                            placeholder="items"
                          />
                        </label>
                        <label className="wic-field">
                          <span>Pass when</span>
                          <select
                            value={qtyComparison}
                            onChange={(e) =>
                              setQtyComparison(e.target.value as typeof qtyComparison)
                            }
                          >
                            <option value="AT_LEAST">At least</option>
                            <option value="AT_MOST">At most</option>
                            <option value="EXACT">Exactly</option>
                            <option value="BETWEEN">Between</option>
                          </select>
                        </label>
                        <label className="wic-field">
                          <span>Min / target</span>
                          <input
                            type="number"
                            value={qtyMin}
                            onChange={(e) => setQtyMin(e.target.value)}
                          />
                        </label>
                        {qtyComparison === "BETWEEN" || qtyComparison === "AT_MOST" ? (
                          <label className="wic-field">
                            <span>Maximum</span>
                            <input
                              type="number"
                              value={qtyMax}
                              onChange={(e) => setQtyMax(e.target.value)}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    {type === "TEXT" ? (
                      <div className="wic-grid wic-grid--2">
                        <label className="wic-field">
                          <span>Placeholder</span>
                          <input
                            value={textPlaceholder}
                            onChange={(e) => setTextPlaceholder(e.target.value)}
                            placeholder="Enter notes…"
                          />
                        </label>
                        <label className="wic-check" style={{ alignSelf: "end", marginBottom: "0.35rem" }}>
                          <input
                            type="checkbox"
                            checked={textRequireNonEmpty}
                            onChange={(e) => setTextRequireNonEmpty(e.target.checked)}
                          />
                          Require non-empty note
                        </label>
                      </div>
                    ) : null}

                    {type === "INSTRUCTION" ? (
                      <>
                        <label className="wic-field wic-field--full">
                          <span>Instruction</span>
                          <textarea
                            rows={3}
                            value={instructionBody}
                            onChange={(e) => setInstructionBody(e.target.value)}
                            placeholder="What should associates read?"
                          />
                        </label>
                        <label className="wic-check">
                          <input
                            type="checkbox"
                            checked={acknowledgeRequired}
                            onChange={(e) => setAcknowledgeRequired(e.target.checked)}
                          />
                          Require acknowledgment
                        </label>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>
              <div className="wic-card-footer">
                <span />
                <TempsButton variant="primary" onClick={goNext}>
                  {continueLabel()}
                </TempsButton>
              </div>
            </section>
          ) : null}

          {step === "corrective" ? (
            <section className="wic-card wic-card--fp">
              <header className="wic-card-top">
                <div className="wic-card-title-row">
                  <h2>2. Failure Procedure</h2>
                  <span className="fp-required-pill">Required</span>
                </div>
                <p className="wic-lede">
                  Configure the standard workflow associates must complete when this inspection item
                  fails.
                </p>
              </header>
              <div className="wic-card-scroll">
                <FailureProcedureBuilder
                  value={failureProcedure}
                  onChange={updateFailureProcedure}
                  showRequiredErrors={showFpErrors}
                />
              </div>
              <StepFooter
                onBack={goBack}
                onNext={goNext}
                nextLabel={continueLabel()}
                busy={busy}
                onSaveDraft={() => void saveItem()}
              />
            </section>
          ) : null}

          {step === "review" ? (
            <section className="wic-card">
              <h2>3. Review</h2>
              <p className="wic-lede">Confirm everything looks right, then save.</p>
              <dl className="wic-review">
                <div>
                  <dt>Name</dt>
                  <dd>{name.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{typeLabel(type)}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{category || "—"}</dd>
                </div>
                <div>
                  <dt>Required</dt>
                  <dd>{required ? "Required" : "Optional"}</dd>
                </div>
                <div>
                  <dt>Passing criteria</dt>
                  <dd>{criteriaSummary}</dd>
                </div>
                <div>
                  <dt>Failure procedure</dt>
                  <dd>
                    {(() => {
                      const first = failureProcedure.firstFailureSteps
                        .map((s) => s.text.trim())
                        .filter(Boolean);
                      const fail = failureProcedure.ifFailSteps
                        .map((s) => s.text.trim())
                        .filter(Boolean);
                      if (!first.length && !fail.length && !failureProcedure.ifPassNote.trim()) {
                        return "None configured";
                      }
                      const parts = [
                        first.length ? `1st failure: ${first.join(" → ")}` : null,
                        "If pass: continue",
                        fail.length ? `If fail: ${fail.join(" → ")}` : null,
                      ].filter(Boolean);
                      return parts.join(" · ");
                    })()}
                  </dd>
                </div>
                <div>
                  <dt>Devices</dt>
                  <dd>
                    {[
                      type === "TEMPERATURE" && allowManual ? "Manual" : null,
                      type === "TEMPERATURE" && allowBluetooth ? "Bluetooth" : null,
                      photoCaptureEnabled ? "Photo" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
              <StepFooter
                onBack={goBack}
                onNext={() => void saveItem()}
                nextLabel={busy ? "Saving…" : isEdit ? "Save changes" : "Save Item"}
                busy={busy}
              />
            </section>
          ) : null}
        </main>
      </div>
    </TempsPageShell>
  );
}
