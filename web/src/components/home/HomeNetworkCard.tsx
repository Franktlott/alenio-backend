import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { acceptConnection, fetchConnectionSuggestions, fetchConnections, requestConnection } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { UserAvatar } from "../UserAvatar";
import "./home-cards.css";

/** Network counts, then pending requests, then people you may know. */
export function HomeNetworkCard() {
  const { me } = useEnterpriseShell();
  const queryClient = useQueryClient();
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
  const connect = useMutation({ mutationFn: requestConnection, onSuccess: invalidate });

  const accepted = connections.data?.accepted.length ?? 0;
  const incoming = connections.data?.incoming ?? [];
  const sent = connections.data?.outgoing.length ?? 0;
  const suggested = (suggestions.data ?? []).filter((s) => !s.connectionStatus || s.connectionStatus === "none");
  const loading = connections.isLoading;

  const subtitle = loading
    ? "Loading…"
    : incoming.length > 0
      ? `${incoming.length} ${incoming.length === 1 ? "person wants" : "people want"} to connect`
      : accepted > 0
        ? `${accepted} ${accepted === 1 ? "connection" : "connections"}`
        : "Grow who you learn from";

  const stats = [
    { key: "connections", value: accepted, label: "Connections", tab: "connections" },
    { key: "requests", value: incoming.length, label: "Requests", tab: "requests" },
    { key: "sent", value: sent, label: "Sent", tab: "requests" },
  ];

  return (
    <section className="hc-card" aria-label="Your network" data-testid="home-network">
      <div className="hc-head">
        <span className="hc-icon">
          <Users size={18} strokeWidth={2.2} />
        </span>
        <span className="hc-head-copy">
          <span className="hc-title">Your network</span>
          <span className="hc-sub">{subtitle}</span>
        </span>
        <Link to="/network" className="hc-link">
          View network
          <ChevronRight size={14} strokeWidth={2.4} />
        </Link>
      </div>

      <div className="hc-stats">
        {stats.map((stat) => (
          <Link key={stat.key} to={`/network?tab=${stat.tab}`} className="hc-stat">
            <b className={stat.key === "requests" && stat.value > 0 ? "is-hot" : undefined}>
              {loading ? "—" : stat.value}
            </b>
            <span>{stat.label}</span>
          </Link>
        ))}
      </div>

      {incoming.length > 0 ? (
        <>
          <h3 className="hc-label">Requests</h3>
          <ul className="hc-list hc-list--tight">
            {incoming.slice(0, 2).map((entry) => (
              <li key={entry.id} className="hc-row">
                <Link to={`/people/${encodeURIComponent(entry.person.id)}`} className="hc-person">
                  <UserAvatar user={entry.person} className="hc-avatar" imgClassName="hc-avatar-img" alt="" />
                  <span className="hc-row-copy">
                    <span className="hc-row-title">{entry.person.name || "Alenio member"}</span>
                    <span className="hc-row-sub">{entry.person.profileTitle || "Wants to connect"}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="hc-btn hc-btn--solid"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(entry.person.id)}
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : suggested.length > 0 ? (
        <>
          <h3 className="hc-label">People you may know</h3>
          <ul className="hc-list hc-list--tight">
            {suggested.slice(0, 3).map((s) => (
              <li key={s.person.id} className="hc-row">
                <Link to={`/people/${encodeURIComponent(s.person.id)}`} className="hc-person">
                  <UserAvatar user={s.person} className="hc-avatar" imgClassName="hc-avatar-img" alt="" />
                  <span className="hc-row-copy">
                    <span className="hc-row-title">{s.person.name || "Alenio member"}</span>
                    <span className="hc-row-sub">{s.reasons?.[0]?.label || s.person.profileTitle || "On Alenio"}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="hc-btn"
                  disabled={connect.isPending && connect.variables === s.person.id}
                  onClick={() => connect.mutate(s.person.id)}
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : !loading && !suggestions.isLoading ? (
        <div className="hc-empty">
          <strong>Your network starts here</strong>
          <span>Find someone you already know on Alenio.</span>
          <Link to="/network?add=1" className="hc-btn">
            <UserPlus size={13} strokeWidth={2.3} />
            Find people
          </Link>
        </div>
      ) : null}
    </section>
  );
}
