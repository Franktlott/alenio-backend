import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../../components/AlenioGoLogo";
import { fetchGoSessionDashboard, type GoChecklistCard } from "../../lib/api";
import { checklistCardColorStyles } from "../../lib/checklist-card-colors";
import { clearGoSession, getGoSessionToken } from "../../lib/alenio-go-session";

function statusLabel(status: GoChecklistCard["status"]): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In progress";
    case "overdue":
      return "Overdue";
    default:
      return "Not started";
  }
}

function ChecklistCard({ card }: { card: GoChecklistCard }) {
  const styles = checklistCardColorStyles(card.cardColor);
  const cta = card.status === "in_progress" ? "Continue" : card.status === "complete" ? "Review" : "Start";

  return (
    <Link
      to={`/aleniogo/app/checklists/${card.checklistId}`}
      className="alenio-go-home-card"
      style={{
        background: styles.background,
        borderColor: styles.borderColor,
        boxShadow: `inset 4px 0 0 ${styles.accent}`,
      }}
    >
      <div className="alenio-go-home-card__head">
        <h3 className="alenio-go-home-card__title">{card.name}</h3>
        <span className={`alenio-go-home-card__status alenio-go-home-card__status--${card.status}`}>
          {statusLabel(card.status)}
        </span>
      </div>
      <p className="alenio-go-home-card__meta">
        {card.area ? `${card.area} · ` : ""}
        {card.taskCount} task{card.taskCount === 1 ? "" : "s"}
        {card.dueTime ? ` · Due ${card.dueTime}` : ""}
        {card.shift ? ` · ${card.shift}` : ""}
      </p>
      <div className="alenio-go-home-card__progress" aria-hidden>
        <span style={{ width: `${card.progressPct}%`, background: styles.accent }} />
      </div>
      <span className="alenio-go-home-card__cta" style={{ color: styles.accent }}>
        {cta} →
      </span>
    </Link>
  );
}

function Section({ title, cards }: { title: string; cards: GoChecklistCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="alenio-go-home-section">
      <h2 className="alenio-go-home-section__title">{title}</h2>
      <div className="alenio-go-home-section__grid">
        {cards.map((card) => (
          <ChecklistCard key={card.checklistId} card={card} />
        ))}
      </div>
    </section>
  );
}

export function AlenioGoHomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchGoSessionDashboard>> | null>(null);

  const sessionToken = getGoSessionToken();

  const load = useCallback(async () => {
    if (!sessionToken) {
      navigate("/aleniogo", { replace: true });
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchGoSessionDashboard(sessionToken);
      setDashboard(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Session expired";
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("401")) {
        clearGoSession();
        navigate("/aleniogo", { replace: true });
        return;
      }
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [navigate, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = () => {
    clearGoSession();
    navigate("/aleniogo", { replace: true });
  };

  if (!sessionToken) return null;

  return (
    <div className="alenio-go-app" data-testid="alenio-go-home">
      <header className="alenio-go-app__header">
        <div className="alenio-go-app__header-copy">
          <AlenioGoLogo variant="header" className="alenio-go-app__logo" />
          <div>
            <p className="alenio-go-app__workspace">{dashboard?.workspace.name ?? "…"}</p>
            <h1 className="alenio-go-app__location">{dashboard?.location.name ?? "Loading…"}</h1>
          </div>
        </div>
        <div className="alenio-go-app__header-user">
          <span>{dashboard?.session.displayName ?? "…"}</span>
          <button type="button" className="alenio-go-app__switch" onClick={signOut}>
            Switch user
          </button>
        </div>
      </header>

      <main className="alenio-go-app__main">
        {loading ? (
          <p className="alenio-go-app__loading">Loading your tasks…</p>
        ) : err ? (
          <p className="alenio-go-public__error" role="alert">
            {err}
          </p>
        ) : dashboard ? (
          <>
            <Section title="Due now" cards={dashboard.sections.dueNow} />
            <Section title="Today's checklists" cards={dashboard.sections.today} />
            <Section title="Recently completed" cards={dashboard.sections.recentlyCompleted} />
            {dashboard.allChecklists.length === 0 ? (
              <div className="alenio-go-home-empty">
                <p>No checklists assigned to this location yet.</p>
                <p className="enterprise-muted">Ask your manager to assign checklists in Alenio Go setup.</p>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
