import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Check,
  Layers,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Rss,
  Search,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RowMenu } from "../components/admin/RowMenu";
import { openDmWith } from "../components/chat/ChatDock";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { AddConnectionDrawer } from "../components/network/AddConnectionDrawer";
import { NetworkFeed } from "../components/network/NetworkFeed";
import { PersonRow } from "../components/network/PersonRow";
import { UserAvatar } from "../components/UserAvatar";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  acceptConnection,
  declineConnection,
  dismissConnectionSuggestion,
  fetchConnectionSuggestions,
  fetchConnections,
  removeConnection,
  requestConnection,
  type AcceptedConnectionEntry,
  type ConnectionSuggestionRow,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import "./discover/discover-manage.css";
import "./web-network.css";

type Tab = "feed" | "connections" | "requests" | "suggestions" | "people";
type ConnFilter = "all" | "active" | "shared";

const TABS: Array<{ id: Tab; label: string; icon: typeof Rss }> = [
  { id: "feed", label: "Feed", icon: Rss },
  { id: "connections", label: "Connections", icon: Users },
  { id: "requests", label: "Requests", icon: ArrowLeftRight },
  { id: "suggestions", label: "Suggestions", icon: Sparkles },
  { id: "people", label: "People & Workspaces", icon: Building2 },
];

function parseTab(raw: string | null): Tab {
  return TABS.some((t) => t.id === raw) ? (raw as Tab) : "feed";
}

function subtitleFor(entry: AcceptedConnectionEntry): string {
  const title = entry.person.profileTitle?.trim();
  if (title) return title;
  if (entry.sharedWorkspaceNames?.[0]) return entry.sharedWorkspaceNames[0];
  return entry.person.username ? `@${entry.person.username}` : "";
}

function reasonFor(s: ConnectionSuggestionRow): string {
  const title = s.person.profileTitle?.trim();
  if (title) return title;
  if (s.mutualConnections && s.mutualConnections > 0)
    return `${s.mutualConnections} mutual connection${s.mutualConnections === 1 ? "" : "s"}`;
  if (s.sharedWorkspaces?.[0]) return s.sharedWorkspaces[0].name;
  return s.reasons?.[0]?.label ?? "";
}

/** Your Network: feed from connections, your people, requests and suggestions. */
export function WebNetworkPage() {
  const { me, teams } = useEnterpriseShell();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const addOpen = searchParams.get("add") === "1";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value === null) next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const setTab = (next: Tab) => setParam("tab", next === "feed" ? null : next);
  const openPerson = useCallback((id: string) => navigate(`/people/${encodeURIComponent(id)}`), [navigate]);
  const closeAdd = useCallback(() => setParam("add", null), [setParam]);

  const connections = useQuery({
    queryKey: queryKeys.networkConnections,
    queryFn: fetchConnections,
    enabled: Boolean(me),
    staleTime: 30_000,
  });
  const suggestions = useQuery({
    queryKey: queryKeys.networkSuggestions,
    queryFn: () => fetchConnectionSuggestions(30),
    enabled: Boolean(me),
    staleTime: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkConnections });
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkSuggestions });
  };
  const accept = useMutation({ mutationFn: acceptConnection, onSuccess: invalidate });
  const decline = useMutation({ mutationFn: declineConnection, onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: removeConnection, onSuccess: invalidate });
  const connect = useMutation({ mutationFn: requestConnection, onSuccess: invalidate });
  const dismiss = useMutation({ mutationFn: dismissConnectionSuggestion, onSuccess: invalidate });

  const accepted = connections.data?.accepted ?? [];
  const incoming = connections.data?.incoming ?? [];
  const outgoing = connections.data?.outgoing ?? [];
  const suggested = suggestions.data ?? [];

  if (me === undefined) return <EnterprisePageLoading label="Loading your network" />;
  if (!me) return null;

  const meUser = { id: me.id, name: me.name, email: me.email, image: me.image };

  return (
    <div className="dm-page nw-page" data-testid="web-network">
      <header className="dm-hero nw-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <h1>Your Network</h1>
          <p>Build relationships, collaborate, and grow your impact across Alenio.</p>
        </div>
      </header>

      <div className="nw-tabs-row">
        <nav className="dm-tabs nw-tabs" aria-label="Network sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`dm-tab${tab === id ? " dm-tab--active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              data-testid={`nw-tab-${id}`}
            >
              <Icon size={15} strokeWidth={2.2} />
              {label}
              {id === "requests" && incoming.length > 0 ? <span className="nw-tab-badge">{incoming.length}</span> : null}
            </button>
          ))}
        </nav>
        <button type="button" className="nw-add" onClick={() => setParam("add", "1")} data-testid="nw-add">
          <Plus size={17} strokeWidth={2.4} />
          Add Connection
        </button>
      </div>

      <section className="dm-stats nw-stats" aria-label="Network summary">
        <button type="button" className="dm-stat nw-stat" onClick={() => setTab("connections")}>
          <span className="dm-stat-icon">
            <Users size={18} strokeWidth={2} />
          </span>
          <div>
            <strong>{connections.data ? accepted.length : "—"}</strong>
            <span>Connections</span>
          </div>
        </button>
        <button type="button" className="dm-stat nw-stat" onClick={() => setTab("people")}>
          <span className="dm-stat-icon">
            <Layers size={18} strokeWidth={2} />
          </span>
          <div>
            <strong>{teams ? teams.length : "—"}</strong>
            <span>Workspaces</span>
          </div>
        </button>
        <button type="button" className="dm-stat nw-stat" onClick={() => setTab("requests")}>
          <span className="dm-stat-icon">
            <ArrowLeftRight size={18} strokeWidth={2} />
          </span>
          <div>
            <strong>{connections.data ? incoming.length : "—"}</strong>
            <span>Pending requests</span>
          </div>
        </button>
        <button type="button" className="dm-stat nw-stat" onClick={() => setTab("suggestions")}>
          <span className="dm-stat-icon">
            <UserPlus size={18} strokeWidth={2} />
          </span>
          <div>
            <strong>{suggestions.data ? suggested.length : "—"}</strong>
            <span>Suggested connections</span>
          </div>
        </button>
      </section>

      {connections.isError ? <p className="nw-error">Couldn't load your connections.</p> : null}

      {tab === "feed" ? (
        <div className="nw-grid">
          <aside className="nw-col nw-col--left">
            <ConnectionsPanel
              accepted={accepted}
              loading={connections.isLoading}
              onOpenPerson={openPerson}
              onViewAll={() => setTab("connections")}
            />
          </aside>
          <main className="nw-col nw-col--main">
            <NetworkFeed me={meUser} onOpenPerson={openPerson} />
          </main>
          <aside className="nw-col nw-col--right">
            <section className="dm-card dm-panel" aria-label="People you may know">
              <div className="dm-panel-head">
                <UserPlus size={15} strokeWidth={2.2} />
                <h3>People you may know</h3>
                <button type="button" className="dm-panel-link nw-panel-link" onClick={() => setTab("suggestions")}>
                  View all <ArrowRight size={13} strokeWidth={2.4} />
                </button>
              </div>
              {suggestions.isLoading ? <p className="dm-panel-empty">Finding people…</p> : null}
              {suggestions.data && suggested.length === 0 ? (
                <p className="dm-panel-empty">No suggestions right now. Join a workspace to meet more people.</p>
              ) : null}
              <ul className="nw-list">
                {suggested.slice(0, 3).map((s) => (
                  <li key={s.person.id}>
                    <PersonRow
                      person={s.person}
                      subtitle={reasonFor(s)}
                      size="sm"
                      onOpen={() => openPerson(s.person.id)}
                      actions={
                        <button
                          type="button"
                          className="nw-btn nw-btn--soft"
                          disabled={connect.isPending}
                          onClick={() => connect.mutate(s.person.id)}
                        >
                          Connect
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section className="dm-card dm-panel" aria-label="Pending requests">
              <div className="dm-panel-head">
                <ArrowLeftRight size={15} strokeWidth={2.2} />
                <h3>Pending requests{incoming.length > 0 ? ` (${incoming.length})` : ""}</h3>
                <button type="button" className="dm-panel-link nw-panel-link" onClick={() => setTab("requests")}>
                  View all <ArrowRight size={13} strokeWidth={2.4} />
                </button>
              </div>
              {connections.data && incoming.length === 0 ? <p className="dm-panel-empty">You're all caught up.</p> : null}
              <ul className="nw-list">
                {incoming.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <PersonRow
                      person={r.person}
                      subtitle={r.person.profileTitle?.trim() || (r.person.username ? `@${r.person.username}` : "")}
                      size="sm"
                      onOpen={() => openPerson(r.person.id)}
                      actions={
                        <>
                          <button
                            type="button"
                            className="nw-icon-btn nw-icon-btn--primary"
                            aria-label="Accept"
                            disabled={accept.isPending}
                            onClick={() => accept.mutate(r.person.id)}
                          >
                            <Check size={15} strokeWidth={2.6} />
                          </button>
                          <button
                            type="button"
                            className="nw-icon-btn"
                            aria-label="Decline"
                            disabled={decline.isPending}
                            onClick={() => decline.mutate(r.person.id)}
                          >
                            <X size={15} strokeWidth={2.4} />
                          </button>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section className="dm-card nw-grow" aria-label="Grow your network">
              <img src="/alenio-home-hero-afternoon.jpg" alt="" className="nw-grow-photo" />
              <div className="nw-grow-copy">
                <Users size={22} strokeWidth={2} className="nw-grow-icon" />
                <h3>Grow your network</h3>
                <p>Connect with leaders, peers, and teams across your workspaces.</p>
                <button type="button" className="nw-btn nw-btn--soft" onClick={() => setTab("suggestions")}>
                  Explore suggestions <ArrowRight size={14} strokeWidth={2.4} />
                </button>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "connections" ? (
        <ConnectionsTab
          accepted={accepted}
          loading={connections.isLoading}
          onOpenPerson={openPerson}
          onRemove={(id) => cancel.mutate(id)}
          onAdd={() => setParam("add", "1")}
        />
      ) : null}

      {tab === "requests" ? (
        <div className="nw-two">
          <section className="dm-card dm-panel" aria-label="Incoming requests">
            <div className="dm-panel-head">
              <UserPlus size={15} strokeWidth={2.2} />
              <h3>Incoming ({incoming.length})</h3>
            </div>
            {connections.data && incoming.length === 0 ? <p className="dm-panel-empty">No one is waiting on you.</p> : null}
            <ul className="nw-list">
              {incoming.map((r) => (
                <li key={r.id}>
                  <PersonRow
                    person={r.person}
                    subtitle={r.person.profileTitle?.trim() || (r.person.username ? `@${r.person.username}` : "")}
                    onOpen={() => openPerson(r.person.id)}
                    actions={
                      <>
                        <button type="button" className="nw-btn nw-btn--primary" disabled={accept.isPending} onClick={() => accept.mutate(r.person.id)}>
                          Accept
                        </button>
                        <button type="button" className="nw-btn" disabled={decline.isPending} onClick={() => decline.mutate(r.person.id)}>
                          Decline
                        </button>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
          <section className="dm-card dm-panel" aria-label="Sent requests">
            <div className="dm-panel-head">
              <ArrowLeftRight size={15} strokeWidth={2.2} />
              <h3>Sent ({outgoing.length})</h3>
            </div>
            {connections.data && outgoing.length === 0 ? <p className="dm-panel-empty">You haven't sent any requests.</p> : null}
            <ul className="nw-list">
              {outgoing.map((r) => (
                <li key={r.id}>
                  <PersonRow
                    person={r.person}
                    subtitle={r.person.profileTitle?.trim() || (r.person.username ? `@${r.person.username}` : "")}
                    onOpen={() => openPerson(r.person.id)}
                    actions={
                      <button type="button" className="nw-btn" disabled={cancel.isPending} onClick={() => cancel.mutate(r.person.id)}>
                        Cancel
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "suggestions" ? (
        <section className="dm-card nw-section" aria-label="Suggestions">
          <div className="nw-section-head">
            <h2>
              People you may know <span className="dm-count">({suggested.length})</span>
            </h2>
            <span className="nw-muted">From your workspaces and mutual connections</span>
          </div>
          {suggestions.isLoading ? <p className="nw-muted nw-pad">Finding people…</p> : null}
          {suggestions.data && suggested.length === 0 ? (
            <div className="dm-empty">
              <Sparkles size={22} strokeWidth={2} />
              <h3>No suggestions yet</h3>
              <p>Join a workspace or connect with a few people and we'll find more.</p>
            </div>
          ) : null}
          <ul className="nw-cards">
            {suggested.map((s) => (
              <li key={s.person.id} className="nw-card">
                <button type="button" className="nw-card-main" onClick={() => openPerson(s.person.id)}>
                  <UserAvatar user={s.person} className="nw-avatar nw-avatar--lg" imgClassName="nw-avatar-img" alt="" />
                  <span className="nw-person-name">{s.person.name || "Someone"}</span>
                  <span className="nw-person-sub">{reasonFor(s)}</span>
                  {s.reasons?.[0] && s.person.profileTitle?.trim() ? (
                    <span className="nw-card-reason">{s.reasons[0].label}</span>
                  ) : null}
                </button>
                <div className="nw-card-actions">
                  <button type="button" className="nw-btn nw-btn--primary" disabled={connect.isPending} onClick={() => connect.mutate(s.person.id)}>
                    <UserPlus size={14} strokeWidth={2.4} /> Connect
                  </button>
                  <button type="button" className="nw-icon-btn" aria-label="Dismiss" title="Not now" disabled={dismiss.isPending} onClick={() => dismiss.mutate(s.person.id)}>
                    <X size={15} strokeWidth={2.4} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "people" ? (
        <div className="nw-two">
          <section className="dm-card dm-panel" aria-label="Your workspaces">
            <div className="dm-panel-head">
              <Building2 size={15} strokeWidth={2.2} />
              <h3>Your workspaces ({teams?.length ?? 0})</h3>
            </div>
            {teams && teams.length === 0 ? (
              <p className="dm-panel-empty">You're not in a workspace yet. Create or join one from Workspace.</p>
            ) : null}
            <ul className="nw-list">
              {(teams ?? []).map((t) => (
                <li key={t.id} className="nw-ws-row">
                  <span className="nw-ws-icon">
                    <Building2 size={15} strokeWidth={2} />
                  </span>
                  <span className="nw-person-copy">
                    <span className="nw-person-name">{t.name}</span>
                    <span className="nw-person-sub">
                      {t._count.members} member{t._count.members === 1 ? "" : "s"} · {t.role}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="dm-card dm-panel nw-find" aria-label="Find people">
            <div className="dm-panel-head">
              <Search size={15} strokeWidth={2.2} />
              <h3>Find people</h3>
            </div>
            <p className="nw-muted">Search across Alenio by name, @username or email, then send a request.</p>
            <button type="button" className="nw-btn nw-btn--primary nw-find-btn" onClick={() => setParam("add", "1")}>
              <Search size={14} strokeWidth={2.4} /> Search people
            </button>
          </section>
        </div>
      ) : null}

      <AddConnectionDrawer open={addOpen} onClose={closeAdd} onOpenPerson={openPerson} />
    </div>
  );
}

function ConnectionsPanel({
  accepted,
  loading,
  onOpenPerson,
  onViewAll,
}: {
  accepted: AcceptedConnectionEntry[];
  loading: boolean;
  onOpenPerson: (id: string) => void;
  onViewAll: () => void;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? accepted.filter((e) =>
          [e.person.name, e.person.username, e.person.profileTitle, ...(e.sharedWorkspaceNames ?? [])].some((v) =>
            v?.toLowerCase().includes(needle),
          ),
        )
      : accepted;
    return list.slice(0, 5);
  }, [accepted, q]);

  return (
    <section className="dm-card dm-panel nw-conn-panel" aria-label="Your connections">
      <div className="dm-panel-head">
        <h3>Your Connections ({accepted.length})</h3>
        <button type="button" className="dm-panel-link nw-panel-link" onClick={onViewAll}>
          View all <ArrowRight size={13} strokeWidth={2.4} />
        </button>
      </div>
      <label className="nw-search">
        <Search size={14} strokeWidth={2.2} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connections…" aria-label="Search connections" />
      </label>
      {loading ? <p className="dm-panel-empty">Loading…</p> : null}
      {!loading && accepted.length === 0 ? (
        <p className="dm-panel-empty">No connections yet. Start with the people you may know.</p>
      ) : null}
      {!loading && accepted.length > 0 && rows.length === 0 ? <p className="dm-panel-empty">No matches.</p> : null}
      <ul className="nw-list">
        {rows.map((e) => (
          <li key={e.id}>
            <PersonRow
              person={e.person}
              subtitle={subtitleFor(e)}
              active={e.activeNow}
              onOpen={() => onOpenPerson(e.person.id)}
              actions={
                <button type="button" className="nw-icon-btn" aria-label={`Message ${e.person.name ?? ""}`} onClick={() => openDmWith(e.person.id)}>
                  <MessageCircle size={16} strokeWidth={2.2} />
                </button>
              }
            />
          </li>
        ))}
      </ul>
      <button type="button" className="nw-panel-cta" onClick={onViewAll}>
        View all connections <ArrowRight size={14} strokeWidth={2.4} />
      </button>
    </section>
  );
}

function ConnectionsTab({
  accepted,
  loading,
  onOpenPerson,
  onRemove,
  onAdd,
}: {
  accepted: AcceptedConnectionEntry[];
  loading: boolean;
  onOpenPerson: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ConnFilter>("all");
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accepted.filter((e) => {
      if (filter === "active" && !e.activeNow) return false;
      if (filter === "shared" && !e.sharesWorkspace) return false;
      if (!needle) return true;
      return [e.person.name, e.person.username, e.person.profileTitle, ...(e.sharedWorkspaceNames ?? [])].some((v) =>
        v?.toLowerCase().includes(needle),
      );
    });
  }, [accepted, q, filter]);

  const menuEntry = menu ? accepted.find((e) => e.person.id === menu.id) ?? null : null;

  return (
    <section className="dm-card nw-section" aria-label="All connections">
      <div className="nw-section-head">
        <h2>
          Your Connections <span className="dm-count">({accepted.length})</span>
        </h2>
        <div className="dm-toolbar">
          <label className="dm-search">
            <Search size={14} strokeWidth={2.2} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, role, or workspace…" aria-label="Search connections" />
          </label>
          <select value={filter} aria-label="Filter connections" onChange={(e) => setFilter(e.target.value as ConnFilter)}>
            <option value="all">Everyone</option>
            <option value="active">Active now</option>
            <option value="shared">Shares a workspace</option>
          </select>
        </div>
      </div>

      {loading ? <p className="nw-muted nw-pad">Loading…</p> : null}
      {!loading && accepted.length === 0 ? (
        <div className="dm-empty">
          <Users size={22} strokeWidth={2} />
          <h3>No connections yet</h3>
          <p>Add people you work with and their updates will show up in your feed.</p>
          <button type="button" className="nw-btn nw-btn--primary" onClick={onAdd}>
            <Plus size={14} strokeWidth={2.4} /> Add connection
          </button>
        </div>
      ) : null}
      {!loading && accepted.length > 0 && rows.length === 0 ? <p className="nw-muted nw-pad">No one matches that.</p> : null}

      <ul className="nw-cards">
        {rows.map((e) => (
          <li key={e.id} className="nw-card">
            <button type="button" className="nw-card-main" onClick={() => onOpenPerson(e.person.id)}>
              <span className="nw-avatar-wrap">
                <UserAvatar user={e.person} className="nw-avatar nw-avatar--lg" imgClassName="nw-avatar-img" alt="" />
                {e.activeNow ? <span className="nw-active-dot nw-active-dot--lg" aria-label="Active now" /> : null}
              </span>
              <span className="nw-person-name">{e.person.name || "Someone"}</span>
              <span className="nw-person-sub">{subtitleFor(e)}</span>
              {e.sharedWorkspaceNames && e.sharedWorkspaceNames.length > 0 && e.person.profileTitle?.trim() ? (
                <span className="nw-card-reason">
                  <Building2 size={11} strokeWidth={2.4} /> {e.sharedWorkspaceNames.join(", ")}
                </span>
              ) : null}
            </button>
            <div className="nw-card-actions">
              <button type="button" className="nw-btn nw-btn--soft" onClick={() => openDmWith(e.person.id)}>
                <MessageCircle size={14} strokeWidth={2.4} /> Message
              </button>
              <button
                type="button"
                className="nw-icon-btn"
                aria-label="More"
                aria-haspopup="menu"
                aria-expanded={menu?.id === e.person.id}
                onClick={(ev) => setMenu((cur) => (cur?.id === e.person.id ? null : { id: e.person.id, anchor: ev.currentTarget }))}
              >
                <MoreHorizontal size={16} strokeWidth={2.2} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {menu && menuEntry ? (
        <RowMenu anchor={menu.anchor} onClose={() => setMenu(null)}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              onOpenPerson(menuEntry.person.id);
            }}
          >
            <Users size={15} strokeWidth={2} />
            View profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="dm-menu-danger"
            onClick={() => {
              setMenu(null);
              onRemove(menuEntry.person.id);
            }}
          >
            <UserMinus size={15} strokeWidth={2} />
            Remove connection
          </button>
        </RowMenu>
      ) : null}
    </section>
  );
}
