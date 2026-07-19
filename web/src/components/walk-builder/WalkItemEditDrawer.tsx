import { useEffect, useState } from "react";
import type { WalkItem, WalkItemType } from "../../lib/walks/types";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";

type Props = {
  item: WalkItem | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (patch: {
    title: string;
    description: string | null;
    instructions: string | null;
    required: boolean;
    config: Record<string, unknown>;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

type TempComparison = "ABOVE" | "BELOW" | "BETWEEN";
type TempUnit = "F" | "C";

type TempForm = {
  comparisonType: TempComparison;
  unit: TempUnit;
  minimumTemperature: string;
  maximumTemperature: string;
  allowManualEntry: boolean;
  allowBluetoothProbe: boolean;
  requireRetestOnFailure: boolean;
  maximumRetests: string;
};

type YesNoForm = {
  passingAnswer: "YES" | "NO";
  yesLabel: string;
  noLabel: string;
};

type VisualForm = {
  passingOptions: string;
  failingOptions: string;
  requirePhotoOnFailure: boolean;
};

type PhotoForm = {
  minimumPhotos: string;
  maximumPhotos: string;
  instructions: string;
};

type MultipleChoiceForm = {
  options: string;
  passingOptions: string;
  allowMultiple: boolean;
};

type QuantityForm = {
  comparisonType: "EXACT" | "AT_LEAST" | "AT_MOST" | "BETWEEN";
  target: string;
  minimum: string;
  maximum: string;
  unitLabel: string;
};

type TextForm = {
  placeholder: string;
  minLength: string;
  maxLength: string;
  requireNonEmpty: boolean;
};

type InstructionForm = {
  body: string;
  acknowledgeRequired: boolean;
};

function typeLabel(type: WalkItemType) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function linesToOptions(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function optionsToLines(value: unknown, fallback: string[]): string {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return (value as string[]).join("\n");
  }
  return fallback.join("\n");
}

function readTempForm(config: Record<string, unknown>): TempForm {
  const comparison =
    config.comparisonType === "BELOW" || config.comparisonType === "BETWEEN"
      ? config.comparisonType
      : "ABOVE";
  return {
    comparisonType: comparison,
    unit: config.unit === "C" ? "C" : "F",
    minimumTemperature:
      config.minimumTemperature == null ? "" : String(config.minimumTemperature),
    maximumTemperature:
      config.maximumTemperature == null ? "" : String(config.maximumTemperature),
    allowManualEntry: config.allowManualEntry !== false,
    allowBluetoothProbe: config.allowBluetoothProbe !== false,
    requireRetestOnFailure: Boolean(config.requireRetestOnFailure),
    maximumRetests:
      typeof config.maximumRetests === "number" ? String(config.maximumRetests) : "1",
  };
}

function readYesNoForm(config: Record<string, unknown>): YesNoForm {
  return {
    passingAnswer: config.passingAnswer === "NO" ? "NO" : "YES",
    yesLabel: typeof config.yesLabel === "string" ? config.yesLabel : "Yes",
    noLabel: typeof config.noLabel === "string" ? config.noLabel : "No",
  };
}

function readVisualForm(config: Record<string, unknown>): VisualForm {
  return {
    passingOptions: optionsToLines(config.passingOptions, ["Pass", "Looks good"]),
    failingOptions: optionsToLines(config.failingOptions, ["Fail", "Needs attention"]),
    requirePhotoOnFailure: Boolean(config.requirePhotoOnFailure),
  };
}

function readPhotoForm(config: Record<string, unknown>): PhotoForm {
  return {
    minimumPhotos: typeof config.minimumPhotos === "number" ? String(config.minimumPhotos) : "1",
    maximumPhotos: typeof config.maximumPhotos === "number" ? String(config.maximumPhotos) : "3",
    instructions: typeof config.instructions === "string" ? config.instructions : "",
  };
}

function readMultipleChoiceForm(config: Record<string, unknown>): MultipleChoiceForm {
  return {
    options: optionsToLines(config.options, ["Option A", "Option B"]),
    passingOptions: optionsToLines(config.passingOptions, ["Option A"]),
    allowMultiple: Boolean(config.allowMultiple),
  };
}

function readQuantityForm(config: Record<string, unknown>): QuantityForm {
  const comparison =
    config.comparisonType === "EXACT" ||
    config.comparisonType === "AT_MOST" ||
    config.comparisonType === "BETWEEN"
      ? config.comparisonType
      : "AT_LEAST";
  return {
    comparisonType: comparison,
    target: config.target == null ? "" : String(config.target),
    minimum: config.minimum == null ? "" : String(config.minimum),
    maximum: config.maximum == null ? "" : String(config.maximum),
    unitLabel: typeof config.unitLabel === "string" ? config.unitLabel : "items",
  };
}

function readTextForm(config: Record<string, unknown>): TextForm {
  return {
    placeholder: typeof config.placeholder === "string" ? config.placeholder : "Enter notes…",
    minLength: typeof config.minLength === "number" ? String(config.minLength) : "0",
    maxLength: typeof config.maxLength === "number" ? String(config.maxLength) : "500",
    requireNonEmpty: config.requireNonEmpty !== false,
  };
}

function readInstructionForm(config: Record<string, unknown>): InstructionForm {
  return {
    body: typeof config.body === "string" ? config.body : "",
    acknowledgeRequired: Boolean(config.acknowledgeRequired),
  };
}

export function WalkItemEditDrawer({ item, open, busy, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [required, setRequired] = useState(true);
  const [temp, setTemp] = useState<TempForm>(() => readTempForm({}));
  const [yesNo, setYesNo] = useState<YesNoForm>(() => readYesNoForm({}));
  const [visual, setVisual] = useState<VisualForm>(() => readVisualForm({}));
  const [photo, setPhoto] = useState<PhotoForm>(() => readPhotoForm({}));
  const [multipleChoice, setMultipleChoice] = useState<MultipleChoiceForm>(() =>
    readMultipleChoiceForm({}),
  );
  const [quantity, setQuantity] = useState<QuantityForm>(() => readQuantityForm({}));
  const [textForm, setTextForm] = useState<TextForm>(() => readTextForm({}));
  const [instruction, setInstruction] = useState<InstructionForm>(() => readInstructionForm({}));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const config = item.config ?? {};
    setTitle(item.title);
    setDescription(item.description ?? "");
    setInstructions(item.instructions ?? "");
    setRequired(item.required);
    setTemp(readTempForm(config));
    setYesNo(readYesNoForm(config));
    setVisual(readVisualForm(config));
    setPhoto(readPhotoForm(config));
    setMultipleChoice(readMultipleChoiceForm(config));
    setQuantity(readQuantityForm(config));
    setTextForm(readTextForm(config));
    setInstruction(readInstructionForm(config));
    setError(null);
  }, [item]);

  if (!open || !item) return null;

  function buildConfig(): Record<string, unknown> | null {
    if (item!.type === "TEMPERATURE") {
      const min = numOrNull(temp.minimumTemperature);
      const max = numOrNull(temp.maximumTemperature);
      if (temp.comparisonType === "ABOVE" && min == null) {
        setError("Enter a minimum temperature for “Must be at or above”.");
        return null;
      }
      if (temp.comparisonType === "BELOW" && max == null) {
        setError("Enter a maximum temperature for “Must be at or below”.");
        return null;
      }
      if (temp.comparisonType === "BETWEEN") {
        if (min == null || max == null) {
          setError("Enter both a minimum and maximum for a range check.");
          return null;
        }
        if (min > max) {
          setError("Minimum temperature must be less than or equal to maximum.");
          return null;
        }
      }
      const retests = Math.max(0, Math.min(10, Number(temp.maximumRetests) || 0));
      return {
        comparisonType: temp.comparisonType,
        unit: temp.unit,
        minimumTemperature: temp.comparisonType === "BELOW" ? min : min,
        maximumTemperature: temp.comparisonType === "ABOVE" ? max : max,
        allowManualEntry: temp.allowManualEntry,
        allowBluetoothProbe: temp.allowBluetoothProbe,
        requireRetestOnFailure: temp.requireRetestOnFailure,
        maximumRetests: retests,
      };
    }

    if (item!.type === "YES_NO") {
      return {
        passingAnswer: yesNo.passingAnswer,
        yesLabel: yesNo.yesLabel.trim() || "Yes",
        noLabel: yesNo.noLabel.trim() || "No",
      };
    }

    if (item!.type === "VISUAL_CHECK") {
      const passingOptions = linesToOptions(visual.passingOptions);
      const failingOptions = linesToOptions(visual.failingOptions);
      if (passingOptions.length === 0 || failingOptions.length === 0) {
        setError("Add at least one passing option and one failing option (one per line).");
        return null;
      }
      return {
        passingOptions,
        failingOptions,
        requirePhotoOnFailure: visual.requirePhotoOnFailure,
      };
    }

    if (item!.type === "PHOTO") {
      const minimumPhotos = Math.max(1, Math.min(10, Number(photo.minimumPhotos) || 1));
      const maximumPhotos = Math.max(minimumPhotos, Math.min(20, Number(photo.maximumPhotos) || 3));
      return {
        minimumPhotos,
        maximumPhotos,
        instructions: photo.instructions.trim() || null,
      };
    }

    if (item!.type === "MULTIPLE_CHOICE") {
      const options = linesToOptions(multipleChoice.options);
      const passingOptions = linesToOptions(multipleChoice.passingOptions);
      if (options.length < 2) {
        setError("Add at least two options (one per line).");
        return null;
      }
      return {
        options,
        passingOptions,
        allowMultiple: multipleChoice.allowMultiple,
      };
    }

    if (item!.type === "QUANTITY") {
      return {
        comparisonType: quantity.comparisonType,
        target: numOrNull(quantity.target),
        minimum: numOrNull(quantity.minimum),
        maximum: numOrNull(quantity.maximum),
        unitLabel: quantity.unitLabel.trim() || null,
      };
    }

    if (item!.type === "TEXT") {
      return {
        placeholder: textForm.placeholder.trim() || null,
        minLength: Math.max(0, Number(textForm.minLength) || 0),
        maxLength: Math.max(1, Number(textForm.maxLength) || 500),
        requireNonEmpty: textForm.requireNonEmpty,
      };
    }

    if (item!.type === "INSTRUCTION") {
      return {
        body: instruction.body.trim(),
        acknowledgeRequired: instruction.acknowledgeRequired,
      };
    }

    return item!.config ?? {};
  }

  async function save() {
    setError(null);
    const config = buildConfig();
    if (!config) return;
    await onSave({
      title: title.trim() || item!.title,
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      required,
      config,
    });
  }

  return (
    <div className="wb-drawer" role="dialog" aria-modal="true" aria-labelledby="wb-drawer-title">
      <button type="button" className="wb-drawer-backdrop" aria-label="Close" onClick={onClose} />
      <div className="wb-drawer-panel">
        <header className="wb-drawer-head">
          <div>
            <p className="wb-drawer-kicker">{typeLabel(item.type)}</p>
            <h2 id="wb-drawer-title">Edit item</h2>
          </div>
          <button type="button" className="wb-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? <p className="wb-drawer-error">{error}</p> : null}

        <label className="wb-field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="wb-field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>
        <label className="wb-field">
          <span>Instructions for associates</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
        </label>
        <label className="wb-check">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>

        {item.type === "TEMPERATURE" ? (
          <fieldset className="wb-config">
            <legend>Temperature rules</legend>
            <label className="wb-field">
              <span>Pass when reading is</span>
              <select
                value={temp.comparisonType}
                onChange={(e) =>
                  setTemp((prev) => ({
                    ...prev,
                    comparisonType: e.target.value as TempComparison,
                  }))
                }
              >
                <option value="ABOVE">At or above a minimum</option>
                <option value="BELOW">At or below a maximum</option>
                <option value="BETWEEN">Between a min and max</option>
              </select>
            </label>
            <label className="wb-field">
              <span>Unit</span>
              <select
                value={temp.unit}
                onChange={(e) => setTemp((prev) => ({ ...prev, unit: e.target.value as TempUnit }))}
              >
                <option value="F">Fahrenheit (°F)</option>
                <option value="C">Celsius (°C)</option>
              </select>
            </label>
            {temp.comparisonType !== "BELOW" ? (
              <label className="wb-field">
                <span>Minimum temperature (°{temp.unit})</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={temp.minimumTemperature}
                  onChange={(e) => setTemp((prev) => ({ ...prev, minimumTemperature: e.target.value }))}
                  placeholder={temp.unit === "F" ? "165" : "74"}
                />
              </label>
            ) : null}
            {temp.comparisonType !== "ABOVE" ? (
              <label className="wb-field">
                <span>Maximum temperature (°{temp.unit})</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={temp.maximumTemperature}
                  onChange={(e) => setTemp((prev) => ({ ...prev, maximumTemperature: e.target.value }))}
                  placeholder={temp.unit === "F" ? "40" : "4"}
                />
              </label>
            ) : null}
            <label className="wb-check">
              <input
                type="checkbox"
                checked={temp.allowManualEntry}
                onChange={(e) => setTemp((prev) => ({ ...prev, allowManualEntry: e.target.checked }))}
              />
              Allow manual entry
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={temp.allowBluetoothProbe}
                onChange={(e) => setTemp((prev) => ({ ...prev, allowBluetoothProbe: e.target.checked }))}
              />
              Bluetooth probe (coming later)
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={temp.requireRetestOnFailure}
                onChange={(e) =>
                  setTemp((prev) => ({ ...prev, requireRetestOnFailure: e.target.checked }))
                }
              />
              Require retest on failure
            </label>
            {temp.requireRetestOnFailure ? (
              <label className="wb-field">
                <span>Maximum retests</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={temp.maximumRetests}
                  onChange={(e) => setTemp((prev) => ({ ...prev, maximumRetests: e.target.value }))}
                />
              </label>
            ) : null}
          </fieldset>
        ) : null}

        {item.type === "YES_NO" ? (
          <fieldset className="wb-config">
            <legend>Yes / No rules</legend>
            <label className="wb-field">
              <span>Passing answer</span>
              <select
                value={yesNo.passingAnswer}
                onChange={(e) =>
                  setYesNo((prev) => ({
                    ...prev,
                    passingAnswer: e.target.value as "YES" | "NO",
                  }))
                }
              >
                <option value="YES">Yes is a pass</option>
                <option value="NO">No is a pass</option>
              </select>
            </label>
            <label className="wb-field">
              <span>Yes button label</span>
              <input
                value={yesNo.yesLabel}
                onChange={(e) => setYesNo((prev) => ({ ...prev, yesLabel: e.target.value }))}
                maxLength={40}
              />
            </label>
            <label className="wb-field">
              <span>No button label</span>
              <input
                value={yesNo.noLabel}
                onChange={(e) => setYesNo((prev) => ({ ...prev, noLabel: e.target.value }))}
                maxLength={40}
              />
            </label>
          </fieldset>
        ) : null}

        {item.type === "VISUAL_CHECK" ? (
          <fieldset className="wb-config">
            <legend>Visual check options</legend>
            <label className="wb-field">
              <span>Passing options (one per line)</span>
              <textarea
                value={visual.passingOptions}
                onChange={(e) => setVisual((prev) => ({ ...prev, passingOptions: e.target.value }))}
                rows={3}
              />
            </label>
            <label className="wb-field">
              <span>Failing options (one per line)</span>
              <textarea
                value={visual.failingOptions}
                onChange={(e) => setVisual((prev) => ({ ...prev, failingOptions: e.target.value }))}
                rows={3}
              />
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={visual.requirePhotoOnFailure}
                onChange={(e) =>
                  setVisual((prev) => ({ ...prev, requirePhotoOnFailure: e.target.checked }))
                }
              />
              Require photo when it fails
            </label>
          </fieldset>
        ) : null}

        {item.type === "PHOTO" ? (
          <fieldset className="wb-config">
            <legend>Photo requirements</legend>
            <label className="wb-field">
              <span>Minimum photos</span>
              <input
                type="number"
                min={1}
                max={10}
                value={photo.minimumPhotos}
                onChange={(e) => setPhoto((prev) => ({ ...prev, minimumPhotos: e.target.value }))}
              />
            </label>
            <label className="wb-field">
              <span>Maximum photos</span>
              <input
                type="number"
                min={1}
                max={20}
                value={photo.maximumPhotos}
                onChange={(e) => setPhoto((prev) => ({ ...prev, maximumPhotos: e.target.value }))}
              />
            </label>
            <label className="wb-field">
              <span>Photo guidance (optional)</span>
              <textarea
                value={photo.instructions}
                onChange={(e) => setPhoto((prev) => ({ ...prev, instructions: e.target.value }))}
                rows={2}
                placeholder="What should the associate capture?"
              />
            </label>
          </fieldset>
        ) : null}

        {item.type === "MULTIPLE_CHOICE" ? (
          <fieldset className="wb-config">
            <legend>Multiple choice</legend>
            <label className="wb-field">
              <span>Options (one per line)</span>
              <textarea
                value={multipleChoice.options}
                onChange={(e) => setMultipleChoice((prev) => ({ ...prev, options: e.target.value }))}
                rows={4}
              />
            </label>
            <label className="wb-field">
              <span>Passing options (one per line)</span>
              <textarea
                value={multipleChoice.passingOptions}
                onChange={(e) =>
                  setMultipleChoice((prev) => ({ ...prev, passingOptions: e.target.value }))
                }
                rows={2}
              />
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={multipleChoice.allowMultiple}
                onChange={(e) =>
                  setMultipleChoice((prev) => ({ ...prev, allowMultiple: e.target.checked }))
                }
              />
              Allow multiple selections
            </label>
          </fieldset>
        ) : null}

        {item.type === "QUANTITY" ? (
          <fieldset className="wb-config">
            <legend>Quantity rules</legend>
            <label className="wb-field">
              <span>Pass when value is</span>
              <select
                value={quantity.comparisonType}
                onChange={(e) =>
                  setQuantity((prev) => ({
                    ...prev,
                    comparisonType: e.target.value as QuantityForm["comparisonType"],
                  }))
                }
              >
                <option value="AT_LEAST">At least a minimum</option>
                <option value="AT_MOST">At most a maximum</option>
                <option value="EXACT">Exactly a target</option>
                <option value="BETWEEN">Between min and max</option>
              </select>
            </label>
            <label className="wb-field">
              <span>Target / minimum</span>
              <input
                type="number"
                value={quantity.minimum || quantity.target}
                onChange={(e) =>
                  setQuantity((prev) => ({
                    ...prev,
                    minimum: e.target.value,
                    target: e.target.value,
                  }))
                }
              />
            </label>
            <label className="wb-field">
              <span>Maximum (optional)</span>
              <input
                type="number"
                value={quantity.maximum}
                onChange={(e) => setQuantity((prev) => ({ ...prev, maximum: e.target.value }))}
              />
            </label>
            <label className="wb-field">
              <span>Unit label</span>
              <input
                value={quantity.unitLabel}
                onChange={(e) => setQuantity((prev) => ({ ...prev, unitLabel: e.target.value }))}
              />
            </label>
          </fieldset>
        ) : null}

        {item.type === "TEXT" ? (
          <fieldset className="wb-config">
            <legend>Text / note</legend>
            <label className="wb-field">
              <span>Placeholder</span>
              <input
                value={textForm.placeholder}
                onChange={(e) => setTextForm((prev) => ({ ...prev, placeholder: e.target.value }))}
              />
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={textForm.requireNonEmpty}
                onChange={(e) =>
                  setTextForm((prev) => ({ ...prev, requireNonEmpty: e.target.checked }))
                }
              />
              Require non-empty note
            </label>
          </fieldset>
        ) : null}

        {item.type === "INSTRUCTION" ? (
          <fieldset className="wb-config">
            <legend>Instruction</legend>
            <label className="wb-field">
              <span>Instruction body</span>
              <textarea
                value={instruction.body}
                onChange={(e) => setInstruction((prev) => ({ ...prev, body: e.target.value }))}
                rows={4}
              />
            </label>
            <label className="wb-check">
              <input
                type="checkbox"
                checked={instruction.acknowledgeRequired}
                onChange={(e) =>
                  setInstruction((prev) => ({ ...prev, acknowledgeRequired: e.target.checked }))
                }
              />
              Require acknowledgment
            </label>
          </fieldset>
        ) : null}

        <div className="wb-drawer-actions">
          <button type="button" className="wb-btn wb-btn--danger" disabled={busy} onClick={() => void onDelete()}>
            Delete
          </button>
          <div className="wb-drawer-actions-right">
            <button type="button" className="wb-btn wb-btn--ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="wb-btn wb-btn--primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
