import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  fetchHomeWorkspaceAdmin,
  reorderHomeWorkspaceCards,
  updateHomeWorkspaceSchedule,
  type HomeWorkspaceCard,
  type HomeWorkspaceScheduleInput,
} from "../../lib/home-workspace-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./home-insights-admin.css";

const QUERY_KEY = ["admin-home-workspace"] as const;

function titleLine(title: string): string {
  return title.replace(/\n/g, " ");
}

export function HomeWorkspaceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canView = staffCan(me, "content.view");
  const canEdit = staffCan(me, "content.edit");

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchHomeWorkspaceAdmin,
    enabled: Boolean(me) && canView,
  });

  const cards = data?.cards ?? [];
  const currentId = data?.current?.id ?? null;

  const [mode, setMode] = useState<"automatic" | "manual">("manual");
  const [pinnedCardId, setPinnedCardId] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMode(data.schedule.mode);
    setPinnedCardId(data.schedule.pinnedCardId ?? data.current?.id ?? "");
  }, [data]);

  const reorder = useMutation({
    mutationFn: reorderHomeWorkspaceCards,
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
    },
  });

  const saveSchedule = useMutation({
    mutationFn: (body: HomeWorkspaceScheduleInput) => updateHomeWorkspaceSchedule(body),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setScheduleError(null);
      setScheduleSaved(
        `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      );
    },
    onError: (err) => {
      setScheduleSaved(null);
      setScheduleError(err instanceof Error ? err.message : "Couldn’t save.");
    },
  });

  if (me === undefined || (canView && isLoading)) {
    return <EnterprisePageLoading label="Loading Alenio Workspace cards…" />;
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

  const destinationLabel = (card: HomeWorkspaceCard) =>
    card.destination.type === "join" ? "Join workspace" : "Create workspace";

  return (
    <div className="dm-page" data-testid="home-workspace-admin">
      <header className="dm-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/home">Home</Link>
            <span aria-hidden>›</span>
            <span>Content</span>
          </nav>
          <h1>Alenio Workspace Card</h1>
          <p>
            Promo on Home when someone has no workspace — same card style as Insights.
          </p>
        </div>
      </header>

      <ContentSectionTabs active="home-workspace" />

      {error ? (
        <p className="discover-error">
          {error instanceof Error ? error.message : "Couldn’t load cards."}
        </p>
      ) : null}

      <section className="hi-schedule" data-testid="hw-schedule">
        <div className="hi-schedule-live">
          <p className="hi-schedule-kicker">Live on Home now</p>
          <h2>{data?.current ? titleLine(data.current.title) : "No active card"}</h2>
          <p>
            {data?.schedule.mode === "manual"
              ? "Manual pin · shown until you change it"
              : "Automatic · first active card in the deck"}
          </p>
        </div>

        {canEdit ? (
          <div className="hi-schedule-controls">
            <div className="hi-field">
              <label htmlFor="hw-mode">Rotation</label>
              <select
                id="hw-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "automatic" | "manual")}
              >
                <option value="manual">Manual pin</option>
                <option value="automatic">First active in deck</option>
              </select>
            </div>
            {mode === "manual" ? (
              <div className="hi-field">
                <label htmlFor="hw-pinned">Pinned card</label>
                <select
                  id="hw-pinned"
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
            ) : null}
            <div className="hi-actions" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="dm-new"
                disabled={saveSchedule.isPending}
                onClick={() => {
                  setScheduleSaved(null);
                  saveSchedule.mutate({
                    mode,
                    pinnedCardId: mode === "manual" ? pinnedCardId || null : null,
                  });
                }}
              >
                {saveSchedule.isPending ? "Saving…" : "Save"}
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
            {cards.length} card{cards.length === 1 ? "" : "s"} · {activeCards.length} active
          </p>
          {canEdit ? (
            <Link className="dm-new" to="/admin/home-workspace/new" data-testid="hw-new">
              <Plus size={16} strokeWidth={2.2} />
              New card
            </Link>
          ) : null}
        </div>

        <div className="hi-list" data-testid="hw-list">
          {cards.length === 0 ? (
            <section className="dm-card" style={{ padding: 24 }}>
              <Building2 size={18} strokeWidth={2} />
              <p style={{ margin: "8px 0 0" }}>No workspace cards yet.</p>
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
                onClick={() => navigate(`/admin/home-workspace/${card.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/admin/home-workspace/${card.id}`);
                  }
                }}
                data-testid={`hw-row-${card.slug}`}
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
                  {!card.isActive ? (
                    <span className="hi-badge hi-badge--muted">Archived</span>
                  ) : null}
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
