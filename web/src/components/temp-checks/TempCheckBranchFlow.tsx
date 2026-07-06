import { CorrectiveStepsEditor } from "./CorrectiveStepsEditor";
import {
  buildRecheckBranchActions,
  extractCorrectiveSteps,
  formatTempRange,
  type TempCheckBranchAction,
} from "../../lib/temp-checks-display";

export type FloorFlowInRangeSettings = {
  autoCloseWhenInRange: boolean;
};

type Props = {
  tempMinF: number | null;
  tempMaxF: number | null;
  actions: TempCheckBranchAction[];
  editable?: boolean;
  onChange?: (actions: TempCheckBranchAction[]) => void;
  showHead?: boolean;
  inRangeSettings?: FloorFlowInRangeSettings;
  onInRangeSettingsChange?: (settings: FloorFlowInRangeSettings) => void;
};

const DEFAULT_IN_RANGE: FloorFlowInRangeSettings = {
  autoCloseWhenInRange: true,
};

function parseRangeValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function TempCheckBranchFlow({
  tempMinF,
  tempMaxF,
  actions,
  editable = false,
  onChange,
  showHead = true,
  inRangeSettings = DEFAULT_IN_RANGE,
  onInRangeSettingsChange,
}: Props) {
  const min = typeof tempMinF === "number" ? tempMinF : parseRangeValue(String(tempMinF ?? ""));
  const max = typeof tempMaxF === "number" ? tempMaxF : parseRangeValue(String(tempMaxF ?? ""));
  const rangeLabel = formatTempRange(min, max);
  const canEdit = editable && !!onChange;
  const canEditInRange = canEdit && !!onInRangeSettingsChange;
  const correctiveSteps = extractCorrectiveSteps(actions);

  function handleStepsChange(steps: string[]) {
    onChange?.(buildRecheckBranchActions(steps));
  }

  function renderInRangeSettings() {
    if (canEditInRange) {
      return (
        <div className="tc-floor-flow-settings">
          <label className="tc-floor-flow-toggle">
            <input
              type="checkbox"
              checked={inRangeSettings.autoCloseWhenInRange}
              onChange={(e) =>
                onInRangeSettingsChange?.({
                  ...inRangeSettings,
                  autoCloseWhenInRange: e.target.checked,
                })
              }
            />
            <span>Auto-close item when in range</span>
          </label>
        </div>
      );
    }

    return (
      <ul className="tc-floor-flow-settings-readonly">
        <li>{inRangeSettings.autoCloseWhenInRange ? "Auto-close when in range" : "Manual close when in range"}</li>
      </ul>
    );
  }

  return (
    <div className={`tc-floor-flow${canEdit ? " tc-floor-flow--editable" : ""}`} aria-label="Floor flow">
      {showHead ? (
        <header className="tc-floor-flow-head">
          <h2>Floor Flow</h2>
          <p>What happens when this item is in range or out of range.</p>
        </header>
      ) : null}

      <div className="tc-floor-flow-cards">
        <article className="tc-floor-flow-card tc-floor-flow-card--start">
          <span className="tc-floor-flow-card-badge">1</span>
          <div className="tc-floor-flow-card-body">
            <h3>Leader takes temperature</h3>
            <p>The leader enters or captures the reading for this item.</p>
            <div className="tc-floor-flow-range-pill">
              <span className="tc-floor-flow-range-label">Safe range</span>
              <span className="tc-floor-flow-range-value">{rangeLabel}</span>
            </div>
          </div>
        </article>

        <article className="tc-floor-flow-card tc-floor-flow-card--in-range">
          <span className="tc-floor-flow-card-badge">2</span>
          <div className="tc-floor-flow-card-body">
            <h3>In Range</h3>
            <p>The item closes automatically and the leader moves to the next item.</p>
            {renderInRangeSettings()}
          </div>
        </article>

        <article className="tc-floor-flow-card tc-floor-flow-card--out-of-range">
          <span className="tc-floor-flow-card-badge">3</span>
          <div className="tc-floor-flow-card-body">
            <h3>Out of Range</h3>
            <p>The leader completes each corrective step, then takes a new reading.</p>

            <div className="tc-floor-flow-actions">
              <div className="tc-floor-flow-actions-head">
                <h4>Corrective Steps</h4>
              </div>

              <CorrectiveStepsEditor
                steps={correctiveSteps}
                onChange={canEdit ? handleStepsChange : undefined}
                readOnly={!canEdit}
              />

              {canEdit ? (
                <p className="tc-floor-flow-helper">Add at least one step leaders must complete before rechecking.</p>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
