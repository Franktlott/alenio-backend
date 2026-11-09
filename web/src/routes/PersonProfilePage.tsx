import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Globe,
  Info,
  Layers,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Rss,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RowMenu } from "../components/admin/RowMenu";
import { openDmWith } from "../components/chat/ChatDock";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { PostList } from "../components/network/NetworkFeed";
import { PersonRow } from "../components/network/PersonRow";
import { UserAvatar } from "../components/UserAvatar";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  acceptConnection,
  declineConnection,
  fetchPublicPersonProfile,
  removeConnection,
  requestConnection,
} from "../lib/api";
import { blockUser, fetchMutualConnections, unblockUser } from "../lib/network-api";
import { queryKeys } from "../lib/query-keys";
import { resolveUserImageUrl } from "../lib/user-avatar";
import "./discover/discover-manage.css";
import "./web-network.css";
import "./person-profile.css";

type Tab = "activity" | "connections" | "about";

function joinedLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A person's profile: hero, highlights, about, and their activity you can see. */
export function PersonProfilePage() {
  const { userId = "" } = useParams();
  const { me } = useEnterpriseShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (["activity", "connections", "about"] as const).find((t) => t === searchParams.get("tab")) ?? "activity";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "activity") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const profile = useQuery({
    queryKey: ["network", "person", userId],
    queryFn: () => fetchPublicPersonProfile(userId),
    enabled: Boolean(me && userId),
  });
  const p = profile.data;
  const mutual = useQuery({
    queryKey: ["network", "mutual", userId],
    queryFn: () => fetchMutualConnections(userId),
    enabled: Boolean(p && !p.isSelf),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["network", "person", userId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkConnections });
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkSuggestions });
    void queryClient.invalidateQueries({ queryKey: ["network", "feed"] });
  };
  const connect = useMutation({ mutationFn: () => requestConnection(userId), onSuccess: invalidate });
  const accept = useMutation({ mutationFn: () => acceptConnection(userId), onSuccess: invalidate });
  const decline = useMutation({ mutationFn: () => declineConnection(userId), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => removeConnection(userId), onSuccess: invalidate });
  const block = useMutation({ mutationFn: () => blockUser(userId), onSuccess: invalidate });
  const unblock = useMutation({ mutationFn: () => unblockUser(userId), onSuccess: invalidate });
  const busy = [connect, accept, decline, remove, block, unblock].some((m) => m.isPending);
  const actionError = [connect, accept, decline, remove, block, unblock].find((m) => m.isError)?.error;

  if (me === undefined || (profile.isLoading && !p)) return <EnterprisePageLoading label="Loading profile" />;
  if (!me) return null;

  const status = p?.connectionStatus ?? "none";
  const connected = status === "connected";
  const isSelf = Boolean(p?.isSelf) || userId === me.id;
  const joined = joinedLabel(p?.memberSince);
  const sharedCount = p?.sharedWorkspaces?.length ?? 0;
  const firstName = (p?.name ?? "").trim().split(/\s+/)[0] || "them";
  const canMessage = isSelf ? false : connected || Boolean(p?.canMessage);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="dm-page pp-page" data-testid="person-profile">
      <header className="pp-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="pp-hero-photo" />
        <div className="pp-hero-fade" aria-hidden />
        <button
          type="button"
          className="pp-hero-btn pp-back"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/network"))}
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </button>
        {!isSelf ? (
          <button
            type="button"
            className="pp-hero-btn pp-more"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={Boolean(menu)}
            onClick={(event) => setMenu((cur) => (cur ? null : event.currentTarget))}
          >
            <MoreHorizontal size={18} strokeWidth={2.4} />
          </button>
        ) : null}
      </header>

      <section className="pp-head">
        <div className="pp-avatar-ring">
          {p ? (
            <UserAvatar user={p} className="pp-avatar" imgClassName="pp-avatar-img" alt="" />
          ) : (
            <span className="pp-avatar pp-avatar--blank" aria-hidden />
          )}
        </div>
        <div className="pp-id">
          <h1>
            {p?.name || "Someone"}
            {p?.emailVerified ? (
              <BadgeCheck size={22} strokeWidth={2.2} className="pp-verified" aria-label="Verified" />
            ) : null}
          </h1>
          {p?.profileTitle?.trim() ? <p className="pp-title">{p.profileTitle.trim()}</p> : null}
          <p className="pp-meta">
            {p?.username ? <span className="pp-handle">@{p.username}</span> : null}
            {p?.username && p?.profileLocation ? <span aria-hidden>·</span> : null}
            {p?.profileLocation ? (
              <span>
                <MapPin size={13} strokeWidth={2.2} />
                {p.profileLocation}
              </span>
            ) : null}
          </p>
          {joined ? (
            <p className="pp-meta pp-joined">
              <Calendar size={13} strokeWidth={2.2} />
              Joined {joined}
            </p>
          ) : null}
        </div>

        <div className="pp-actions">
          {isSelf ? (
            <Link to="/profile" className="pp-btn pp-btn--primary">
              <Pencil size={16} strokeWidth={2.2} />
              Edit profile
            </Link>
          ) : p?.isBlockedByMe ? (
            <button type="button" className="pp-btn" disabled={busy} onClick={() => unblock.mutate()}>
              <Ban size={16} strokeWidth={2.2} />
              Unblock
            </button>
          ) : (
            <>
              {canMessage ? (
                <button type="button" className="pp-btn" onClick={() => openDmWith(userId)}>
                  <MessageCircle size={16} strokeWidth={2.2} />
                  Message
                </button>
              ) : null}
              {connected ? (
                <button type="button" className="pp-btn pp-btn--soft" disabled={busy} onClick={() => remove.mutate()} title="Remove connection">
                  <Check size={16} strokeWidth={2.4} />
                  Connected
                </button>
              ) : status === "pending_incoming" ? (
                <>
                  <button type="button" className="pp-btn pp-btn--primary" disabled={busy} onClick={() => accept.mutate()}>
                    <Check size={16} strokeWidth={2.4} />
                    Accept
                  </button>
                  <button type="button" className="pp-btn" disabled={busy} onClick={() => decline.mutate()}>
                    <X size={16} strokeWidth={2.4} />
                    Decline
                  </button>
                </>
              ) : status === "pending_outgoing" ? (
                <button type="button" className="pp-btn" disabled={busy} onClick={() => remove.mutate()} title="Cancel request">
                  <Clock size={16} strokeWidth={2.2} />
                  Pending
                </button>
              ) : (
                <button type="button" className="pp-btn pp-btn--primary" disabled={busy} onClick={() => connect.mutate()}>
                  <UserPlus size={16} strokeWidth={2.2} />
                  Connect
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {profile.isError ? <p className="nw-error">Couldn't load this profile.</p> : null}
      {actionError ? (
        <p className="nw-error">{actionError instanceof Error ? actionError.message : "Something went wrong."}</p>
      ) : null}

      <div className="pp-grid">
        <aside className="pp-side">
          <section className="dm-card dm-panel" aria-label="Highlights">
            <div className="dm-panel-head">
              <Sparkles size={15} strokeWidth={2.2} />
              <h3>Highlights</h3>
            </div>
            <button type="button" className="pp-highlight" onClick={() => setTab("connections")}>
              <span className="dm-stat-icon">
                <Users size={18} strokeWidth={2} />
              </span>
              <span className="pp-highlight-copy">
                <strong>{p?.stats?.connections ?? "—"}</strong>
                <span>Connections</span>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
            <button type="button" className="pp-highlight" onClick={() => setTab("about")}>
              <span className="dm-stat-icon">
                <Layers size={18} strokeWidth={2} />
              </span>
              <span className="pp-highlight-copy">
                <strong>{p ? sharedCount : "—"}</strong>
                <span>Shared workspaces</span>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
            {!isSelf && p?.stats ? (
              <button type="button" className="pp-highlight" onClick={() => setTab("connections")}>
                <span className="dm-stat-icon">
                  <UserPlus size={18} strokeWidth={2} />
                </span>
                <span className="pp-highlight-copy">
                  <strong>{p.stats.mutualConnections}</strong>
                  <span>Mutual connections</span>
                </span>
                <ChevronRight size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </section>

          <section className="dm-card dm-panel" aria-label="About">
            <div className="dm-panel-head">
              <Users size={15} strokeWidth={2.2} />
              <h3>About {firstName}</h3>
            </div>
            {p?.profileBio?.trim() ? (
              <p className="pp-bio">{p.profileBio.trim()}</p>
            ) : (
              <p className="dm-panel-empty">{isSelf ? "Add a short bio so people know what you do." : "No bio yet."}</p>
            )}
            <ul className="pp-facts">
              {p?.profileLocation ? (
                <li>
                  <MapPin size={14} strokeWidth={2.2} />
                  {p.profileLocation}
                </li>
              ) : null}
              {p?.profileWebsite ? (
                <li>
                  <Globe size={14} strokeWidth={2.2} />
                  <a href={p.profileWebsite} target="_blank" rel="noreferrer">
                    {websiteLabel(p.profileWebsite)}
                  </a>
                </li>
              ) : null}
            </ul>
          </section>
        </aside>

        <main className="pp-main">
          <nav className="dm-tabs pp-tabs" aria-label="Profile sections">
            <button type="button" className={`dm-tab${tab === "activity" ? " dm-tab--active" : ""}`} onClick={() => setTab("activity")} data-testid="pp-tab-activity">
              <Rss size={15} strokeWidth={2.2} />
              Activity
            </button>
            <button type="button" className={`dm-tab${tab === "connections" ? " dm-tab--active" : ""}`} onClick={() => setTab("connections")} data-testid="pp-tab-connections">
              <Users size={15} strokeWidth={2.2} />
              Connections{p?.stats ? ` (${p.stats.connections})` : ""}
            </button>
            <button type="button" className={`dm-tab${tab === "about" ? " dm-tab--active" : ""}`} onClick={() => setTab("about")} data-testid="pp-tab-about">
              <Info size={15} strokeWidth={2.2} />
              About
            </button>
          </nav>

          {tab === "activity" ? (
            <section className="dm-card nw-feed pp-activity" aria-label="Activity">
              <div className="nw-feed-head pp-activity-head">
                <div>
                  <h2>{isSelf ? "Your activity" : `${firstName}'s Activity`}</h2>
                  <p className="nw-muted">{isSelf ? "Everything you've shared." : "Posts and shares visible to you."}</p>
                </div>
              </div>
              <PostList
                meId={me.id}
                authorId={userId}
                onOpenPerson={(id) => navigate(`/people/${encodeURIComponent(id)}`)}
                empty={
                  isSelf
                    ? { title: "No posts yet", body: "Share an update from your Network feed and it will show up here." }
                    : connected
                      ? { title: "Nothing shared yet", body: `${firstName} hasn't posted since you connected.` }
                      : { title: "Connect to see posts", body: `${firstName}'s updates are visible to their connections.` }
                }
              />
            </section>
          ) : null}

          {tab === "connections" ? (
            <section className="dm-card dm-panel pp-connections" aria-label="Connections">
              <div className="dm-panel-head">
                <Users size={15} strokeWidth={2.2} />
                <h3>{isSelf ? "Your connections" : `People you both know${mutual.data ? ` (${mutual.data.length})` : ""}`}</h3>
                {isSelf ? (
                  <Link to="/network?tab=connections" className="dm-panel-link nw-panel-link">
                    Open <ChevronRight size={13} strokeWidth={2.4} />
                  </Link>
                ) : null}
              </div>
              {isSelf ? (
                <p className="dm-panel-empty">Your full list lives on the Network page.</p>
              ) : mutual.isLoading ? (
                <p className="dm-panel-empty">Loading…</p>
              ) : mutual.data && mutual.data.length === 0 ? (
                <p className="dm-panel-empty">
                  You don't share any connections with {firstName} yet
                  {p?.stats ? ` — they have ${p.stats.connections} in total.` : "."}
                </p>
              ) : (
                <ul className="nw-list">
                  {mutual.data?.map((m) => (
                    <li key={m.id}>
                      <PersonRow
                        person={m}
                        subtitle={m.username ? `@${m.username}` : undefined}
                        onOpen={() => navigate(`/people/${encodeURIComponent(m.id)}`)}
                        actions={
                          <button type="button" className="nw-icon-btn" aria-label={`Message ${m.name ?? ""}`} onClick={() => openDmWith(m.id)}>
                            <MessageCircle size={16} strokeWidth={2.2} />
                          </button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "about" ? (
            <section className="dm-card dm-panel pp-about" aria-label="About">
              <dl className="pp-about-list">
                {p?.profileTitle?.trim() ? (
                  <div>
                    <dt>Title</dt>
                    <dd>{p.profileTitle.trim()}</dd>
                  </div>
                ) : null}
                {p?.profileLocation ? (
                  <div>
                    <dt>Location</dt>
                    <dd>{p.profileLocation}</dd>
                  </div>
                ) : null}
                {p?.profileWebsite ? (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <a href={p.profileWebsite} target="_blank" rel="noreferrer">
                        {websiteLabel(p.profileWebsite)}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {joined ? (
                  <div>
                    <dt>Member since</dt>
                    <dd>{joined}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Workspaces</dt>
                  <dd>{p?.stats?.workspaces ?? "—"}</dd>
                </div>
              </dl>

              <h3 className="pp-about-h">Workspaces you share</h3>
              {sharedCount === 0 ? (
                <p className="dm-panel-empty">{isSelf ? "—" : `You and ${firstName} aren't in a workspace together.`}</p>
              ) : (
                <ul className="nw-drawer-list">
                  {p?.sharedWorkspaces?.map((w) => (
                    <li key={w.id}>
                      <span className="nw-ws-icon">
                        <Building2 size={15} strokeWidth={2} />
                      </span>
                      <span className="nw-person-copy">
                        <span className="nw-person-name">{w.name}</span>
                        {w.role ? <span className="nw-person-sub">{capitalize(w.role)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {p?.photos && p.photos.length > 0 ? (
                <>
                  <h3 className="pp-about-h">Photos</h3>
                  <ul className="pp-photos">
                    {p.photos.map((ph) => (
                      <li key={ph.id}>
                        <img src={resolveUserImageUrl(ph.url) ?? ph.url} alt="" loading="lazy" />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>

      {menu ? (
        <RowMenu anchor={menu} onClose={() => setMenu(null)}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              void copyLink();
            }}
          >
            <Link2 size={15} strokeWidth={2} />
            {copied ? "Copied" : "Copy profile link"}
          </button>
          {connected ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                remove.mutate();
              }}
            >
              <UserMinus size={15} strokeWidth={2} />
              Remove connection
            </button>
          ) : null}
          {p?.isBlockedByMe ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                unblock.mutate();
              }}
            >
              <Ban size={15} strokeWidth={2} />
              Unblock
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="dm-menu-danger"
              onClick={() => {
                setMenu(null);
                block.mutate();
              }}
            >
              <Ban size={15} strokeWidth={2} />
              Block
            </button>
          )}
        </RowMenu>
      ) : null}
    </div>
  );
}
