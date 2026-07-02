import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BriefingRow } from "../../lib/api";
import {
  fetchTeamBriefings,
  fetchTeamGoDevices,
  fetchWebTeam,
  postBriefingComplete,
  teamBriefingDocumentPath,
} from "../../lib/api";
import {
  briefingConsoleStatusLabel,
  briefingIconTone,
  formatBriefingDate,
} from "../../lib/briefings-display";
import { BriefingConsoleStats } from "./BriefingConsoleStats";
import { BriefingReviewPanel } from "./BriefingReviewPanel";
import { BriefingStatusBadge } from "./BriefingStatusBadge";

type Tab = "active" | "drafts" | "archived";

type Props = {
  teamId: string;
  teamName: string;
  canManage: boolean;
  initialBriefingId?: string;
};

function BriefingIcon({ title }: { title: string }) {
  const tone = briefingIconTone(title);
  return (
    <span className={`briefing-console-icon briefing-console-icon--${tone}`} aria-hidden>
      {tone === "shield" ? "🛡" : tone === "megaphone" ? "📣" : tone === "alert" ? "⚠" : "📄"}
    </span>
  );
}

export function BriefingWorkspace({ teamId, teamName, canManage, initialBriefingId }: Props) {
  const [briefings, setBriefings] = useState<BriefingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialBriefingId ?? null);
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [lastSyncMs, setLastSyncMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void Promise.all([
      fetchTeamBriefings(teamId),
      fetchWebTeam(teamId).catch(() => null),
      canManage ? fetchTeamGoDevices(teamId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([briefingData, team, devices]) => {
        setBriefings(briefingData.briefings);
        setMemberCount(team?.members?.length ?? 0);
        setDeviceCount(devices.length);
        setLastSyncMs(Date.now());
        setSelectedId((prev) => {
          if (prev && briefingData.briefings.some((b) => b.id === prev)) return prev;
          if (initialBriefingId && briefingData.briefings.some((b) => b.id === initialBriefingId)) {
            return initialBriefingId;
          }
          return briefingData.briefings[0]?.id ?? null;
        });
      })
      .catch(() => setBriefings([]))
      .finally(() => setLoading(false));
  }, [teamId, canManage, initialBriefingId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab !== "active") return [];
    const q = search.trim().toLowerCase();
    return briefings.filter((b) => {
      if (!q) return true;
      return b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q);
    });
  }, [briefings, search, tab]);

  const selected = briefings.find((b) => b.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const activeCount = briefings.length;

  return (
    <div className="briefing-console" data-testid="briefing-console">
      <header className="briefing-console-top">
        <div className="briefing-console-top-left">
          <Link to="/go" className="briefing-console-back">
            ← Alenio Go console
          </Link>
          <h1 className="briefing-console-title">Briefings</h1>
        </div>
        {canManage ? (
          <Link to="/go/briefings/new" className="briefing-console-create-btn">
            + Create Briefing
          </Link>
        ) : null}
      </header>

      <BriefingConsoleStats deviceCount={deviceCount} memberCount={memberCount} lastSyncMs={lastSyncMs} />

      <div className="briefing-console-body">
        <aside className="briefing-console-sidebar">
          <div className="briefing-console-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`briefing-console-tab${tab === "active" ? " briefing-console-tab--active" : ""}`}
              aria-selected={tab === "active"}
              onClick={() => setTab("active")}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              role="tab"
              className={`briefing-console-tab${tab === "drafts" ? " briefing-console-tab--active" : ""}`}
              aria-selected={tab === "drafts"}
              onClick={() => setTab("drafts")}
            >
              Drafts (0)
            </button>
            <button
              type="button"
              role="tab"
              className={`briefing-console-tab${tab === "archived" ? " briefing-console-tab--active" : ""}`}
              aria-selected={tab === "archived"}
              onClick={() => setTab("archived")}
            >
              Archived (0)
            </button>
          </div>

          {tab === "active" ? (
            <>
              <div className="briefing-console-search-row">
                <input
                  type="search"
                  className="briefing-console-search"
                  placeholder="Search briefings…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className="briefing-console-filter-btn">
                  Filter
                </button>
              </div>

              {loading ? (
                <p className="briefing-console-empty">Loading briefings…</p>
              ) : filtered.length === 0 ? (
                <p className="briefing-console-empty">No briefings match your search.</p>
              ) : (
                <ul className="briefing-console-list">
                  {filtered.map((b) => {
                    const isSelected = b.id === selected?.id;
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          className={`briefing-console-list-item${isSelected ? " briefing-console-list-item--selected" : ""}`}
                          onClick={() => setSelectedId(b.id)}
                        >
                          <BriefingIcon title={b.title} />
                          <div className="briefing-console-list-copy">
                            <div className="briefing-console-list-head">
                              <strong>{b.title}</strong>
                              <BriefingStatusBadge status={b.status} />
                            </div>
                            <p>{b.description}</p>
                            <div className="briefing-console-list-meta">
                              <span>Published {formatBriefingDate(b.publishedAt)}</span>
                              {b.dueAt ? <span>Due {formatBriefingDate(b.dueAt)}</span> : null}
                            </div>
                            {canManage && typeof b.signedCount === "number" ? (
                              <span className="briefing-console-list-pending">{b.signedCount} signed</span>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="briefing-console-empty">
              No {tab} yet. Published briefings appear under Active.
            </p>
          )}
        </aside>

        <section className="briefing-console-main">
          {!selected ? (
            <div className="briefing-console-placeholder">
              <p>Select a briefing to review and sign.</p>
            </div>
          ) : (
            <BriefingReviewPanel
              key={selected.id}
              layout="console"
              briefing={selected}
              documentFetchPath={teamBriefingDocumentPath(teamId, selected.id)}
              useAuth
              teamName={teamName}
              memberCount={memberCount}
              signedCount={selected.signedCount}
              canManage={canManage}
              adminHref={canManage ? `/go/briefings/${selected.id}/admin` : undefined}
              busy={busy}
              error={error}
              onComplete={async (payload) => {
                setBusy(true);
                setError(null);
                try {
                  await postBriefingComplete(teamId, selected.id, payload);
                  load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not complete briefing.");
                  throw err;
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}
