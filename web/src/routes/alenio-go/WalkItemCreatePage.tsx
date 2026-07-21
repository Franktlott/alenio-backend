import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  apiActionsToProcedure,
  CorrectiveActionsFlow,
  emptyFailureProcedure,
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
      const nextManual = config.allowManualEntry !== false;
      const nextBluetooth = config.allowBluetoothProbe !== false;
      setAllowManual(nextManual || !nextBluetooth);
      setAllowBluetooth(nextBluetooth);
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

  function showDetailsMissingNotice() {
    showNotice({
      title: detailsMissing.length === 1 ? "Required field missing" : "Required fields missing",
      message: "Complete the following before saving:",
      items: detailsMissing,
      tone: "warning",
    });
  }

  const failureMissing = useMemo(
    () => getFailureProcedureMissing(failureProcedure),
    [failureProcedure],
  );
  const canContinueFailure = failureMissing.length === 0;

  function showFailureMissingNotice() {
    setShowFpErrors(true);
    showNotice({
      title: failureMissing.length === 1 ? "Required field missing" : "Required fields missing",
      message: "Complete the following before saving:",
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
    if (type !== "TEMPERATURE") return "";
    const u = unit === "C" ? "°C" : "°F";
    if (comparisonType === "BELOW") {
      return `Pass when temperature is ${maxTemp || "—"}${u} or below.`;
    }
    if (comparisonType === "BETWEEN") {
      return `Pass when temperature is between ${minTemp || "—"}${u} and ${maxTemp || "—"}${u}.`;
    }
    return `Pass when temperature is ${minTemp || "—"}${u} or above.`;
  }, [type, unit, comparisonType, minTemp, maxTemp]);

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
      showDetailsMissingNotice();
      return;
    }
    if (!canContinueFailure) {
      showFailureMissingNotice();
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

  if (loadingItem) {
    return (
      <TempsPageShell testId="walk-item-create-page" wide className="wic-page wic-page--single">
        <EnterprisePageLoading label="Loading item…" />
      </TempsPageShell>
    );
  }

  return (
    <TempsPageShell testId="walk-item-create-page" wide className="wic-page wic-page--single">
      <TempsPageHeader
        breadcrumb={
          <>
            <Link to="/go/temp-checks/library">Item Library</Link>
            <span aria-hidden>›</span>
            <span>{isEdit ? "Edit Item" : "Create New Item"}</span>
          </>
        }
        title={isEdit ? "Edit Item" : "Create New Item"}
        description="Build a temperature check item to ensure food safety compliance."
      />

      {error ? <p className="temps-error">{error}</p> : null}
      {noticeDialog}

      <form
        className="wic-single-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveItem();
        }}
      >
        <section className="wic-single-col" aria-label="Item details">
          <section className="wic-panel wic-panel--mock" aria-labelledby="wic-basics-title">
            <header className="wic-panel-head">
              <h3 id="wic-basics-title">Item Details</h3>
            </header>
            <div className="wic-panel-body">
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
                    <option value="">Select...</option>
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

            <div className="wic-card-section" aria-labelledby="wic-methods-title">
              <header className="wic-section-head">
                <h4 id="wic-methods-title">Recording Methods</h4>
                <span className="wic-section-sub">
                  {type === "TEMPERATURE"
                    ? "Choose Manual and/or Bluetooth — Photo is optional"
                    : "Photo is optional evidence"}
                </span>
              </header>
              <div className="wic-method-grid" role="group" aria-label="Recording methods">
                {type === "TEMPERATURE" ? (
                  <>
                    <label className={`wic-method-tile${allowManual ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={allowManual}
                        onChange={(e) => {
                          const next = e.target.checked;
                          // Keep at least one of Manual / Bluetooth selected
                          if (!next && !allowBluetooth) return;
                          setAllowManual(next);
                        }}
                      />
                      <span className="wic-method-ico" aria-hidden>
                        <IconManual />
                      </span>
                      <span>
                        <strong>Manual</strong>
                        <em>Enter readings manually</em>
                      </span>
                    </label>
                    <label className={`wic-method-tile${allowBluetooth ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={allowBluetooth}
                        onChange={(e) => {
                          const next = e.target.checked;
                          if (!next && !allowManual) return;
                          setAllowBluetooth(next);
                        }}
                      />
                      <span className="wic-method-ico" aria-hidden>
                        <IconBluetooth />
                      </span>
                      <span>
                        <strong>Bluetooth</strong>
                        <em>Use connected probe</em>
                      </span>
                    </label>
                  </>
                ) : null}
                <label className={`wic-method-tile wic-method-tile--optional${photoCaptureEnabled ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={photoCaptureEnabled}
                    onChange={(e) => setPhotoCaptureEnabled(e.target.checked)}
                  />
                  <span className="wic-method-ico" aria-hidden>
                    <IconPhoto />
                  </span>
                  <span>
                    <strong>Photo</strong>
                    <em>Capture photo evidence</em>
                  </span>
                </label>
              </div>
            </div>

            <div className="wic-card-section" aria-labelledby="wic-criteria-title">
              <header className="wic-section-head">
                <h4 id="wic-criteria-title">Passing Criteria</h4>
                <span className="wic-type-chip">
                  <WalkTypeIcon type={type} size={14} />
                  {typeLabel(type)}
                </span>
              </header>
              <div className="wic-criteria-body wic-section-body">
              {type === "TEMPERATURE" ? (
                <>
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
                        <span>
                          Minimum (°{unit}) <i>*</i>
                        </span>
                        <input
                          type="number"
                          value={minTemp}
                          onChange={(e) => setMinTemp(e.target.value)}
                        />
                      </label>
                    ) : null}
                    {comparisonType !== "ABOVE" ? (
                      <label className="wic-field">
                        <span>
                          Maximum (°{unit}) <i>*</i>
                        </span>
                        <input
                          type="number"
                          value={maxTemp}
                          onChange={(e) => setMaxTemp(e.target.value)}
                        />
                      </label>
                    ) : null}
                  </div>
                  <p className="wic-criteria-help">{criteriaSummary}</p>
                </>
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
                        rows={2}
                        value={passingOptions}
                        onChange={(e) => setPassingOptions(e.target.value)}
                        placeholder={"Pass\nLooks good"}
                      />
                    </label>
                    <label className="wic-field">
                      <span>Failing options</span>
                      <textarea
                        rows={2}
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
                        rows={2}
                        value={mcOptions}
                        onChange={(e) => setMcOptions(e.target.value)}
                        placeholder={"Option A\nOption B"}
                      />
                    </label>
                    <label className="wic-field">
                      <span>Passing options</span>
                      <textarea
                        rows={2}
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
                      onChange={(e) => setQtyComparison(e.target.value as typeof qtyComparison)}
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
                      rows={2}
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
            </div>
          </section>
        </section>

        <section className="wic-single-col wic-single-col--ca" aria-label="Corrective actions">
          <CorrectiveActionsFlow
            value={failureProcedure}
            onChange={updateFailureProcedure}
            showRequiredErrors={showFpErrors}
          />
        </section>
      </form>

      <div className="wic-footer-bar">
        <p className="wic-footer-note">
          {isEdit ? "Changes apply to the Item Library." : "New items are added to the Item Library."}
        </p>
        <TempsButton
          variant="secondary"
          disabled={busy}
          onClick={() => navigate("/go/temp-checks/library")}
        >
          Cancel
        </TempsButton>
        <TempsButton
          variant="primary"
          className="wic-save-btn"
          disabled={busy}
          onClick={() => void saveItem()}
        >
          <IconSave />
          {busy ? "Saving…" : isEdit ? "Save changes" : "Save Item"}
        </TempsButton>
      </div>
    </TempsPageShell>
  );
}

function IconSave() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

function IconManual() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

function IconBluetooth() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7 7l10 10-5 5V2l5 5L7 17" />
    </svg>
  );
}

function IconPhoto() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 7h3l2-2h6l2 2h3v12H4V7z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
