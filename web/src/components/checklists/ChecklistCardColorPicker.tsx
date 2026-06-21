import { CHECKLIST_CARD_COLORS, type ChecklistCardColorId } from "../../lib/checklist-card-colors";

type Props = {
  value: ChecklistCardColorId | null;
  onChange: (value: ChecklistCardColorId) => void;
  id?: string;
};

export function ChecklistCardColorPicker({ value, onChange, id = "checklist-card-color" }: Props) {
  return (
    <div className="checklist-card-color-picker" role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="enterprise-checklist-editor-label">
        Card color
      </span>
      <div className="checklist-card-color-picker__swatches">
        {CHECKLIST_CARD_COLORS.map((color) => {
          const selected = value === color.id;
          return (
            <button
              key={color.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.label}
              title={color.label}
              className={`checklist-card-color-picker__swatch${selected ? " checklist-card-color-picker__swatch--selected" : ""}`}
              style={{ background: color.accent }}
              onClick={() => onChange(color.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
