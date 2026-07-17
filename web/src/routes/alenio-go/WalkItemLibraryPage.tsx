import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  archiveLibraryItem,
  createLibraryItem,
  duplicateLibraryItem,
  fetchLibraryCategories,
  fetchLibraryItemUsage,
  fetchLibraryItems,
  putLibraryCorrectiveActions,
  type WalkLibraryItem,
} from "../../lib/walks/library-api";
import type { WalkItemType } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function WalkItemLibraryPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const [items, setItems] = useState<WalkLibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<WalkLibraryItem | null>(null);
  const [usage, setUsage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<WalkItemType>("TEMPERATURE");
  const [draftCategory, setDraftCategory] = useState("Food Safety");
  const [caTitle, setCaTitle] = useState("Notify manager");
  const [caType, setCaType] = useState("NOTIFY_MANAGER");

  async function reload() {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, cats] = await Promise.all([
        fetchLibraryItems(teamId, {
          q: q || undefined,
          type: type || undefined,
          category: category || undefined,
          status: "ACTIVE",
        }),
        fetchLibraryCategories(teamId),
      ]);
      setItems(rows);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage || !teamId) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, teamId]);

  if (!canManage || !teamId) {
    return <p className="enterprise-muted">You do not have access to the Item Library.</p>;
  }

  return (
    <div className="wb-shell" style={{ padding: "1rem 1.25rem 2rem" }}>
      <header className="wb-topbar" style={{ marginBottom: "1rem" }}>
        <div>
          <p className="wb-topbar-kicker">Alenio Walks</p>
          <h1>Item Library</h1>
          <p className="wb-topbar-sub">
            Create reusable inspection items, then assemble them into walks.{" "}
            <Link to="/go/walks/builder">Open Walk Builder</Link>
          </p>
        </div>
        <button type="button" className="wb-btn wb-btn--primary" onClick={() => setCreating(true)}>
          + New item
        </button>
      </header>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          className="walk-run-page-manager-input"
          placeholder="Search items…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {WALK_PALETTE_CARDS.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" className="wb-btn wb-btn--ghost" onClick={() => void reload()}>
          Search
        </button>
      </div>

      {error ? <p className="wb-error wb-error--banner">{error}</p> : null}
      {loading ? <EnterprisePageLoading label="Loading library…" /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1rem" }}>
        <ul className="go-kiosk-walks-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="go-kiosk-walks-card"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => {
                  setSelected(item);
                  setUsage("");
                  void fetchLibraryItemUsage(teamId, item.id).then((u) => {
                    setUsage(
                      u.walks.length
                        ? u.walks.map((w) => `${w.name} (${w.status}, v${w.pinnedVersions.join(",")})`).join(" · ")
                        : "Not used in any walks yet",
                    );
                  });
                }}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.type.replace(/_/g, " ")} · {item.category} · v{item.currentVersion}
                </span>
              </button>
            </li>
          ))}
          {!loading && items.length === 0 ? (
            <li className="go-kiosk-walks-empty">No items yet. Create your first reusable check.</li>
          ) : null}
        </ul>

        <aside className="go-kiosk-walks-form-panel">
          {selected ? (
            <>
              <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
              <p className="enterprise-muted">{selected.description || "No description"}</p>
              <p>
                <strong>Type:</strong> {selected.type}
              </p>
              <p>
                <strong>Category:</strong> {selected.category}
              </p>
              <p>
                <strong>Version:</strong> {selected.currentVersion}
              </p>
              <p>
                <strong>Instructions:</strong> {selected.current?.instructions || "—"}
              </p>
              <p>
                <strong>Used in:</strong> {usage || "…"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="wb-btn wb-btn--ghost"
                  onClick={() =>
                    void duplicateLibraryItem(teamId, selected.id).then(() => reload())
                  }
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="wb-btn wb-btn--ghost"
                  onClick={() =>
                    void archiveLibraryItem(teamId, selected.id).then(() => {
                      setSelected(null);
                      return reload();
                    })
                  }
                >
                  Archive
                </button>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem" }}>
                  <p style={{ fontWeight: 700, margin: "0 0 0.5rem" }}>Corrective actions</p>
                  <input
                    className="walk-run-page-manager-input"
                    value={caTitle}
                    onChange={(e) => setCaTitle(e.target.value)}
                    placeholder="Action title"
                  />
                  <select value={caType} onChange={(e) => setCaType(e.target.value)} style={{ marginTop: 8, width: "100%" }}>
                    <option value="NOTIFY_MANAGER">Notify manager</option>
                    <option value="TAKE_PHOTO">Take photo</option>
                    <option value="ADD_NOTE">Add note</option>
                    <option value="RETEST_TEMPERATURE">Retest temperature</option>
                    <option value="BLOCK_COMPLETION">Block completion</option>
                    <option value="MARK_RESOLVED">Mark resolved</option>
                  </select>
                  <button
                    type="button"
                    className="wb-btn wb-btn--primary"
                    style={{ marginTop: 8 }}
                    onClick={() =>
                      void putLibraryCorrectiveActions(teamId, selected.id, [
                        {
                          actionType: caType,
                          title: caTitle || "Corrective action",
                          blocksCompletion: caType === "BLOCK_COMPLETION",
                        },
                      ]).then((item) => {
                        setSelected(item);
                        return reload();
                      })
                    }
                  >
                    Save corrective action (new version)
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="enterprise-muted">Select an item to preview and manage.</p>
          )}
        </aside>
      </div>

      {creating ? (
        <div className="wb-drawer">
          <button type="button" className="wb-drawer-backdrop" onClick={() => setCreating(false)} />
          <div className="wb-drawer-panel">
            <h2>New library item</h2>
            <label className="wb-field">
              <span>Name</span>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </label>
            <label className="wb-field">
              <span>Type</span>
              <select value={draftType} onChange={(e) => setDraftType(e.target.value as WalkItemType)}>
                {WALK_PALETTE_CARDS.map((c) => (
                  <option key={c.type} value={c.type}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wb-field">
              <span>Category</span>
              <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="wb-drawer-actions-right">
              <button type="button" className="wb-btn wb-btn--ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="wb-btn wb-btn--primary"
                onClick={() =>
                  void createLibraryItem(teamId, {
                    name: draftName || "New item",
                    type: draftType,
                    category: draftCategory,
                  }).then(() => {
                    setCreating(false);
                    setDraftName("");
                    return reload();
                  })
                }
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
