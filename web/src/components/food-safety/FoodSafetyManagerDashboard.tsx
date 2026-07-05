type Props = {
  manager: {
    complianceByLocation?: Array<{ workplace: string; completed: number; missed: number; risk: string }>;
    missedWindows?: number;
    openCorrectiveActions?: Array<{ id: string; actionType: string; performedByName: string; createdAt: string }>;
    failedTemps?: number;
    entryMix?: { manual: number; bluetooth: number };
    highestRiskLocations?: string[];
    trend?: { last7Days: number; completedToday: number };
  };
};

export function FoodSafetyManagerDashboard({ manager }: Props) {
  return (
    <div className="fs-manager">
      <h2 className="fs-manager-title">Corporate food safety overview</h2>
      <div className="fs-manager-stats">
        <article>
          <span>Failed temps today</span>
          <strong>{manager.failedTemps ?? 0}</strong>
        </article>
        <article>
          <span>Missed windows</span>
          <strong>{manager.missedWindows ?? 0}</strong>
        </article>
        <article>
          <span>Manual entries</span>
          <strong>{manager.entryMix?.manual ?? 0}</strong>
        </article>
        <article>
          <span>Bluetooth entries</span>
          <strong>{manager.entryMix?.bluetooth ?? 0}</strong>
        </article>
      </div>

      <section className="fs-manager-section">
        <h3>Compliance by location</h3>
        {(manager.complianceByLocation ?? []).length === 0 ? (
          <p className="enterprise-muted">No location data yet.</p>
        ) : (
          <ul className="fs-manager-list">
            {(manager.complianceByLocation ?? []).map((row) => (
              <li key={row.workplace} className={`fs-manager-risk fs-manager-risk--${row.risk}`}>
                <strong>{row.workplace}</strong>
                <span>
                  {row.completed} completed · {row.missed} missed · {row.risk} risk
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fs-manager-section">
        <h3>Open corrective actions</h3>
        {(manager.openCorrectiveActions ?? []).length === 0 ? (
          <p className="enterprise-muted">No open corrective actions.</p>
        ) : (
          <ul className="fs-manager-list">
            {(manager.openCorrectiveActions ?? []).map((row) => (
              <li key={row.id}>
                <strong>{row.actionType.replace(/_/g, " ")}</strong>
                <span>
                  {row.performedByName} · {new Date(row.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fs-manager-section">
        <h3>Trend</h3>
        <p className="enterprise-muted">
          {manager.trend?.completedToday ?? 0} checks completed today · {manager.trend?.last7Days ?? 0} runs logged
          recently
        </p>
        {(manager.highestRiskLocations ?? []).length > 0 ? (
          <p className="fs-manager-risk-note">Highest risk: {(manager.highestRiskLocations ?? []).join(", ")}</p>
        ) : null}
      </section>
    </div>
  );
}
