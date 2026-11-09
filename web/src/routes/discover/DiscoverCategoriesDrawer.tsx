import { ArrowDown, ArrowUp, Check, LayoutGrid, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createDiscoverCategory,
  fetchDiscoverCategories,
  reorderDiscoverCategories,
  updateDiscoverCategory,
  type DiscoverCategory,
} from "../../lib/discover-api";
import { discoverCategoryColor } from "../../lib/discover-public-api";
import "./discover-categories-drawer.css";

type Draft = { name: string; description: string; isActive: boolean };
const EMPTY: Draft = { name: "", description: "", isActive: true };

/**
 * Slide-in panel for Discover categories: add, rename, hide, reorder.
 * Lives on the Content page so admins never leave the list.
 */
export function DiscoverCategoriesDrawer({
  open,
  onClose,
  onChanged,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after any save so the page can refresh its own category data. */
  onChanged?: () => void;
  /** Published article count per category id, for the row meta. */
  counts?: Record<string, number>;
}) {
  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const load = () => {
    setLoading(true);
    return fetchDiscoverCategories()
      .then((rows) => {
        setCategories(rows);
        setError(null);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not load categories."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    void load();
    setEditing(null);
    setDraft(EMPTY);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const startEdit = (category: DiscoverCategory) => {
    setEditing(category.id);
    setDraft({
      name: category.name,
      description: category.description,
      isActive: category.isActive !== false,
    });
    setError(null);
  };

  const startNew = () => {
    setEditing("new");
    setDraft(EMPTY);
    setError(null);
  };

  const cancel = () => {
    setEditing(null);
    setDraft(EMPTY);
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Give the category a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        await createDiscoverCategory({
          name,
          slug: "",
          description: draft.description.trim(),
          icon: null,
          displayOrder: categories.length,
          isActive: draft.isActive,
        });
      } else if (editing) {
        const existing = categories.find((c) => c.id === editing);
        await updateDiscoverCategory(editing, {
          name,
          slug: existing?.slug ?? "",
          description: draft.description.trim(),
          icon: existing?.icon ?? null,
          displayOrder: existing?.displayOrder ?? 0,
          isActive: draft.isActive,
        });
      }
      cancel();
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save that category.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (category: DiscoverCategory) => {
    setBusy(true);
    setError(null);
    try {
      await updateDiscoverCategory(category.id, {
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        displayOrder: category.displayOrder,
        isActive: category.isActive === false,
      });
      await load();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update that category.");
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = categories.slice();
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    setCategories(next);
    setBusy(true);
    try {
      setCategories(await reorderDiscoverCategories(next.map((c) => c.id)));
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reorder categories.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <div className="dcat-form">
      <label className="dcat-field">
        <span>Name</span>
        <input
          autoFocus
          value={draft.name}
          placeholder="e.g. Leadership"
          onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
        />
      </label>
      <label className="dcat-field">
        <span>Description (optional)</span>
        <textarea
          value={draft.description}
          rows={2}
          placeholder="What kind of articles belong here"
          onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
        />
      </label>
      <label className="dcat-toggle">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => setDraft((d) => ({ ...d, isActive: event.target.checked }))}
        />
        <span>Visible in Discover</span>
      </label>
      <div className="dcat-form-actions">
        <button type="button" className="dcat-btn" onClick={cancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="dcat-btn dcat-btn--primary" onClick={() => void save()} disabled={busy}>
          <Check size={15} strokeWidth={2.4} />
          {editing === "new" ? "Add category" : "Save"}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="dcat-layer" role="presentation" onClick={onClose}>
      <aside
        className="dcat-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dcat-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="dcat-drawer"
      >
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <LayoutGrid size={17} strokeWidth={2.2} />
          </span>
          <div className="dcat-head-copy">
            <h2 id="dcat-title">Categories</h2>
            <p>Topics people browse in Discover. Hidden ones stay out of the app.</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        {error ? <p className="dcat-error">{error}</p> : null}

        <div className="dcat-body">
          {loading && categories.length === 0 ? <p className="dcat-note">Loading…</p> : null}

          <ol className="dcat-list">
            {categories.map((category, index) => {
              const color = discoverCategoryColor(category.slug);
              const hidden = category.isActive === false;
              const count = counts?.[category.id] ?? 0;
              if (editing === category.id) {
                return (
                  <li key={category.id} className="dcat-row dcat-row--editing">
                    {form}
                  </li>
                );
              }
              return (
                <li key={category.id} className={`dcat-row${hidden ? " dcat-row--hidden" : ""}`} data-testid={`dcat-row-${category.slug}`}>
                  <span className="dcat-swatch" style={{ background: color }} aria-hidden />
                  <div className="dcat-row-copy">
                    <span className="dcat-row-name">
                      {category.name}
                      {hidden ? <span className="dcat-badge">Hidden</span> : null}
                    </span>
                    <span className="dcat-row-meta">
                      {count === 1 ? "1 article" : `${count} articles`}
                      {category.description ? ` · ${category.description}` : ""}
                    </span>
                  </div>
                  <div className="dcat-row-actions">
                    <button
                      type="button"
                      className="dcat-icon-btn"
                      aria-label={`Move ${category.name} up`}
                      disabled={busy || index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <ArrowUp size={15} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      className="dcat-icon-btn"
                      aria-label={`Move ${category.name} down`}
                      disabled={busy || index === categories.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <ArrowDown size={15} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      className="dcat-icon-btn"
                      aria-label={`Edit ${category.name}`}
                      disabled={busy}
                      onClick={() => startEdit(category)}
                    >
                      <Pencil size={15} strokeWidth={2.2} />
                    </button>
                    <label className="dcat-switch" title={hidden ? "Show in Discover" : "Hide from Discover"}>
                      <input
                        type="checkbox"
                        checked={!hidden}
                        disabled={busy}
                        aria-label={`${category.name} visible in Discover`}
                        onChange={() => void toggleActive(category)}
                      />
                      <span />
                    </label>
                  </div>
                </li>
              );
            })}
            {editing === "new" ? <li className="dcat-row dcat-row--editing">{form}</li> : null}
          </ol>

          {!loading && categories.length === 0 && editing !== "new" ? (
            <p className="dcat-note">No categories yet. Add the first one below.</p>
          ) : null}
        </div>

        {editing !== "new" ? (
          <footer className="dcat-foot">
            <button type="button" className="dcat-btn dcat-btn--primary dcat-add" onClick={startNew} disabled={busy} data-testid="dcat-add">
              <Plus size={16} strokeWidth={2.4} />
              New category
            </button>
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
