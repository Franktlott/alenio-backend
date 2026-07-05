import { Link } from "react-router-dom";
import type { TempCheckCompletionRow, TempCheckTemplateRow } from "../../lib/api";
import { formatTempCheckDateTime, formatTempCheckSchedule, isTempCheckWindowOpen } from "../../lib/temp-checks-display";

type Props = {
  templates: TempCheckTemplateRow[];
  basePath: string;
};

export function GoKioskTempChecksList({ templates, basePath }: Props) {
  if (templates.length === 0) {
    return (
      <div className="go-kiosk-walks-empty">
        <p>No temperature programs are available on this device yet.</p>
        <p className="enterprise-muted">
          Programs are configured in the Alenio Go console by your workspace leaders. Once published, they appear here for floor execution.
        </p>
      </div>
    );
  }

  return (
    <div className="go-kiosk-walks-list-wrap">
      <h2 className="go-kiosk-walks-list-title">Available programs</h2>
      <ul className="go-kiosk-walks-list go-tc-kiosk-list">
        {templates.map((program) => {
          const open = isTempCheckWindowOpen(program);
          return (
            <li key={program.id}>
              {open ? (
                <Link to={`${basePath}/${program.id}/run`} className="go-kiosk-walks-card go-tc-kiosk-card">
                  <div>
                    <strong>{program.name}</strong>
                    <span>{formatTempCheckSchedule(program)}</span>
                  </div>
                  <div className="go-kiosk-walks-card-meta">
                    <span>{program.itemCount} items</span>
                    <span className="go-tc-kiosk-badge go-tc-kiosk-badge--open">Window open</span>
                  </div>
                  <span className="go-kiosk-walks-card-cta">Start check →</span>
                </Link>
              ) : (
                <div className="go-kiosk-walks-card go-tc-kiosk-card go-tc-kiosk-card--closed" aria-disabled>
                  <div>
                    <strong>{program.name}</strong>
                    <span>{formatTempCheckSchedule(program)}</span>
                  </div>
                  <div className="go-kiosk-walks-card-meta">
                    <span>{program.itemCount} items</span>
                    <span className="go-tc-kiosk-badge go-tc-kiosk-badge--closed">Window closed</span>
                  </div>
                  <span className="go-kiosk-walks-card-cta">Opens later</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type HistoryProps = {
  completions: TempCheckCompletionRow[];
  basePath: string;
};

export function GoKioskTempChecksHistory({ completions, basePath }: HistoryProps) {
  if (completions.length === 0) {
    return <p className="enterprise-muted">No completed temp checks yet.</p>;
  }

  return (
    <ul className="go-kiosk-walks-history go-tc-kiosk-history">
      {completions.map((row) => (
        <li key={row.id}>
          <Link to={`${basePath}/history/${row.id}`} className="go-kiosk-walks-history-item">
            <strong>{row.checkName}</strong>
            <span>
              {formatTempCheckDateTime(row.completedAt)} · {row.completedByName}
            </span>
            {row.outOfRangeCount > 0 ? (
              <span className="go-kiosk-walks-history-flag">{row.outOfRangeCount} out of range</span>
            ) : (
              <span className="go-tc-kiosk-history-ok">All in range</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
