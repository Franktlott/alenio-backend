import type { TempCheckCompletionRow } from "../../lib/api";
import { formatTempCheckDateTime, formatTempRange } from "../../lib/temp-checks-display";

type Props = {
  completion: TempCheckCompletionRow;
};

export function TempCheckHistoryDetail({ completion }: Props) {
  return (
    <div className="go-tc-history-detail">
      <div className="go-tc-history-summary">
        <div>
          <p className="go-tc-history-kicker">Completed check</p>
          <h2>{completion.checkName}</h2>
          <p>
            {formatTempCheckDateTime(completion.completedAt)} · {completion.completedByName}
          </p>
        </div>
        <div className="go-tc-history-stats">
          <span>
            <strong>{completion.inRangeCount}</strong> in range
          </span>
          <span>
            <strong>{completion.outOfRangeCount}</strong> out of range
          </span>
        </div>
      </div>

      <ul className="go-tc-history-readings">
        {completion.readings.map((row) => (
          <li key={row.itemId} className={row.inRange ? "go-tc-history-reading--ok" : "go-tc-history-reading--alert"}>
            <div>
              <strong>{row.label}</strong>
              <span>
                {row.readingF}°F · Target {formatTempRange(row.tempMinF, row.tempMaxF)}
              </span>
            </div>
            <span>{row.inRange ? "In range" : row.correctiveAction}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
