import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TempProgramDetailRow, TempProgramSummaryRow } from "../../lib/api";
import {
  fetchTeamTemperatureProgram,
  fetchTeamTemperaturePrograms,
  postTeamTemperatureProgram,
  postTeamTemperatureProgramSeedDemo,
} from "../../lib/api";
import {
  formatTempProgramSaveError,
  tempProgramStatusClass,
  tempProgramStatusLabel,
} from "../../lib/temperature-programs-display";
import { TemperatureProgramDetail } from "./TemperatureProgramDetail";

type Props = {
  teamId: string;
  canManage: boolean;
  initialProgramId?: string;
};

export function TemperatureProgramWorkspace({ teamId, canManage, initialProgramId }: Props) {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<TempProgramSummaryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialProgramId ?? null);
  const [program, setProgram] = useState<TempProgramDetailRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    setLoadingList(true);
    void fetchTeamTemperaturePrograms(teamId)
      .then((data) => {
        setPrograms(data.programs);
        setError(null);
        setSelectedId((prev) => {
          if (prev && data.programs.some((p) => p.id === prev)) return prev;
          if (initialProgramId && data.programs.some((p) => p.id === initialProgramId)) return initialProgramId;
          return data.programs[0]?.id ?? null;
        });
      })
      .catch((err) => {
        setPrograms([]);
        setError(formatTempProgramSaveError(err));
      })
      .finally(() => setLoadingList(false));
  }, [teamId, initialProgramId]);

  const loadDetail = useCallback(
    (programId: string) => {
      setLoadingDetail(true);
      setError(null);
      void fetchTeamTemperatureProgram(teamId, programId)
        .then((data) => setProgram(data.program))
        .catch((err) => {
          setProgram(null);
          setError(formatTempProgramSaveError(err));
        })
        .finally(() => setLoadingDetail(false));
    },
    [teamId],
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setProgram(null);
      return;
    }
    loadDetail(selectedId);
    if (initialProgramId !== selectedId) {
      navigate(`/go/temp-checks/${selectedId}`, { replace: true });
    }
  }, [selectedId, loadDetail, navigate, initialProgramId]);

  const filteredPrograms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        tempProgramStatusLabel(p.status).toLowerCase().includes(q),
    );
  }, [programs, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await postTeamTemperatureProgram(teamId, {
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      loadList();
      setSelectedId(created.id);
      navigate(`/go/temp-checks/${created.id}`);
    } catch (err) {
      setError(formatTempProgramSaveError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleSeedDemo() {
    setSeeding(true);
    setError(null);
    try {
      const result = await postTeamTemperatureProgramSeedDemo(teamId);
      loadList();
      setSelectedId(result.program.id);
      setProgram(result.program);
      navigate(`/go/temp-checks/${result.program.id}`);
    } catch (err) {
      setError(formatTempProgramSaveError(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="temp-prog" data-testid="temp-prog-console">
      <header className="temp-prog-header">
        <div className="temp-prog-header-left">
          <Link to="/go" className="temp-prog-back">
            ← Alenio Go console
          </Link>
          <h1 className="temp-prog-title">Temperature programs</h1>
          <p className="temp-prog-sub enterprise-muted">
            Configure food safety temperature checks for your locations.
          </p>
        </div>
        {canManage ? (
          <div className="temp-prog-header-actions">
            <button type="button" className="temp-prog-btn-secondary" disabled={seeding} onClick={() => void handleSeedDemo()}>
              {seeding ? "Loading…" : "Load demo"}
            </button>
            <button
              type="button"
              className="temp-prog-btn-primary"
              onClick={() => {
                setError(null);
                setShowCreate(true);
              }}
            >
              + New program
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="temp-prog-banner temp-prog-banner--error">{error}</p> : null}

      <div className="temp-prog-body">
        <aside className="temp-prog-sidebar">
          <input
            type="search"
            className="temp-prog-search"
            placeholder="Search programs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loadingList ? (
            <p className="temp-prog-empty">Loading programs…</p>
          ) : filteredPrograms.length === 0 ? (
            <p className="temp-prog-empty">
              {canManage ? "No programs yet. Create one or load the demo program." : "No temperature programs available."}
            </p>
          ) : (
            <ul className="temp-prog-list">
              {filteredPrograms.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`temp-prog-card${row.id === selectedId ? " temp-prog-card--active" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="temp-prog-card-top">
                      <strong>{row.name}</strong>
                      <span className={tempProgramStatusClass(row.status)}>{tempProgramStatusLabel(row.status)}</span>
                    </div>
                    <span className="enterprise-muted temp-prog-card-meta">
                      v{row.versionNumber}
                      {row.description ? ` · ${row.description}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="temp-prog-main">
          {!selectedId ? (
            <div className="temp-prog-empty-panel">
              <h2>Select a program</h2>
              <p className="enterprise-muted">Choose a temperature program from the list, or create a new one.</p>
            </div>
          ) : loadingDetail || !program ? (
            <div className="temp-prog-empty-panel">
              <p className="enterprise-muted">{loadingDetail ? "Loading program…" : "Could not load program."}</p>
            </div>
          ) : (
            <TemperatureProgramDetail
              teamId={teamId}
              canManage={canManage}
              program={program}
              onRefresh={() => {
                loadList();
                loadDetail(program.id);
              }}
              onProgramUpdated={(next) => {
                setProgram(next);
                loadList();
              }}
              onNavigateToProgram={(id) => {
                setSelectedId(id);
                navigate(`/go/temp-checks/${id}`);
              }}
            />
          )}
        </main>
      </div>

      {showCreate ? (
        <div className="temp-prog-modal-backdrop" role="presentation" onClick={() => setShowCreate(false)}>
          <div className="temp-prog-modal" role="dialog" aria-labelledby="temp-prog-create-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="temp-prog-create-title">New temperature program</h2>
            <form className="temp-prog-form" onSubmit={(e) => void handleCreate(e)}>
              <label className="temp-prog-field">
                <span>Program name</span>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Daily Temperature Checks" required />
              </label>
              <label className="temp-prog-field">
                <span>Description</span>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What this program covers…"
                  rows={3}
                />
              </label>
              <div className="temp-prog-form-actions">
                <button type="button" className="temp-prog-btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="temp-prog-btn-primary" disabled={creating}>
                  {creating ? "Creating…" : "Create program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
