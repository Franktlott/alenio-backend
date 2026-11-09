import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Search, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { acceptConnection, requestConnection } from "../../lib/api";
import { searchPeople, type PersonSearchResult } from "../../lib/network-api";
import { queryKeys } from "../../lib/query-keys";
import { PersonRow } from "./PersonRow";
import "../../routes/discover/discover-categories-drawer.css";

/** Find people by name, @handle or email and send them a request. */
export function AddConnectionDrawer({
  open,
  onClose,
  onOpenPerson,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPerson: (userId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setQuery("");
    setSent({});
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useQuery({
    queryKey: ["network", "search", query],
    queryFn: () => searchPeople(query),
    enabled: open && query.length >= 2,
    staleTime: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkConnections });
    void queryClient.invalidateQueries({ queryKey: queryKeys.networkSuggestions });
  };
  const connect = useMutation({
    mutationFn: (userId: string) => requestConnection(userId),
    onSuccess: (res, userId) => {
      setSent((prev) => ({ ...prev, [userId]: res.status }));
      invalidate();
    },
  });
  const accept = useMutation({
    mutationFn: (userId: string) => acceptConnection(userId),
    onSuccess: (_res, userId) => {
      setSent((prev) => ({ ...prev, [userId]: "connected" }));
      invalidate();
    },
  });

  if (!open) return null;

  const statusFor = (p: PersonSearchResult) => sent[p.id] ?? p.connectionStatus ?? "none";

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="dcat-drawer nw-drawer" role="dialog" aria-modal="true" aria-label="Add connection" data-testid="nw-add-drawer">
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <UserPlus size={18} strokeWidth={2.2} />
          </span>
          <div className="dcat-head-copy">
            <h2>Add connection</h2>
            <p>Search by name, @username or email.</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="nw-drawer-search">
          <Search size={15} strokeWidth={2.2} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Who are you looking for?"
            aria-label="Search people"
            autoFocus
            data-testid="nw-search-input"
          />
        </div>

        {connect.isError ? (
          <p className="dcat-error">{connect.error instanceof Error ? connect.error.message : "Couldn't send that request."}</p>
        ) : null}

        <div className="dcat-body nw-drawer-body">
          {query.length < 2 ? (
            <p className="nw-muted">Type at least two characters to search.</p>
          ) : results.isLoading ? (
            <p className="nw-muted">Searching…</p>
          ) : results.isError ? (
            <p className="nw-error">Search failed. Try again.</p>
          ) : results.data && results.data.length === 0 ? (
            <p className="nw-muted">No one matches "{query}".</p>
          ) : (
            <ul className="nw-list">
              {results.data?.map((p) => {
                const status = statusFor(p);
                return (
                  <li key={p.id}>
                    <PersonRow
                      person={p}
                      subtitle={p.sharedWorkspaceName ? `Shares ${p.sharedWorkspaceName}` : p.username ? `@${p.username}` : undefined}
                      onOpen={() => onOpenPerson(p.id)}
                      actions={
                        status === "connected" ? (
                          <span className="nw-chip nw-chip--ok">
                            <Check size={13} strokeWidth={2.4} /> Connected
                          </span>
                        ) : status === "pending_outgoing" ? (
                          <span className="nw-chip">
                            <Clock size={13} strokeWidth={2.2} /> Pending
                          </span>
                        ) : status === "pending_incoming" ? (
                          <button type="button" className="nw-btn nw-btn--primary" disabled={accept.isPending} onClick={() => accept.mutate(p.id)}>
                            Accept
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="nw-btn nw-btn--primary"
                            disabled={connect.isPending}
                            onClick={() => connect.mutate(p.id)}
                          >
                            Connect
                          </button>
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
