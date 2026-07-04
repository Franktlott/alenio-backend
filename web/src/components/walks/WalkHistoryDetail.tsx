import type { WalkCompletionRow } from "../../lib/api";
import {
  formatWalkDateTime,
  formatWalkScore,
  walkStatusBadgeClass,
  walkStatusLabel,
} from "../../lib/walks-display";

type Props = {
  completion: WalkCompletionRow;
};

export function WalkHistoryDetail({ completion }: Props) {
  return (
    <div className="walk-history-detail" data-testid="walk-history-detail">
      <header className="walk-history-detail-head">
        <div>
          <h2>{completion.walkName}</h2>
          <p className="enterprise-muted">{completion.workplace}</p>
        </div>
        <div className="walk-history-detail-meta">
          <span>{formatWalkDateTime(completion.completedAt)}</span>
          <span>Completed by {completion.completedByName}</span>
        </div>
      </header>

      <div className="walk-history-detail-stats">
        <div className="walk-history-stat">
          <span className="walk-history-stat-value">{completion.totalReviewed}</span>
          <span className="walk-history-stat-label">Items reviewed</span>
        </div>
        <div className="walk-history-stat">
          <span className="walk-history-stat-value walk-history-stat-value--pass">{completion.passCount}</span>
          <span className="walk-history-stat-label">Pass</span>
        </div>
        <div className="walk-history-stat">
          <span className="walk-history-stat-value walk-history-stat-value--attention">
            {completion.needsAttentionCount}
          </span>
          <span className="walk-history-stat-label">Needs Attention</span>
        </div>
        <div className="walk-history-stat">
          <span className="walk-history-stat-value">{completion.naCount}</span>
          <span className="walk-history-stat-label">N/A</span>
        </div>
        <div className="walk-history-stat">
          <span className="walk-history-stat-value">{completion.photosCount}</span>
          <span className="walk-history-stat-label">Photos</span>
        </div>
        {completion.scoringEnabled ? (
          <div className="walk-history-stat">
            <span className="walk-history-stat-value walk-history-stat-value--score">
              {formatWalkScore(completion)}
            </span>
            <span className="walk-history-stat-label">Score</span>
          </div>
        ) : null}
      </div>

      {completion.finalNotes ? (
        <section className="walk-history-final-notes">
          <h3>Final notes</h3>
          <p>{completion.finalNotes}</p>
        </section>
      ) : null}

      <section className="walk-history-responses">
        <h3>Observation details</h3>
        <ul>
          {completion.responses.map((row, index) => (
            <li key={row.itemId} className="walk-history-response">
              <div className="walk-history-response-head">
                <span className="walk-history-response-index">{index + 1}</span>
                <strong>{row.label}</strong>
                <span className={walkStatusBadgeClass(row.status)}>{walkStatusLabel(row.status)}</span>
              </div>
              {row.notes ? <p className="walk-history-response-notes">{row.notes}</p> : null}
              {row.photoUrl ? (
                <a href={row.photoUrl} target="_blank" rel="noopener noreferrer" className="walk-history-response-photo">
                  <img src={row.photoUrl} alt={`Photo for ${row.label}`} />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
