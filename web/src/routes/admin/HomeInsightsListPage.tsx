import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  fetchHomeInsightsAdmin,
  reorderHomeInsights,
  updateHomeInsightSchedule,
  type HomeInsightCard,
  type HomeInsightScheduleInput,
} from "../../lib/home-insights-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./home-insights-admin.css";

const QUERY_KEY = ["admin-home-insights"] as const;

function destinationLabel(card: HomeInsightCard): string {
  if (card.destination.type === "recognition") return "Recognition";
  if (card.destination.type === "discover") return "Discover";
  return "Seneca";
}

function titleLine(title: string): string {
  return title.replace(/\n/g, " ");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function HomeInsightsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canView = staffCan(me, "content.view");
  const canEdit = staffCan(me, "content.edit");

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchHomeInsightsAdmin,
    enabled: Boolean(me) && canView,
  });

  const cards = data?.cards ?? [];
  const currentId = data?.current?.id ?? null;

  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [cadence, setCadence] = useState<"daily" | "weekly">("weekly");
  const [pinnedCardId, setPinnedCardId] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMode(data.schedule.mode);
    setCadence(data.schedule.cadence);
    setPinnedCardId(data.schedule.pinnedCardId ?? data.current?.id ?? "");
  }, [data]);

  const reorder = useMutation({
    mutationFn: reorderHomeInsights,
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
    },
  });

  const saveSchedule = useMutation({
    mutationFn: (body: HomeInsightScheduleInput) => updateHomeInsightSchedule(body),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setScheduleError(null);
      setScheduleSaved(`Schedule saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
    },
    onError: (err) => {
      setScheduleSaved(null);
      setScheduleError(err instanceof Error ? err.message : "Couldn’t save schedule.");
    },
  });

  if (me === undefined || (canView && isLoading)) {
    return <EnterprisePageLoading label="Loading Home insights…" />;
  }

  if (!me || !canView) {
    return (
      <div className="dm-page">
        <p className="discover-error" style={{ margin: 24 }}>
          You don’t have access to Content.
        </p>
      </div>
    );
  }

  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= cards.length) return;
    const ids = cards.map((card) => card.id);
    const swap = ids[index]!;
    ids[index] = ids[next]!;
    ids[next] = swap;
    reorder.mutate(ids);
  };

  const activeCards = cards.filter((card) => card.isActive);

  const onSaveSchedule = () => {
    setScheduleSaved(null);
    if (mode === "automatic") {
      saveSchedule.mutate({ mode: "automatic", cadence });
      return;
    }
    saveSchedule.mutate({
      mode: "manual",
      pinnedCardId: pinnedCardId || null,
      cadence,
    });
  };

  return (
    <div className="dm-page" data-testid="home-insights-admin">
      <header className="dm-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/home">Home</Link>
            <span aria-hidden>›</span>
            <span>Content</span>
          </nav>
          <h1>Home insights</h1>
          <p>Manage the Insight card on Home — copy, image, CTA, and when it rotates.</p>
        </div>
      </header>

      <ContentSectionTabs active="home-insights" />

      {error ? (
        <p className="discover-error">{error instanceof Error ? error.message : "Couldn’t load insights."}</p>
      ) : null}

      <section className="hi-schedule" data-testid="hi-schedule">
        <div className="hi-schedule-live">
          <p className="hi-schedule-kicker">Live on Home now</p>
          <h2>{data?.current ? titleLine(data.current.title) : "No active card"}</h2>
          {data?.schedule.mode === "automatic" ? (
            <p>
              Automatic · {data.schedule.cadence === "daily" ? "changes every day" : "changes every Monday"} (UTC)
              {data.nextChangeAt ? (
                <>
                  <br />
                  Next change: <strong>{formatWhen(data.nextChangeAt)}</strong>
                  {data.nextCard ? <> · then “{titleLine(data.nextCard.title)}”</> : null}
                </>
              ) : null}
            </p>
          ) : (
            <p>
              Manual pin · stays until you change it
              <br />
              No automatic change scheduled
            </p>
          )}
        </div>

        {canEdit ? (
          <div className="hi-schedule-controls">
            <div className="hi-field">
              <label htmlFor="hi-mode">Rotation</label>
              <select
                id="hi-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "automatic" | "manual")}
              >
                <option value="automatic">Automatic rotation</option>
                <option value="manual">Manual pin (no auto change)</option>
              </select>
            </div>

            {mode === "automatic" ? (
              <div className="hi-field">
                <label htmlFor="hi-cadence">Change</label>
                <select
                  id="hi-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as "daily" | "weekly")}
                >
                  <option value="weekly">Every Monday (UTC)</option>
                  <option value="daily">Every day (UTC)</option>
                </select>
              </div>
            ) : (
              <div className="hi-field">
                <label htmlFor="hi-pinned">Pinned card</label>
                <select
                  id="hi-pinned"
                  value={pinnedCardId}
                  onChange={(e) => setPinnedCardId(e.target.value)}
                >
                  <option value="">Select a card…</option>
                  {activeCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {titleLine(card.title)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="hi-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="dm-new"
                disabled={saveSchedule.isPending}
                onClick={onSaveSchedule}
              >
                {saveSchedule.isPending ? "Saving…" : "Save schedule"}
              </button>
            </div>
            {scheduleError ? <p className="discover-error">{scheduleError}</p> : null}
            {scheduleSaved && !scheduleError ? (
              <p className="enterprise-muted" style={{ margin: 0 }}>
                {scheduleSaved}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="hi-deck">
        <div className="hi-toolbar">
          <p className="enterprise-muted" style={{ margin: 0 }}>
            {cards.length} card{cards.length === 1 ? "" : "s"} · {activeCards.length} active in the deck
          </p>
          {canEdit ? (
            <Link className="dm-new" to="/admin/home-insights/new" data-testid="hi-new">
              <Plus size={16} strokeWidth={2.2} />
              New insight
            </Link>
          ) : null}
        </div>

        <div className="hi-list" data-testid="hi-list">
          {cards.length === 0 ? (
            <section className="dm-card" style={{ padding: 24 }}>
              <Sparkles size={18} strokeWidth={2} />
              <p style={{ margin: "8px 0 0" }}>No insight cards yet.</p>
            </section>
          ) : (
            cards.map((card, index) => (
              <div
                key={card.id}
                className={`hi-row${card.isActive ? "" : " hi-row--inactive"}${
                  card.id === currentId ? " hi-row--current" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/admin/home-insights/${card.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/admin/home-insights/${card.id}`);
                  }
                }}
                data-testid={`hi-row-${card.slug}`}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt="" className="hi-thumb" />
                ) : (
                  <div className="hi-thumb" aria-hidden />
                )}
                <div className="hi-row-copy">
                  <strong>{titleLine(card.title)}</strong>
                  <span>{card.actionLabel}</span>
                </div>
                <div className="hi-row-meta">
                  {card.id === currentId ? <span className="hi-badge">Live now</span> : null}
                  <span className="hi-badge hi-badge--muted">{destinationLabel(card)}</span>
                  {!card.isActive ? <span className="hi-badge hi-badge--muted">Archived</span> : null}
                  {canEdit ? (
                    <div className="hi-move" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index === cards.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
