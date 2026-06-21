import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicChecklistByToken, submitPublicChecklist } from "../lib/api";

export function LocationChecklistKioskPage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [items, setItems] = useState<{ id: string; title: string; sortOrder: number }[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitterName, setSubmitterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = async (tok: string) => {
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setChecked({});
    setSubmitterName("");
    try {
      const data = await fetchPublicChecklistByToken(tok);
      setLocationName(data.location.name);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checklist not found.");
      setLocationName("");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError("Invalid checklist link.");
      setLoading(false);
      return;
    }
    void load(token);
  }, [token]);

  const allChecked = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((i) => checked[i.id]);
  }, [items, checked]);

  const onSubmit = async () => {
    if (!token || !allChecked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPublicChecklist(token, {
        submitterName: submitterName.trim() || undefined,
        responses: items.map((i) => ({ itemId: i.id, checked: !!checked[i.id] })),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit checklist.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="checklist-kiosk-page" data-testid="checklist-kiosk-page">
      <div className="checklist-kiosk-shell">
        <header className="checklist-kiosk-head">
          <p className="checklist-kiosk-brand">Alenio</p>
          <h1 className="checklist-kiosk-title">{loading ? "Loading…" : locationName || "Location checklist"}</h1>
          {!loading && !error && !submitted ? (
            <p className="checklist-kiosk-sub">Complete every item, then submit.</p>
          ) : null}
        </header>

        {loading ? (
          <p className="checklist-kiosk-muted">Loading checklist…</p>
        ) : error && !submitted ? (
          <p className="checklist-kiosk-error" role="alert">
            {error}
          </p>
        ) : submitted ? (
          <div className="checklist-kiosk-success">
            <p className="checklist-kiosk-success-title">Checklist submitted</p>
            <p className="checklist-kiosk-muted">Thank you. The next person can start a new checklist.</p>
            <button type="button" className="checklist-kiosk-primary" onClick={() => void load(token)}>
              Start next checklist
            </button>
          </div>
        ) : (
          <>
            <ul className="checklist-kiosk-list">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="checklist-kiosk-item">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                    />
                    <span>{item.title}</span>
                  </label>
                </li>
              ))}
            </ul>

            <label className="checklist-kiosk-name-label" htmlFor="checklist-kiosk-name">
              Your name <span className="checklist-kiosk-optional">(optional)</span>
            </label>
            <input
              id="checklist-kiosk-name"
              className="checklist-kiosk-name-input"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="First name"
              autoComplete="name"
            />

            {error ? (
              <p className="checklist-kiosk-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="checklist-kiosk-primary"
              disabled={!allChecked || submitting}
              onClick={() => void onSubmit()}
            >
              {submitting ? "Submitting…" : "Submit checklist"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
