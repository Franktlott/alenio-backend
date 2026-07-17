import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  fetchLibraryCategories,
  fetchLibraryItemUsage,
  fetchLibraryItems,
  type WalkLibraryItem,
} from "../../lib/walks/library-api";
import type { WalkItemType } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

const PAGE_SIZE = 8;

function typeLabel(type: string) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type.replace(/_/g, " ");
}

function shortTypeLabel(type: string) {
  if (type === "YES_NO") return "Yes / No";
  if (type === "TEMPERATURE") return "Temperature";
  if (type === "VISUAL_CHECK") return "Visual Check";
  if (type === "MULTIPLE_CHOICE") return "Multiple Choice";
  if (type === "TEXT") return "Note / Text";
  if (type === "PHOTO") return "Photo";
  if (type === "QUANTITY") return "Quantity";
  if (type === "INSTRUCTION") return "Instruction";
  return typeLabel(type);
}

function typeTone(type: string): string {
  switch (type) {
    case "TEMPERATURE":
      return "temp";
    case "YES_NO":
      return "yesno";
    case "VISUAL_CHECK":
      return "visual";
    case "PHOTO":
      return "photo";
    case "MULTIPLE_CHOICE":
      return "choice";
    case "QUANTITY":
      return "quantity";
    case "TEXT":
    case "INSTRUCTION":
      return "text";
    default:
      return "temp";
  }
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function passingCriteriaParts(item: WalkLibraryItem): { before: string; highlight: string | null } | null {
  const config = item.current?.config ?? {};
  if (item.type === "TEMPERATURE") {
    const unit = config.unit === "C" ? "°C" : "°F";
    const comparison = String(config.comparisonType ?? "ABOVE");
    const min = config.minimumTemperature;
    const max = config.maximumTemperature;
    if (comparison === "BELOW" && max != null) {
      return { before: "Temperature at or below ", highlight: `${max}${unit}` };
    }
    if (comparison === "BETWEEN" && min != null && max != null) {
      return { before: "Temperature between ", highlight: `${min}${unit} and ${max}${unit}` };
    }
    if (min != null) return { before: "Temperature at or above ", highlight: `${min}${unit}` };
  }
  if (item.type === "YES_NO") {
    const answer = config.passingAnswer === "NO" ? "No" : "Yes";
    return { before: "Passing answer: ", highlight: answer };
  }
  const instructions = item.current?.instructions?.trim();
  if (instructions) return { before: instructions, highlight: null };
  return null;
}

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function IconEye({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconInfo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconFunnel({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" />
    </svg>
  );
}

function IconList({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconGrid({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconUsers({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconMore({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function IconPencil({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function caIcon(actionType: string): ReactNode {
  if (actionType.includes("PHOTO")) return <WalkTypeIcon type="PHOTO" size={14} />;
  if (actionType.includes("TEMP")) return <WalkTypeIcon type="TEMPERATURE" size={14} />;
  if (actionType.includes("NOTIFY")) return <IconUsers size={14} />;
  return <IconInfo size={14} />;
}

type UsageState = {
  walks: Array<{ templateId: string; name: string; status: string; pinnedVersions: number[] }>;
};

export function WalkItemLibraryPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const navigate = useNavigate();
  const [items, setItems] = useState<WalkLibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [usageById, setUsageById] = useState<Record<string, UsageState>>({});
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      fetchLibraryItems(teamId, {
        q: q.trim() || undefined,
        type: type || undefined,
        category: category || undefined,
        status: status || undefined,
      }),
      fetchLibraryCategories(teamId),
    ])
      .then(([rows, cats]) => {
        if (cancelled) return;
        setItems(rows);
        setCategories(cats);
        setPage(1);
        setSelectedId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev;
          return rows[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Item Library");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, q, type, category, status]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!teamId || items.length === 0) return;
    const pageStart =
      (Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE))) - 1) * PAGE_SIZE;
    const ids = items.slice(pageStart, pageStart + PAGE_SIZE).map((i) => i.id);
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        try {
          const usage = await fetchLibraryItemUsage(teamId, id);
          return [id, usage] as const;
        } catch {
          return [id, { walks: [] }] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setUsageById((prev) => {
        const next = { ...prev };
        for (const [id, usage] of pairs) next[id] = usage;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, items, page]);

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = items.slice(start, start + PAGE_SIZE);
  const selectedUsage = selected ? usageById[selected.id] : undefined;
  const criteria = selected ? passingCriteriaParts(selected) : null;
  const corrective = selected?.current?.correctiveActions ?? [];

  return (
    <div className="wil-shell" data-testid="walk-item-library-page">
      <div className="wil-page">
        <header className="wil-header">
          <div>
            <h1 className="wil-title">
              Item Library
              <span className="wil-title-info" title="Reusable inspection items for walks">
                <IconInfo />
              </span>
            </h1>
            <p className="wil-subtitle">Create, manage, and reuse inspection items across your walks.</p>
          </div>
          <div className="wil-header-actions">
          <button
            type="button"
            className="wil-btn wil-btn--primary"
            onClick={() => navigate("/go/temp-checks/library/new")}
          >
            <span>+ Create Item</span>
            <IconChevronDown />
          </button>
            <button
              type="button"
              className="wil-btn wil-btn--secondary"
              onClick={() => showToast("Associate preview — next")}
            >
              <IconEye />
              Preview as Associate
            </button>
          </div>
        </header>

        {toast ? <p className="wil-toast">{toast}</p> : null}
        {error ? <p className="wil-error">{error}</p> : null}

        <div className="wil-toolbar">
          <label className="wil-search">
            <span className="wil-search-icon">
              <IconSearch />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items..."
              aria-label="Search items"
            />
          </label>

          <label className="wil-select-wrap">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <IconChevronDown />
          </label>

          <label className="wil-select-wrap">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">All Types</option>
              {WALK_PALETTE_CARDS.map((c) => (
                <option key={c.type} value={c.type}>
                  {shortTypeLabel(c.type)}
                </option>
              ))}
            </select>
            <IconChevronDown />
          </label>

          <label className="wil-select-wrap">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
              <option value="">All statuses</option>
            </select>
            <IconChevronDown />
          </label>

          <button type="button" className="wil-btn wil-btn--secondary wil-btn--filters" disabled>
            <IconFunnel />
            Filters
          </button>

          <div className="wil-view">
            <span>View</span>
            <div className="wil-view-toggle" role="group" aria-label="View">
              <button type="button" className="wil-view-btn is-active" aria-pressed="true" title="List view">
                <IconList />
              </button>
              <button
                type="button"
                className="wil-view-btn"
                aria-pressed="false"
                title="Grid view"
                onClick={() => showToast("Grid view — next")}
              >
                <IconGrid />
              </button>
            </div>
          </div>
        </div>

        <div className="wil-body">
          <section className="wil-table-card" aria-label="Library items">
            {loading ? (
              <div className="wil-loading">
                <EnterprisePageLoading label="Loading Item Library…" />
              </div>
            ) : (
              <>
                <div className="wil-table-wrap">
                  <table className="wil-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Used In</th>
                        <th>Updated</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((item) => {
                        const usageCount = usageById[item.id]?.walks.length;
                        const active = item.id === selectedId;
                        return (
                          <tr
                            key={item.id}
                            className={active ? "is-selected" : undefined}
                            onClick={() => setSelectedId(item.id)}
                          >
                            <td>
                              <div className="wil-item-cell">
                                <span className={`wil-item-icon wil-item-icon--${typeTone(String(item.type))}`}>
                                  <WalkTypeIcon type={item.type as WalkItemType} size={18} />
                                </span>
                                <span className="wil-item-copy">
                                  <strong>{item.name}</strong>
                                  <em>
                                    {item.description ||
                                      item.current?.description ||
                                      "No description"}
                                  </em>
                                </span>
                              </div>
                            </td>
                            <td>{shortTypeLabel(String(item.type))}</td>
                            <td>{item.category}</td>
                            <td>
                              <span className="wil-version">
                                {Number(item.currentVersion).toFixed(1)}
                                {item.currentVersion > 1 ? (
                                  <span className="wil-badge wil-badge--latest">Latest</span>
                                ) : null}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  item.status === "ACTIVE"
                                    ? "wil-status wil-status--active"
                                    : "wil-status"
                                }
                              >
                                {item.status === "ACTIVE" ? "Active" : item.status}
                              </span>
                            </td>
                            <td>
                              <span className="wil-used">
                                <IconUsers />
                                {usageCount == null
                                  ? "…"
                                  : `${usageCount} walk${usageCount === 1 ? "" : "s"}`}
                              </span>
                            </td>
                            <td className="wil-updated">{relativeTime(item.updatedAt)}</td>
                            <td>
                              <button
                                type="button"
                                className="wil-row-menu"
                                aria-label={`Actions for ${item.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showToast("Row actions — next");
                                }}
                              >
                                <IconMore />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="wil-empty">
                            No items yet. Create your first reusable inspection item.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <footer className="wil-table-footer">
                  <p>
                    Showing {total === 0 ? 0 : start + 1} to {Math.min(start + PAGE_SIZE, total)} of{" "}
                    {total} items
                  </p>
                  <div className="wil-pagination">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1)
                      .slice(0, 5)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={n === safePage ? "is-active" : undefined}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </button>
                      ))}
                    <button
                      type="button"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>

          <aside className="wil-preview" aria-label="Item preview">
            <div className="wil-preview-head">
              <h2>Item Preview</h2>
              {selected ? (
                <span className="wil-badge wil-badge--version">
                  Version {Number(selected.currentVersion).toFixed(1)}
                </span>
              ) : null}
            </div>

            {!selected ? (
              <p className="wil-muted wil-preview-empty">Select an item to preview.</p>
            ) : (
              <>
                <div className="wil-preview-hero">
                  <span
                    className={`wil-item-icon wil-item-icon--lg wil-item-icon--${typeTone(String(selected.type))}`}
                  >
                    <WalkTypeIcon type={selected.type as WalkItemType} size={26} />
                  </span>
                  <div>
                    <h3>{selected.name}</h3>
                    <span className="wil-chip">{shortTypeLabel(String(selected.type))}</span>
                  </div>
                </div>

                <p className="wil-preview-desc">
                  {selected.description ||
                    selected.current?.description ||
                    "No description for this item yet."}
                </p>

                {criteria ? (
                  <section className="wil-preview-block">
                    <h4>Passing Criteria</h4>
                    <p>
                      {criteria.before}
                      {criteria.highlight ? (
                        <strong className="wil-criteria-hi">{criteria.highlight}</strong>
                      ) : null}
                    </p>
                  </section>
                ) : null}

                <section className="wil-preview-block">
                  <h4>Corrective Actions</h4>
                  {corrective.length === 0 ? (
                    <p className="wil-muted">None configured yet.</p>
                  ) : (
                    <ul className="wil-ca-list">
                      {corrective.slice(0, 3).map((action) => (
                        <li key={action.id}>
                          <span className="wil-ca-icon">{caIcon(action.actionType)}</span>
                          <span>{action.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {corrective.length > 3 ? (
                    <button type="button" className="wil-more-link">
                      +{corrective.length - 3} more actions
                    </button>
                  ) : null}
                </section>

                <section className="wil-preview-block">
                  <h4>Used In</h4>
                  {!selectedUsage ? (
                    <p className="wil-muted">Loading…</p>
                  ) : selectedUsage.walks.length === 0 ? (
                    <p className="wil-muted">Not used in any walks yet.</p>
                  ) : (
                    <ul className="wil-used-list">
                      {selectedUsage.walks.map((w) => (
                        <li key={w.templateId}>
                          <span>{w.name}</span>
                          <IconChevronRight />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="wil-preview-actions">
                  <button
                    type="button"
                    className="wil-btn wil-btn--edit"
                    onClick={() => showToast("Edit Item — next")}
                  >
                    <IconPencil />
                    Edit Item
                  </button>
                  <button
                    type="button"
                    className="wil-btn wil-btn--secondary wil-btn--square"
                    aria-label="More actions"
                    onClick={() => showToast("More actions — next")}
                  >
                    <IconMore />
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
