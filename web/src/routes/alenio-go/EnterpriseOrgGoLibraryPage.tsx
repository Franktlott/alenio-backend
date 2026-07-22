import { useEffect, useState, type FormEvent } from "react";
import { createOrgGoLibraryItem, fetchOrgGoLibrary } from "../../lib/api";
import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

type LibItem = {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  description?: string | null;
};

export function EnterpriseOrgGoLibraryPage() {
  const { organizationId } = useEnterpriseOrgGo();
  const [items, setItems] = useState<LibItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const rows = (await fetchOrgGoLibrary(organizationId)) as LibItem[];
    setItems(rows);
  };

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed to load library"));
  }, [organizationId]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await createOrgGoLibraryItem(organizationId, {
        name: name.trim(),
        type: "TEMPERATURE",
        category: "Refrigeration",
        config: { minF: 33, maxF: 41, unit: "F" },
      });
      setName("");
      setShowCreate(false);
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not create item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-library">
      <header className="enterprise-org-go-page-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Corporate standards</p>
          <h1>Item Library</h1>
          <p className="enterprise-muted">
            Organization-owned temperature items and corrective standards. Workspaces configure schedules against these
            items — they do not rebuild the library.
          </p>
        </div>
        <button type="button" className="auth-submit" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "New temperature item"}
        </button>
      </header>

      {err ? <p className="auth-error">{err}</p> : null}

      {showCreate ? (
        <form className="enterprise-card" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={onCreate}>
          <label className="auth-label" htmlFor="org-lib-name">
            Item name
          </label>
          <input
            id="org-lib-name"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Walk-in cooler"
            required
          />
          <button type="submit" className="auth-submit" disabled={busy} style={{ marginTop: "0.75rem" }}>
            {busy ? "Creating…" : "Create"}
          </button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className="enterprise-card" style={{ padding: "1.25rem" }}>
          <p className="enterprise-muted" style={{ margin: 0 }}>
            No organization library items yet. Create temperature standards here, then assign the Temps module to
            workspaces.
          </p>
        </div>
      ) : (
        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.type}</td>
                  <td>{item.category}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
