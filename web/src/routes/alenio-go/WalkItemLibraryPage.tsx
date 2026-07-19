import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  TempsButton,
  TempsDataTable,
  TempsEmptyState,
  TempsPageHeader,
  TempsPageShell,
  TempsToolbar,
} from "../../components/temps";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  archiveLibraryItem,
  duplicateLibraryItem,
  fetchLibraryCategories,
  fetchLibraryItemUsage,
  fetchLibraryItems,
  patchLibraryItem,
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

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
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

type UsageState = {
  walks: Array<{ templateId: string; name: string; status: string; pinnedVersions: number[] }>;
};

export function WalkItemLibraryPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<WalkLibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [usageById, setUsageById] = useState<Record<string, UsageState>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    const state = location.state as {
      createdItemId?: string;
      editedItemId?: string;
    } | null;
    if (!state?.createdItemId && !state?.editedItemId) return;
    if (state.createdItemId) showToast("Item created");
    else if (state.editedItemId) showToast("Item updated");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, showToast]);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

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
  }, [canManage, teamId, q, type, category, status, reloadKey]);

  function goEdit(itemId: string) {
    setMenuId(null);
    navigate(`/go/temp-checks/library/${itemId}/edit`);
  }

  async function handleDuplicate(item: WalkLibraryItem) {
    if (!teamId) return;
    setMenuId(null);
    setBusy(true);
    try {
      await duplicateLibraryItem(teamId, item.id);
      setReloadKey((k) => k + 1);
      showToast(`Duplicated “${item.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate item");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(item: WalkLibraryItem) {
    if (!teamId) return;
    setMenuId(null);
    setBusy(true);
    try {
      await patchLibraryItem(teamId, item.id, { status: "ACTIVE" });
      setReloadKey((k) => k + 1);
      showToast(`Restored “${item.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore item");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!teamId || !confirmArchiveId) return;
    setBusy(true);
    try {
      const archived = await archiveLibraryItem(teamId, confirmArchiveId);
      setConfirmArchiveId(null);
      setReloadKey((k) => k + 1);
      showToast(`Deleted “${archived.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete item");
    } finally {
      setBusy(false);
    }
  }

  const confirmArchiveItem = useMemo(
    () => items.find((i) => i.id === confirmArchiveId) ?? null,
    [items, confirmArchiveId],
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
          return [id, { walks: [] } satisfies UsageState] as const;
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

  return (
    <TempsPageShell testId="walk-item-library-page" wide className="temps-page--fill">
      <TempsPageHeader
        title="Item Library"
        description="Create, manage, and reuse inspection items across your walks."
        actions={
          <TempsButton variant="primary" onClick={() => navigate("/go/temp-checks/library/new")}>
            + Create Item
          </TempsButton>
        }
      />

      {toast ? (
        <p className="temps-toast temps-toast--float" role="status">
          {toast}
        </p>
      ) : null}
      {error ? <p className="temps-error">{error}</p> : null}

      <TempsToolbar
        trailing={
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
        }
      >
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

        <TempsButton variant="secondary" disabled>
          <IconFunnel />
          Filters
        </TempsButton>
      </TempsToolbar>

      {loading ? (
        <TempsDataTable label="Library items" minHeight="short">
          <EnterprisePageLoading label="Loading Item Library…" />
        </TempsDataTable>
      ) : (
        <TempsDataTable
          label="Library items"
          footer={
            <>
              <p style={{ margin: 0 }}>
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
            </>
          }
        >
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
                        return (
                          <tr
                            key={item.id}
                            onClick={() => goEdit(item.id)}
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
                            <td onClick={(e) => e.stopPropagation()}>
                              <div
                                className="wsch-menu-wrap"
                                ref={menuId === item.id ? menuRef : undefined}
                              >
                                <button
                                  type="button"
                                  className="wil-row-menu"
                                  aria-label={`Actions for ${item.name}`}
                                  aria-expanded={menuId === item.id}
                                  disabled={busy}
                                  onClick={() => {
                                    setMenuId((prev) => (prev === item.id ? null : item.id));
                                  }}
                                >
                                  <IconMore />
                                </button>
                                {menuId === item.id ? (
                                  <div className="wsch-row-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => goEdit(item.id)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      disabled={busy}
                                      onClick={() => void handleDuplicate(item)}
                                    >
                                      Duplicate
                                    </button>
                                    {item.status === "ARCHIVED" ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={busy}
                                        onClick={() => void handleRestore(item)}
                                      >
                                        Restore
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="wsch-row-menu-danger"
                                        onClick={() => {
                                          setMenuId(null);
                                          setConfirmArchiveId(item.id);
                                        }}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={8}>
                            <TempsEmptyState
                              compact
                              title="No items yet"
                              description="Create your first reusable inspection item."
                              action={
                                <TempsButton
                                  variant="primary"
                                  onClick={() => navigate("/go/temp-checks/library/new")}
                                >
                                  + Create Item
                                </TempsButton>
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
        </TempsDataTable>
      )}

      {confirmArchiveItem ? (
        <div
          className="wsch-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmArchiveId(null)}
        >
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wil-archive-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="wil-archive-title">Delete item?</h2>
            </header>
            <p className="wil-subtitle">
              This removes <strong>{confirmArchiveItem.name}</strong> from the active library so it
              can’t be added to new walks. Completed walk history stays intact, and walks that
              already use it keep their pinned versions. You can restore it later from the Archived
              filter.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmArchiveId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void confirmArchive()}
              >
                {busy ? "Deleting…" : "Delete item"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </TempsPageShell>
  );
}
