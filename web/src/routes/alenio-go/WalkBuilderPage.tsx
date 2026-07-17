import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { WalkItemEditDrawer } from "../../components/walk-builder/WalkItemEditDrawer";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import {
  createWalkItem,
  createWalkTemplate,
  deleteWalkItem,
  fetchWalkTemplate,
  fetchWalkTemplates,
  patchWalkItem,
  patchWalkTemplate,
  reorderWalkItems,
} from "../../lib/walks/api";
import { defaultTitleForType, WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  addLibraryItemToWalk,
  createDraftFromPublished,
  fetchLibraryItems,
  fetchOutdatedWalkItems,
  publishWalk,
  type WalkLibraryItem,
} from "../../lib/walks/library-api";
import { flattenWalkItems, isPhase2ItemType, type WalkItem, type WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

const BUILDER_STEPS = [
  { id: "build", label: "Build Your Walk", hint: "Add items & organize" },
  { id: "rules", label: "Set Rules", hint: "Define pass/fail criteria" },
  { id: "devices", label: "Devices & Methods", hint: "How items are recorded" },
  { id: "corrective", label: "Corrective Actions", hint: "What happens if it fails" },
  { id: "instructions", label: "Instructions", hint: "Guidance for associates" },
  { id: "review", label: "Review & Publish", hint: "Preview and publish" },
] as const;

type StepId = (typeof BUILDER_STEPS)[number]["id"];

function typeLabel(type: string) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

function previewStatusForItem(item: WalkItem, index: number): {
  kind: "fail" | "pass" | "needs" | "pending";
  value?: string;
  detail?: string;
} {
  if (item.type === "TEMPERATURE") {
    const min = Number(item.config.minimumTemperature);
    const max = Number(item.config.maximumTemperature);
    const unit = String(item.config.unit ?? "F");
    if (index === 0) {
      return {
        kind: "fail",
        value: `162.4°${unit}`,
        detail:
          item.config.comparisonType === "ABOVE" && Number.isFinite(min)
            ? `Target: ${min}°${unit} or above`
            : "Target range not met",
      };
    }
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { kind: "pass", value: `38.2°${unit}`, detail: `Target: ${min}–${max}°${unit}` };
    }
    return { kind: "pass", value: `170°${unit}`, detail: "Within target" };
  }
  if (item.type === "PHOTO" || (item.type === "VISUAL_CHECK" && item.config.requirePhotoOnFailure)) {
    return { kind: "needs", detail: "Needs Photo" };
  }
  if (item.type === "YES_NO") {
    return { kind: "pass", value: String(item.config.passingAnswer ?? "YES") === "YES" ? "Yes" : "No" };
  }
  return { kind: "pending", detail: "Not started" };
}

export function WalkBuilderPage() {
  const { templateId: routeTemplateId } = useParams();
  const navigate = useNavigate();
  const { canManage, teamId, teamName, userName } = useAlenioGoShell();

  const [template, setTemplate] = useState<WalkTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("build");
  const [paletteTab, setPaletteTab] = useState<"all" | "library">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WalkItem | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [libraryItems, setLibraryItems] = useState<WalkLibraryItem[]>([]);
  const [outdated, setOutdated] = useState<
    Array<{ placementId: string; title: string; pinnedVersion: number; currentVersion: number }>
  >([]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const loadTemplate = useCallback(
    async (id: string) => {
      if (!teamId) return;
      const [data, outdatedRows] = await Promise.all([
        fetchWalkTemplate(teamId, id),
        fetchOutdatedWalkItems(teamId, id).catch(() => []),
      ]);
      setTemplate(data);
      setNameDraft(data.name);
      setOutdated(outdatedRows);
      const items = flattenWalkItems(data);
      setSelectedItemId((prev) => prev ?? items[0]?.id ?? null);
    },
    [teamId],
  );

  useEffect(() => {
    if (!teamId || paletteTab !== "library") return;
    void fetchLibraryItems(teamId, { status: "ACTIVE" })
      .then(setLibraryItems)
      .catch(() => setLibraryItems([]));
  }, [teamId, paletteTab]);

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        if (routeTemplateId) {
          await loadTemplate(routeTemplateId);
          return;
        }
        const list = await fetchWalkTemplates(teamId);
        if (cancelled) return;
        const draft = list.find((t) => t.status === "DRAFT") ?? list[0];
        if (draft) {
          navigate(`/go/walks/builder/${draft.id}`, { replace: true });
          return;
        }
        const created = await createWalkTemplate(teamId, {
          name: "Cooler Walk",
          description: "Operational walk for food safety and product condition.",
          workplace: teamName,
          estimatedDurationMinutes: 15,
        });
        if (cancelled) return;
        navigate(`/go/walks/builder/${created.id}`, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open Walk Builder.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, routeTemplateId, teamName, navigate, loadTemplate]);

  const items = useMemo(() => (template ? flattenWalkItems(template) : []), [template]);
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? items[0] ?? null;
  const defaultSectionId = template?.sections[0]?.id ?? null;

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  if (loading || !template) {
    return (
      <div className="wb-shell wb-shell--loading">
        {error ? <p className="wb-error">{error}</p> : <EnterprisePageLoading label="Opening Walk Builder…" />}
      </div>
    );
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!template) return;
    await loadTemplate(template.id);
  }

  async function saveDraft() {
    await withBusy(async () => {
      const updated = await patchWalkTemplate(teamId!, template!.id, {
        name: nameDraft.trim() || template!.name,
        description: template!.description,
        workplace: template!.workplace || teamName,
        status: "DRAFT",
      });
      setTemplate(updated);
      showToast("Draft saved");
    });
  }

  async function publishWalkAction() {
    await withBusy(async () => {
      if (nameDraft.trim() && nameDraft.trim() !== template!.name) {
        await patchWalkTemplate(teamId!, template!.id, { name: nameDraft.trim() });
      }
      const result = await publishWalk(teamId!, template!.id);
      setTemplate(result.template as WalkTemplate);
      showToast(`Walk published (v${result.publishedVersion.version})`);
    });
  }

  async function addItem(type: (typeof WALK_PALETTE_CARDS)[number]["type"], phase2: boolean) {
    if (!phase2) {
      showToast("Available in a later phase");
      return;
    }
    await withBusy(async () => {
      const created = await createWalkItem(teamId!, template!.id, {
        type,
        title: defaultTitleForType(type),
        sectionId: defaultSectionId,
        required: true,
      });
      await refresh();
      setSelectedItemId(created.id);
      setEditingItem(created);
    });
  }

  async function addFromLibrary(libraryItemId: string) {
    await withBusy(async () => {
      await addLibraryItemToWalk(teamId!, template!.id, {
        libraryItemId,
        sectionId: defaultSectionId,
      });
      await refresh();
      showToast("Item added from library");
    });
  }

  async function updateOutdatedPlacement(placementId: string) {
    await withBusy(async () => {
      await patchWalkItem(teamId!, template!.id, placementId, { pinToCurrentVersion: true });
      await refresh();
      showToast("Pinned to latest library version");
    });
  }

  async function onDropReorder(targetId: string) {
    if (!dragItemId || dragItemId === targetId || !template) return;
    const ordered = items.map((i) => i.id);
    const from = ordered.indexOf(dragItemId);
    const to = ordered.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, dragItemId);
    setDragItemId(null);
    await withBusy(async () => {
      // Reorder within first section when possible; otherwise global order update per id list.
      const sectionId = items.find((i) => i.id === dragItemId)?.sectionId ?? defaultSectionId;
      const sectionOrdered = ordered.filter((id) => items.find((i) => i.id === id)?.sectionId === sectionId);
      const updated = await reorderWalkItems(teamId!, template.id, sectionOrdered, sectionId);
      setTemplate(updated);
    });
  }

  const previewItems = items.slice(0, 3);
  const progressPct = items.length ? Math.round((Math.min(3, items.length) / items.length) * 100) : 0;

  return (
    <div className="wb-shell" data-testid="walk-builder-page">
      <header className="wb-topbar">
        <div className="wb-topbar-brand">
          <Link to="/go/walks" className="wb-topbar-back" aria-label="Back to Walks">
            ←
          </Link>
          <div>
            <p className="wb-topbar-kicker">Alenio Walk Builder</p>
            <h1>Create Walk / Checklist</h1>
            <p className="wb-topbar-sub">Design the associate experience for {teamName}.</p>
          </div>
        </div>
        <div className="wb-topbar-actions">
          <button
            type="button"
            className="wb-btn wb-btn--ghost"
            onClick={() => showToast("AI Assistant coming soon")}
          >
            ✦ AI Assistant
          </button>
          <button type="button" className="wb-btn wb-btn--ghost" disabled={busy} onClick={() => void saveDraft()}>
            Save Draft
          </button>
          {template.status === "PUBLISHED" ? (
            <button
              type="button"
              className="wb-btn wb-btn--ghost"
              disabled={busy}
              onClick={() =>
                void withBusy(async () => {
                  const draft = await createDraftFromPublished(teamId!, template!.id);
                  navigate(`/go/walks/builder/${draft.id}`);
                  showToast("Draft created from published walk");
                })
              }
            >
              Create draft
            </button>
          ) : null}
          <button
            type="button"
            className="wb-btn wb-btn--primary"
            disabled={busy}
            onClick={() => void publishWalkAction()}
          >
            Publish Walk
          </button>
        </div>
      </header>

      {error ? <p className="wb-error wb-error--banner">{error}</p> : null}
      {toast ? <p className="wb-toast">{toast}</p> : null}
      {outdated.length > 0 ? (
        <div className="wb-error wb-error--banner" style={{ background: "#fff7ed", color: "#9a3412" }}>
          <strong>{outdated.length} library item(s)</strong> have newer versions.{" "}
          {outdated.slice(0, 3).map((o) => (
            <span key={o.placementId} style={{ display: "inline-flex", gap: 8, marginLeft: 8 }}>
              {o.title} (v{o.pinnedVersion} → v{o.currentVersion})
              <button
                type="button"
                className="wb-btn wb-btn--ghost"
                style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                onClick={() => void updateOutdatedPlacement(o.placementId)}
              >
                Update
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="wb-body">
        <aside className="wb-rail" aria-label="Builder steps">
          <ol className="wb-rail-steps">
            {BUILDER_STEPS.map((s, index) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`wb-rail-step${step === s.id ? " wb-rail-step--active" : ""}`}
                  onClick={() => setStep(s.id)}
                >
                  <span className="wb-rail-num">{index + 1}</span>
                  <span>
                    <strong>{s.label}</strong>
                    <em>{s.hint}</em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="wb-rail-help">
            <p>Need help?</p>
            <button type="button" className="wb-btn wb-btn--seneca" onClick={() => showToast("Ask Seneca coming soon")}>
              Ask Seneca
            </button>
          </div>
          <div className="wb-rail-user">
            <div className="wb-rail-avatar" aria-hidden>
              {(userName ?? "A").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{userName ?? "Leader"}</strong>
              <span>{teamName}</span>
            </div>
          </div>
        </aside>

        <main className="wb-main">
          {step !== "build" ? (
            <section className="wb-placeholder-panel">
              <h2>{BUILDER_STEPS.find((s) => s.id === step)?.label}</h2>
              <p>
                This step deepens in a later phase. Use the summary cards on the right to review defaults, or return to
                Build Your Walk.
              </p>
              <button type="button" className="wb-btn wb-btn--primary" onClick={() => setStep("build")}>
                Back to Build Your Walk
              </button>
            </section>
          ) : (
            <>
              <div className="wb-main-head">
                <div>
                  <h2>1. Build Your Walk</h2>
                  <input
                    className="wb-name-input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => {
                      if (nameDraft.trim() && nameDraft.trim() !== template.name) {
                        void withBusy(async () => {
                          const updated = await patchWalkTemplate(teamId, template.id, {
                            name: nameDraft.trim(),
                          });
                          setTemplate(updated);
                        });
                      }
                    }}
                    aria-label="Walk name"
                  />
                </div>
                <div className="wb-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={paletteTab === "all"}
                    className={paletteTab === "all" ? "is-active" : undefined}
                    onClick={() => setPaletteTab("all")}
                  >
                    All Items
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={paletteTab === "library"}
                    className={paletteTab === "library" ? "is-active" : undefined}
                    onClick={() => setPaletteTab("library")}
                  >
                    My Item Library
                  </button>
                </div>
              </div>

              <div className="wb-build-grid">
                <section className="wb-palette" aria-label="Add item">
                  <h3>Add Item</h3>
                  {paletteTab === "library" ? (
                    <div className="wb-palette-list">
                      {libraryItems.length === 0 ? (
                        <p className="wb-muted">
                          No library items yet.{" "}
                          <Link to="/go/walks/library">Open Item Library</Link> or create from All Items.
                        </p>
                      ) : (
                        libraryItems.map((lib) => (
                          <button
                            key={lib.id}
                            type="button"
                            className="wb-palette-card"
                            disabled={busy}
                            onClick={() => void addFromLibrary(lib.id)}
                          >
                            <span className="wb-palette-icon">
                              <WalkTypeIcon type={lib.type as WalkItem["type"]} />
                            </span>
                            <span>
                              <strong>{lib.name}</strong>
                              <em>
                                {lib.category} · v{lib.currentVersion}
                              </em>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="wb-palette-list">
                      {WALK_PALETTE_CARDS.map((card) => (
                        <button
                          key={card.type}
                          type="button"
                          className={`wb-palette-card${card.phase2 ? "" : " wb-palette-card--soon"}`}
                          disabled={busy}
                          onClick={() => void addItem(card.type, card.phase2)}
                          title={card.phase2 ? undefined : "Available in a later phase"}
                        >
                          <span className="wb-palette-icon">
                            <WalkTypeIcon icon={card.icon} />
                          </span>
                          <span>
                            <strong>{card.label}</strong>
                            <em>{card.description}</em>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Link to="/go/walks/library" className="wb-linkish">
                    Manage Item Library →
                  </Link>
                </section>

                <section className="wb-items" aria-label="Your walk items">
                  <h3>Your Walk Items</h3>
                  <div className="wb-item-list">
                    {items.length === 0 ? (
                      <p className="wb-muted">Add items from the left to start building this walk.</p>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className={`wb-item-row${selectedItemId === item.id ? " wb-item-row--selected" : ""}${
                            !isPhase2ItemType(item.type) ? " wb-item-row--soon" : ""
                          }`}
                          draggable
                          onDragStart={() => setDragItemId(item.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => void onDropReorder(item.id)}
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <span className="wb-item-handle" aria-hidden>
                            ⋮⋮
                          </span>
                          <span className="wb-item-icon">
                            <WalkTypeIcon type={item.type} />
                          </span>
                          <span className="wb-item-copy">
                            <strong>{item.title}</strong>
                            <em>{typeLabel(item.type)}</em>
                          </span>
                          {item.required ? <span className="wb-item-required">Required</span> : null}
                          <button
                            type="button"
                            className="wb-item-menu"
                            aria-label={`Edit ${item.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(item);
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    className="wb-add-item"
                    disabled={busy}
                    onClick={() => void addItem("YES_NO", true)}
                  >
                    + Add Item
                  </button>
                </section>
              </div>
            </>
          )}
        </main>

        <aside className="wb-summary" aria-label="Settings summary">
          <article className="wb-summary-card">
            <header>
              <h3>2. Set Rules</h3>
              <button type="button" className="wb-linkish" onClick={() => setStep("rules")}>
                Edit
              </button>
            </header>
            <ul>
              <li>
                <span className="wb-dot wb-dot--pass" /> Passing — all required must pass
              </li>
              <li>
                <span className="wb-dot wb-dot--fail" /> Failure — any required fails
              </li>
              <li>
                <span className="wb-dot wb-dot--score" /> Score — % of items passed
              </li>
            </ul>
          </article>

          <article className="wb-summary-card">
            <header>
              <h3>3. Corrective Actions</h3>
              <button type="button" className="wb-linkish" onClick={() => setStep("corrective")}>
                Edit
              </button>
            </header>
            <ul>
              <li>If a temperature fails → Follow food safety procedures</li>
              <li>Require photo on failure → Enabled for visual checks</li>
            </ul>
          </article>

          <article className="wb-summary-card">
            <header>
              <h3>4. Devices & Methods</h3>
              <button type="button" className="wb-linkish" onClick={() => setStep("devices")}>
                Edit
              </button>
            </header>
            <ul>
              <li>Bluetooth Thermometer — adapter ready later</li>
              <li>Manual Entry — enabled</li>
              <li>Photo Capture — enabled</li>
            </ul>
          </article>

          <div className="wb-publish-cta">
            <p>Looks good? Publish this walk to make it available to your team.</p>
            <button
              type="button"
              className="wb-btn wb-btn--primary"
              disabled={busy}
              onClick={() => void publishWalkAction()}
            >
              Publish Walk
            </button>
          </div>
        </aside>

        <aside className="wb-preview" aria-label="Associate preview">
          <h3>Preview: Associate View</h3>
          <div className="wb-phone">
            <div className="wb-phone-screen">
              <header className="wb-phone-head">
                <strong>{nameDraft || template.name}</strong>
                <span>{template.workplace || teamName}</span>
                <div className="wb-phone-progress">
                  <span>
                    {Math.min(3, items.length)} of {items.length || 0}
                  </span>
                  <span>{progressPct}% Complete</span>
                </div>
                <div className="wb-phone-bar">
                  <i style={{ width: `${progressPct}%` }} />
                </div>
              </header>

              <div className="wb-phone-cards">
                {previewItems.length === 0 ? (
                  <p className="wb-muted">Add items to preview the associate experience.</p>
                ) : (
                  previewItems.map((item, index) => {
                    const status = previewStatusForItem(item, index);
                    const active = selectedItem?.id === item.id;
                    return (
                      <article
                        key={item.id}
                        className={`wb-phone-card wb-phone-card--${status.kind}${active ? " is-active" : ""}`}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <header>
                          <strong>{item.title}</strong>
                          {status.kind === "fail" ? <span className="wb-pill wb-pill--fail">Failed</span> : null}
                          {status.kind === "pass" ? <span className="wb-pill wb-pill--pass">Pass</span> : null}
                          {status.kind === "needs" ? <span className="wb-pill wb-pill--needs">Needs Photo</span> : null}
                        </header>
                        {status.value ? <p className="wb-phone-value">{status.value}</p> : null}
                        {status.detail ? <p className="wb-phone-detail">{status.detail}</p> : null}
                      </article>
                    );
                  })
                )}
              </div>

              <button type="button" className="wb-phone-continue">
                Continue Walk
              </button>
            </div>
          </div>
        </aside>
      </div>

      <WalkItemEditDrawer
        open={!!editingItem}
        item={editingItem}
        busy={busy}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await withBusy(async () => {
            await patchWalkItem(teamId, template.id, editingItem.id, patch);
            await refresh();
            setEditingItem(null);
            showToast("Item updated");
          });
        }}
        onDelete={async () => {
          if (!editingItem) return;
          await withBusy(async () => {
            await deleteWalkItem(teamId, template.id, editingItem.id);
            setEditingItem(null);
            await refresh();
            showToast("Item deleted");
          });
        }}
      />
    </div>
  );
}
