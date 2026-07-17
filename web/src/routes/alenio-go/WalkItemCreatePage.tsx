import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  createLibraryItem,
  fetchLibraryCategories,
  putLibraryCorrectiveActions,
} from "../../lib/walks/library-api";
import type { WalkItemType } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

const STEPS = [
  { id: "details", label: "Item Details", hint: "Name, type and basic info" },
  { id: "config", label: "Configuration", hint: "Set up item requirements" },
  { id: "criteria", label: "Passing Criteria", hint: "Define pass / fail rules" },
  { id: "corrective", label: "Corrective Actions", hint: "Actions if the item fails" },
  { id: "devices", label: "Devices & Methods", hint: "How the item is performed" },
  { id: "instructions", label: "Instructions", hint: "Guidance for associates" },
  { id: "review", label: "Review", hint: "Review and save item" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const DEFAULT_CATEGORIES = [
  "Cold Storage",
  "Food Safety",
  "Hot Holding",
  "Corrective Action",
  "Administration",
  "Custom",
];

const CA_TYPES = [
  { value: "RETEST_TEMPERATURE", label: "Retake temperature" },
  { value: "TAKE_PHOTO", label: "Take a photo" },
  { value: "ADD_NOTE", label: "Add a note" },
  { value: "NOTIFY_MANAGER", label: "Notify manager" },
  { value: "BLOCK_COMPLETION", label: "Block completion" },
  { value: "MARK_RESOLVED", label: "Mark resolved" },
] as const;

type CorrectiveDraft = {
  id: string;
  actionType: string;
  title: string;
  instructions: string;
  blocksCompletion: boolean;
};

const USE_CASES: Record<string, string[]> = {
  TEMPERATURE: ["Walk-In Cooler", "Freezer", "Hot Holding", "Prep Table", "Dairy Cooler"],
  YES_NO: ["Door closed", "Cleanliness check", "Stocked correctly"],
  VISUAL_CHECK: ["Product condition", "Label check", "Spill risk"],
  PHOTO: ["Evidence of cleanup", "Before / after", "Label photo"],
  MULTIPLE_CHOICE: ["Condition rating", "Stock level", "Status select"],
  QUANTITY: ["Par count", "Portion check", "Case count"],
  TEXT: ["Manager note", "Issue detail", "Follow-up"],
  INSTRUCTION: ["Safety reminder", "SOP acknowledge", "Process tip"],
};

function typeLabel(type: WalkItemType) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

function typeDescription(type: WalkItemType) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.description ?? "";
}

function newCaId() {
  return `ca-${Math.random().toString(36).slice(2, 9)}`;
}

function StepFooter({
  onBack,
  onNext,
  nextLabel,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
}) {
  return (
    <div className="wic-card-footer">
      <button type="button" className="wic-btn wic-btn--ghost" disabled={busy} onClick={onBack}>
        ← Back
      </button>
      <button type="button" className="wic-btn wic-btn--primary" disabled={busy} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  );
}

export function WalkItemCreatePage() {
  const { canManage, teamId } = useAlenioGoShell();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepId>("details");

  // Step 1
  const [name, setName] = useState("");
  const [type, setType] = useState<WalkItemType>("TEMPERATURE");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(true);
  const [frequency, setFrequency] = useState("schedule");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Shared / type config
  const [comparisonType, setComparisonType] = useState<"ABOVE" | "BELOW" | "BETWEEN">("BELOW");
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [minTemp, setMinTemp] = useState("0");
  const [maxTemp, setMaxTemp] = useState("41");
  const [allowManual, setAllowManual] = useState(true);
  const [allowBluetooth, setAllowBluetooth] = useState(false);
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

  // Step 4
  const [corrective, setCorrective] = useState<CorrectiveDraft[]>([
    {
      id: newCaId(),
      actionType: "NOTIFY_MANAGER",
      title: "Notify manager",
      instructions: "",
      blocksCompletion: false,
    },
  ]);

  // Step 5–6
  const [photoCaptureEnabled, setPhotoCaptureEnabled] = useState(true);
  const [associateInstructions, setAssociateInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"phone" | "tablet">("phone");

  useEffect(() => {
    if (!teamId) return;
    void fetchLibraryCategories(teamId)
      .then((cats) => {
        if (cats.length) setCategories(cats);
      })
      .catch(() => {});
  }, [teamId]);

  const previewTitle = name.trim() || "New Item Preview";
  const useCases = USE_CASES[type] ?? USE_CASES.TEMPERATURE;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const canContinueDetails = useMemo(
    () => name.trim().length > 0 && Boolean(category),
    [name, category],
  );

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
        requireRetestOnFailure: requireRetest,
        maximumRetests: Math.max(0, Number(maxRetests) || 0),
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
    if (!name.trim()) {
      setError("Item name is required.");
      setStep("details");
      return;
    }
    if (!category) {
      setError("Category is required.");
      setStep("details");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const item = await createLibraryItem(teamId!, {
        name: name.trim(),
        type,
        category,
        description: description.trim() || null,
        instructions: associateInstructions.trim() || null,
        requiredDefault: required,
        config: buildConfig(),
      });
      const actions = corrective
        .filter((a) => a.title.trim())
        .map((a) => ({
          actionType: a.actionType,
          title: a.title.trim(),
          instructions: a.instructions.trim() || null,
          blocksCompletion: a.blocksCompletion || a.actionType === "BLOCK_COMPLETION",
        }));
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
      setError("Fill in required Item Name and Category before continuing.");
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
    return next ? `Continue to ${next.label} →` : "Save Item";
  }

  return (
    <div className="wic-page" data-testid="walk-item-create-page">
      <div className="wic-top">
        <div>
          <nav className="wic-crumbs" aria-label="Breadcrumb">
            <Link to="/go/temp-checks/library">Item Library</Link>
            <span aria-hidden>›</span>
            <span>Create Item</span>
          </nav>
          <h1 className="wic-title">Create New Item</h1>
          <p className="wic-subtitle">Build a reusable inspection item to add to your walks.</p>
        </div>
        <div className="wic-top-actions">
          <button
            type="button"
            className="wic-btn wic-btn--ghost"
            disabled={busy}
            onClick={() => navigate("/go/temp-checks/library")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wic-btn wic-btn--primary"
            disabled={busy}
            onClick={() => void saveItem()}
          >
            {busy ? "Saving…" : "Save as Draft"}
            <span aria-hidden>▾</span>
          </button>
        </div>
      </div>

      {error ? <p className="wic-error">{error}</p> : null}

      <div className="wic-body">
        <aside className="wic-steps" aria-label="Create steps">
          <ol>
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`wic-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
                    onClick={() => {
                      if (i > 0 && !canContinueDetails) {
                        setError("Fill in required Item Name and Category first.");
                        setStep("details");
                        return;
                      }
                      setError(null);
                      setStep(s.id);
                    }}
                  >
                    <span className="wic-step-num">{done ? "✓" : i + 1}</span>
                    <span className="wic-step-copy">
                      <strong>{s.label}</strong>
                      <em>{s.hint}</em>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="wic-main">
          {step === "details" ? (
            <section className="wic-card">
              <h2>1. Item Details</h2>
              <label className="wic-field wic-field--full">
                <span>
                  Item Name <i>*</i>
                </span>
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Walk-In Cooler Temperature"
                />
                <small>{name.length}/100</small>
              </label>
              <div className="wic-grid">
                <label className="wic-field">
                  <span>
                    Item Type <i>*</i>
                  </span>
                  <div className="wic-select-with-icon">
                    <span className="wic-select-ico">
                      <WalkTypeIcon type={type} size={16} />
                    </span>
                    <select value={type} onChange={(e) => setType(e.target.value as WalkItemType)}>
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
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wic-field">
                  <span>Version</span>
                  <input value="1.0" readOnly />
                </label>
              </div>
              <label className="wic-field wic-field--full">
                <span>Description</span>
                <textarea
                  value={description}
                  maxLength={300}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of what this item checks."
                />
                <small>{description.length}/300</small>
              </label>
              <div className="wic-grid">
                <label className="wic-field">
                  <span>Default Frequency</span>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    <option value="schedule">As configured in walk schedule</option>
                    <option value="shift">Once per shift</option>
                    <option value="daily">Daily</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="wic-field">
                  <span>Default Required</span>
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
              <label className="wic-field wic-field--full">
                <span>Tags</span>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Select or create tags…"
                />
              </label>
              <div className="wic-card-footer">
                <button
                  type="button"
                  className="wic-btn wic-btn--primary"
                  disabled={!canContinueDetails}
                  onClick={goNext}
                >
                  Continue to Configuration →
                </button>
              </div>
            </section>
          ) : null}

          {step === "config" ? (
            <section className="wic-card">
              <h2>2. Configuration</h2>
              <p className="wic-lede">Set how associates complete this {typeLabel(type).toLowerCase()}.</p>

              {type === "TEMPERATURE" ? (
                <>
                  <div className="wic-grid">
                    <label className="wic-field">
                      <span>Unit</span>
                      <select value={unit} onChange={(e) => setUnit(e.target.value as "F" | "C")}>
                        <option value="F">Fahrenheit (°F)</option>
                        <option value="C">Celsius (°C)</option>
                      </select>
                    </label>
                    <label className="wic-field">
                      <span>Allow retest on failure</span>
                      <select
                        value={requireRetest ? "yes" : "no"}
                        onChange={(e) => setRequireRetest(e.target.value === "yes")}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                  </div>
                  {requireRetest ? (
                    <label className="wic-field">
                      <span>Maximum retests</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={maxRetests}
                        onChange={(e) => setMaxRetests(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="wic-check">
                    <input
                      type="checkbox"
                      checked={allowManual}
                      onChange={(e) => setAllowManual(e.target.checked)}
                    />
                    Allow manual entry
                  </label>
                </>
              ) : null}

              {type === "YES_NO" ? (
                <div className="wic-grid">
                  <label className="wic-field">
                    <span>Yes button label</span>
                    <input value={yesLabel} onChange={(e) => setYesLabel(e.target.value)} />
                  </label>
                  <label className="wic-field">
                    <span>No button label</span>
                    <input value={noLabel} onChange={(e) => setNoLabel(e.target.value)} />
                  </label>
                </div>
              ) : null}

              {type === "VISUAL_CHECK" ? (
                <>
                  <label className="wic-field wic-field--full">
                    <span>Passing options (one per line)</span>
                    <textarea
                      rows={3}
                      value={passingOptions}
                      onChange={(e) => setPassingOptions(e.target.value)}
                    />
                  </label>
                  <label className="wic-field wic-field--full">
                    <span>Failing options (one per line)</span>
                    <textarea
                      rows={3}
                      value={failingOptions}
                      onChange={(e) => setFailingOptions(e.target.value)}
                    />
                  </label>
                  <label className="wic-check">
                    <input
                      type="checkbox"
                      checked={requirePhotoOnFail}
                      onChange={(e) => setRequirePhotoOnFail(e.target.checked)}
                    />
                    Require photo when it fails
                  </label>
                </>
              ) : null}

              {type === "PHOTO" ? (
                <div className="wic-grid">
                  <label className="wic-field">
                    <span>Minimum photos</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={minPhotos}
                      onChange={(e) => setMinPhotos(e.target.value)}
                    />
                  </label>
                  <label className="wic-field">
                    <span>Maximum photos</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={maxPhotos}
                      onChange={(e) => setMaxPhotos(e.target.value)}
                    />
                  </label>
                  <label className="wic-field wic-field--full">
                    <span>Photo guidance</span>
                    <textarea
                      rows={2}
                      value={photoGuidance}
                      onChange={(e) => setPhotoGuidance(e.target.value)}
                      placeholder="What should the associate capture?"
                    />
                  </label>
                </div>
              ) : null}

              {type === "MULTIPLE_CHOICE" ? (
                <>
                  <label className="wic-field wic-field--full">
                    <span>Options (one per line)</span>
                    <textarea rows={4} value={mcOptions} onChange={(e) => setMcOptions(e.target.value)} />
                  </label>
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
                <div className="wic-grid">
                  <label className="wic-field">
                    <span>Unit label</span>
                    <input value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)} />
                  </label>
                  <label className="wic-field">
                    <span>Target / minimum</span>
                    <input
                      type="number"
                      value={qtyMin}
                      onChange={(e) => setQtyMin(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {type === "TEXT" ? (
                <>
                  <label className="wic-field wic-field--full">
                    <span>Placeholder</span>
                    <input
                      value={textPlaceholder}
                      onChange={(e) => setTextPlaceholder(e.target.value)}
                    />
                  </label>
                  <label className="wic-check">
                    <input
                      type="checkbox"
                      checked={textRequireNonEmpty}
                      onChange={(e) => setTextRequireNonEmpty(e.target.checked)}
                    />
                    Require non-empty note
                  </label>
                </>
              ) : null}

              {type === "INSTRUCTION" ? (
                <label className="wic-field wic-field--full">
                  <span>Instruction body</span>
                  <textarea
                    rows={5}
                    value={instructionBody}
                    onChange={(e) => setInstructionBody(e.target.value)}
                    placeholder="What should associates read?"
                  />
                </label>
              ) : null}

              <StepFooter onBack={goBack} onNext={goNext} nextLabel={continueLabel()} />
            </section>
          ) : null}

          {step === "criteria" ? (
            <section className="wic-card">
              <h2>3. Passing Criteria</h2>
              <p className="wic-lede">Define when this item passes or fails.</p>

              {type === "TEMPERATURE" ? (
                <>
                  <label className="wic-field">
                    <span>Pass when reading is</span>
                    <select
                      value={comparisonType}
                      onChange={(e) =>
                        setComparisonType(e.target.value as "ABOVE" | "BELOW" | "BETWEEN")
                      }
                    >
                      <option value="ABOVE">At or above a minimum</option>
                      <option value="BELOW">At or below a maximum</option>
                      <option value="BETWEEN">Between a min and max</option>
                    </select>
                  </label>
                  <div className="wic-grid">
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
                </>
              ) : null}

              {type === "YES_NO" ? (
                <label className="wic-field">
                  <span>Passing answer</span>
                  <select
                    value={passingAnswer}
                    onChange={(e) => setPassingAnswer(e.target.value as "YES" | "NO")}
                  >
                    <option value="YES">Yes is a pass</option>
                    <option value="NO">No is a pass</option>
                  </select>
                </label>
              ) : null}

              {type === "MULTIPLE_CHOICE" ? (
                <label className="wic-field wic-field--full">
                  <span>Passing options (one per line)</span>
                  <textarea rows={3} value={mcPassing} onChange={(e) => setMcPassing(e.target.value)} />
                </label>
              ) : null}

              {type === "QUANTITY" ? (
                <>
                  <label className="wic-field">
                    <span>Pass when value is</span>
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
                  <div className="wic-grid">
                    <label className="wic-field">
                      <span>Minimum / target</span>
                      <input type="number" value={qtyMin} onChange={(e) => setQtyMin(e.target.value)} />
                    </label>
                    <label className="wic-field">
                      <span>Maximum (optional)</span>
                      <input type="number" value={qtyMax} onChange={(e) => setQtyMax(e.target.value)} />
                    </label>
                  </div>
                </>
              ) : null}

              {type === "VISUAL_CHECK" ? (
                <p className="wic-lede">
                  Passing / failing options were set in Configuration. Current pass options:{" "}
                  <strong>{lines(passingOptions).join(", ") || "—"}</strong>
                </p>
              ) : null}

              {type === "PHOTO" || type === "TEXT" || type === "INSTRUCTION" ? (
                <div className="wic-field">
                  <span>Completion rule</span>
                  {type === "PHOTO" ? (
                    <p className="wic-lede">
                      Pass when at least <strong>{minPhotos}</strong> photo(s) are attached.
                    </p>
                  ) : null}
                  {type === "TEXT" ? (
                    <label className="wic-check">
                      <input
                        type="checkbox"
                        checked={textRequireNonEmpty}
                        onChange={(e) => setTextRequireNonEmpty(e.target.checked)}
                      />
                      Require a non-empty note to pass
                    </label>
                  ) : null}
                  {type === "INSTRUCTION" ? (
                    <label className="wic-check">
                      <input
                        type="checkbox"
                        checked={acknowledgeRequired}
                        onChange={(e) => setAcknowledgeRequired(e.target.checked)}
                      />
                      Require acknowledgment to continue
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="wic-summary-box">
                <strong>Summary</strong>
                <p>{criteriaSummary}</p>
              </div>

              <StepFooter onBack={goBack} onNext={goNext} nextLabel={continueLabel()} />
            </section>
          ) : null}

          {step === "corrective" ? (
            <section className="wic-card">
              <h2>4. Corrective Actions</h2>
              <p className="wic-lede">What associates must do if this item fails.</p>
              <div className="wic-ca-list-edit">
                {corrective.map((action, index) => (
                  <div key={action.id} className="wic-ca-row">
                    <div className="wic-ca-row-head">
                      <strong>Action {index + 1}</strong>
                      <button
                        type="button"
                        className="wic-link"
                        onClick={() =>
                          setCorrective((prev) => prev.filter((a) => a.id !== action.id))
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="wic-grid">
                      <label className="wic-field">
                        <span>Type</span>
                        <select
                          value={action.actionType}
                          onChange={(e) =>
                            setCorrective((prev) =>
                              prev.map((a) =>
                                a.id === action.id
                                  ? {
                                      ...a,
                                      actionType: e.target.value,
                                      title:
                                        a.title ||
                                        CA_TYPES.find((t) => t.value === e.target.value)?.label ||
                                        a.title,
                                      blocksCompletion: e.target.value === "BLOCK_COMPLETION",
                                    }
                                  : a,
                              ),
                            )
                          }
                        >
                          {CA_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="wic-field">
                        <span>Title</span>
                        <input
                          value={action.title}
                          onChange={(e) =>
                            setCorrective((prev) =>
                              prev.map((a) =>
                                a.id === action.id ? { ...a, title: e.target.value } : a,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <label className="wic-field wic-field--full">
                      <span>Instructions</span>
                      <textarea
                        rows={2}
                        value={action.instructions}
                        onChange={(e) =>
                          setCorrective((prev) =>
                            prev.map((a) =>
                              a.id === action.id ? { ...a, instructions: e.target.value } : a,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="wic-check">
                      <input
                        type="checkbox"
                        checked={action.blocksCompletion}
                        onChange={(e) =>
                          setCorrective((prev) =>
                            prev.map((a) =>
                              a.id === action.id
                                ? { ...a, blocksCompletion: e.target.checked }
                                : a,
                            ),
                          )
                        }
                      />
                      Blocks walk completion until done
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="wic-btn wic-btn--ghost"
                onClick={() =>
                  setCorrective((prev) => [
                    ...prev,
                    {
                      id: newCaId(),
                      actionType: "TAKE_PHOTO",
                      title: "Take a photo",
                      instructions: "",
                      blocksCompletion: false,
                    },
                  ])
                }
              >
                + Add corrective action
              </button>
              <StepFooter onBack={goBack} onNext={goNext} nextLabel={continueLabel()} />
            </section>
          ) : null}

          {step === "devices" ? (
            <section className="wic-card">
              <h2>5. Devices & Methods</h2>
              <p className="wic-lede">Choose how associates can record this item.</p>
              {type === "TEMPERATURE" ? (
                <>
                  <label className="wic-check">
                    <input
                      type="checkbox"
                      checked={allowManual}
                      onChange={(e) => setAllowManual(e.target.checked)}
                    />
                    Manual entry
                  </label>
                  <label className="wic-check">
                    <input
                      type="checkbox"
                      checked={allowBluetooth}
                      onChange={(e) => setAllowBluetooth(e.target.checked)}
                    />
                    Bluetooth thermometer (coming later)
                  </label>
                </>
              ) : null}
              <label className="wic-check">
                <input
                  type="checkbox"
                  checked={photoCaptureEnabled}
                  onChange={(e) => setPhotoCaptureEnabled(e.target.checked)}
                />
                Photo capture available
              </label>
              {!allowManual && type === "TEMPERATURE" && !allowBluetooth ? (
                <p className="wic-error" style={{ marginTop: "0.75rem" }}>
                  Enable at least one recording method.
                </p>
              ) : null}
              <StepFooter onBack={goBack} onNext={goNext} nextLabel={continueLabel()} />
            </section>
          ) : null}

          {step === "instructions" ? (
            <section className="wic-card">
              <h2>6. Instructions</h2>
              <p className="wic-lede">Guidance shown to associates while they complete this item.</p>
              <label className="wic-field wic-field--full">
                <span>Associate instructions</span>
                <textarea
                  rows={6}
                  value={associateInstructions}
                  onChange={(e) => setAssociateInstructions(e.target.value)}
                  placeholder="e.g. Place probe in the thickest part of the product and wait for a stable reading."
                />
              </label>
              {type === "INSTRUCTION" ? (
                <label className="wic-check">
                  <input
                    type="checkbox"
                    checked={acknowledgeRequired}
                    onChange={(e) => setAcknowledgeRequired(e.target.checked)}
                  />
                  Require acknowledgment
                </label>
              ) : null}
              <StepFooter onBack={goBack} onNext={goNext} nextLabel={continueLabel()} />
            </section>
          ) : null}

          {step === "review" ? (
            <section className="wic-card">
              <h2>7. Review</h2>
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
                  <dt>Corrective actions</dt>
                  <dd>
                    {corrective.filter((a) => a.title.trim()).length
                      ? corrective
                          .filter((a) => a.title.trim())
                          .map((a) => a.title)
                          .join(", ")
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Instructions</dt>
                  <dd>{associateInstructions.trim() || "None"}</dd>
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
                nextLabel={busy ? "Saving…" : "Save Item"}
                busy={busy}
              />
            </section>
          ) : null}
        </main>

        <aside className="wic-preview" aria-label="Associate preview">
          <div className="wic-preview-head">
            <h2>Preview: Associate View</h2>
            <div className="wic-device-toggle" role="group" aria-label="Preview device">
              <button
                type="button"
                className={previewDevice === "phone" ? "is-active" : undefined}
                onClick={() => setPreviewDevice("phone")}
                aria-label="Phone"
              >
                ▢
              </button>
              <button
                type="button"
                className={previewDevice === "tablet" ? "is-active" : undefined}
                onClick={() => setPreviewDevice("tablet")}
                aria-label="Tablet"
              >
                ▭
              </button>
            </div>
          </div>

          <div className={`wic-phone${previewDevice === "tablet" ? " wic-phone--tablet" : ""}`}>
            <div className="wic-phone-screen">
              <header className="wic-phone-bar">
                <button type="button">← Back</button>
                <span>1 of 5</span>
              </header>
              <h3>{previewTitle}</h3>
              <div className="wic-phone-hero">
                <span className="wic-phone-ico">
                  <WalkTypeIcon type={type} size={28} />
                </span>
                <strong>
                  {type === "TEMPERATURE"
                    ? "Record temperature"
                    : type === "PHOTO"
                      ? "Take photo"
                      : type === "YES_NO"
                        ? "Answer yes or no"
                        : typeLabel(type)}
                </strong>
                <p>
                  {associateInstructions.trim() ||
                    description.trim() ||
                    (type === "TEMPERATURE"
                      ? `Temperature will be compared to: ${criteriaSummary}`
                      : typeDescription(type))}
                </p>
              </div>
              <button type="button" className="wic-phone-cta">
                {type === "TEMPERATURE"
                  ? "Record Temperature"
                  : type === "PHOTO"
                    ? "Take Photo"
                    : "Continue"}
              </button>
              <button type="button" className="wic-phone-next">
                Next Item →
              </button>
            </div>
          </div>

          <div className="wic-preview-note">
            <strong>This is a preview</strong>
            <p>This shows how associates will see and interact with this item in Alenio Go.</p>
          </div>

          <div className="wic-preview-block">
            <h4>Item Type</h4>
            <span className="wic-chip">{typeLabel(type)}</span>
            <p>{criteriaSummary}</p>
          </div>

          <div className="wic-preview-block">
            <h4>Common use cases</h4>
            <ul className="wic-usecases">
              {useCases.map((u) => (
                <li key={u}>
                  <span aria-hidden>✓</span>
                  {u}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="wic-tip">
        <span aria-hidden>💡</span>
        <p>
          <strong>Tip:</strong> Start with the basic details and then configure the rules and actions. You
          can always edit this item later.
        </p>
      </div>
    </div>
  );
}
