import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, History, Lock, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  centsToInput,
  displayFeatureLines,
  fetchAdminPricing,
  parsePriceInput,
  PLANS_QUERY_KEY,
  updatePlan,
  type AdminPlan,
  type PlanChange,
  type PlanFeature,
} from "../../lib/plans-api";
import { staffCan } from "../../lib/staff-access";
import { errorText } from "./notifications/notification-ui";
import "./admin-notifications.css";
import "./admin-pricing.css";

const ADMIN_PRICING_KEY = ["admin-pricing"] as const;

type Draft = {
  name: string;
  price: string;
  bestFor: string;
  included: string[];
  features: string;
  existing: "keep" | "move" | null;
};

const GROUPS: Array<{ key: PlanFeature["group"]; label: string }> = [
  { key: "workspace", label: "Workspace" },
  { key: "go", label: "Alenio Go" },
];

function includedOf(plan: AdminPlan): string[] {
  return plan.includedFeatures ?? [];
}

function extrasOf(plan: AdminPlan): string[] {
  return plan.extraFeatures ?? plan.features;
}

function draftOf(plan: AdminPlan): Draft {
  return {
    name: plan.name,
    price: centsToInput(plan.priceCents),
    bestFor: plan.bestFor,
    included: includedOf(plan),
    features: extrasOf(plan).join("\n"),
    existing: null,
  };
}

function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

function featureLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function workspaces(count: number): string {
  return `${count.toLocaleString()} paying ${count === 1 ? "workspace" : "workspaces"}`;
}

function moveNote(change: PlanChange): string | null {
  if (change.existingSubscribers !== "move") return null;
  if (change.moveStatus === "running") return "Moving existing subscribers…";
  const moved = `Moved ${change.movedCount.toLocaleString()} ${change.movedCount === 1 ? "subscriber" : "subscribers"}`;
  if (change.moveStatus === "partial") return `${moved}; ${change.moveFailedCount} couldn't be moved`;
  if (change.moveStatus === "failed") return "Moving subscribers stopped early. Check billing.";
  return moved;
}

function PlanEditor({
  plan,
  plans,
  catalog,
  billingConnected,
}: {
  plan: AdminPlan;
  plans: AdminPlan[];
  catalog: PlanFeature[];
  billingConnected: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(plan));
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setDraft(draftOf(plan)), [plan]);

  const cents = parsePriceInput(draft.price);
  const priceChanged = cents !== null && cents !== plan.priceCents;
  const dirty =
    draft.name.trim() !== plan.name ||
    draft.bestFor.trim() !== plan.bestFor ||
    featureLines(draft.features).join("\n") !== extrasOf(plan).join("\n") ||
    !sameKeys(draft.included, includedOf(plan)) ||
    priceChanged;
  const removedLocks = catalog.filter(
    (feature) => feature.locksAccess && includedOf(plan).includes(feature.key) && !draft.included.includes(feature.key),
  );
  const preview = displayFeatureLines(
    { key: plan.key, name: draft.name.trim() || plan.name, priceCents: cents ?? plan.priceCents, included: draft.included, extras: featureLines(draft.features) },
    plans.map((other) => ({ key: other.key, name: other.name, priceCents: other.priceCents, included: includedOf(other), extras: extrasOf(other) })),
    catalog,
  );
  const toggle = (key: string) =>
    set({
      included: catalog
        .map((feature) => feature.key)
        .filter((k) => (k === key ? !draft.included.includes(key) : draft.included.includes(k))),
    });
  const set = (patch: Partial<Draft>) => {
    setNotice(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = useMutation({
    mutationFn: () =>
      updatePlan(plan.key, {
        name: draft.name.trim(),
        bestFor: draft.bestFor.trim(),
        features: featureLines(draft.features),
        includedFeatures: draft.included,
        priceCents: cents ?? plan.priceCents,
        existingSubscribers: priceChanged ? draft.existing : null,
      }),
    onSuccess: () => {
      setNotice(priceChanged ? "Saved. New checkouts use the new price now." : "Saved.");
      void queryClient.invalidateQueries({ queryKey: ADMIN_PRICING_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    },
  });

  const priceError = cents === null ? "Enter a price like 39.99." : cents < 100 ? "Prices start at $1." : null;
  const needsChoice = priceChanged && !draft.existing;
  const canSave = dirty && !priceError && !needsChoice && draft.name.trim().length > 0 && !save.isPending;

  const submit = () => {
    if (!canSave) return;
    if (removedLocks.length > 0 && plan.subscribers > 0) {
      const names = removedLocks.map((feature) => feature.name).join(", ");
      if (!window.confirm(`Remove ${names} from ${plan.name}?\n\n${workspaces(plan.subscribers)} lose access right away.`)) return;
    }
    if (priceChanged) {
      const who =
        draft.existing === "move"
          ? `${workspaces(plan.subscribers)} will pay $${centsToInput(cents!)} from their next bill.`
          : "Current subscribers keep paying what they pay today.";
      if (!window.confirm(`Change ${plan.name} to $${centsToInput(cents!)}?\n\nNew customers pay the new price right away. ${who}`)) return;
    }
    save.mutate();
  };

  return (
    <section className="ap-plan" data-testid={`ap-plan-${plan.key}`}>
      <header className="ap-plan-head">
        <div>
          <span className="ap-plan-key">{plan.key === "pro" ? "Plan 1" : "Plan 2"}</span>
          <h2>{plan.name}</h2>
        </div>
        <span className="ap-subs">
          <Users size={14} />
          {workspaces(plan.subscribers)}
        </span>
      </header>

      <div className="ap-row">
        <label className="ap-field">
          <span>Plan name</span>
          <input value={draft.name} maxLength={40} onChange={(event) => set({ name: event.target.value })} />
        </label>
        <label className="ap-field ap-field--price">
          <span>Price</span>
          <span className="ap-price-input">
            <b>$</b>
            <input
              value={draft.price}
              inputMode="decimal"
              disabled={!billingConnected}
              aria-invalid={Boolean(priceError)}
              onChange={(event) => set({ price: event.target.value, existing: null })}
              data-testid={`ap-price-${plan.key}`}
            />
            <small>{plan.periodLabel.replace("per ", "/ ")}</small>
          </span>
          {priceError ? <em className="ap-error">{priceError}</em> : null}
        </label>
      </div>

      {priceChanged ? (
        <fieldset className="ap-existing" data-testid={`ap-existing-${plan.key}`}>
          <legend>
            {plan.subscribers > 0
              ? `What about the ${workspaces(plan.subscribers)} on ${plan.priceLabel}?`
              : "If anyone subscribes before this saves:"}
          </legend>
          <label className={draft.existing === "keep" ? "is-on" : undefined}>
            <input type="radio" name={`existing-${plan.key}`} checked={draft.existing === "keep"} onChange={() => set({ existing: "keep" })} />
            <span>
              <strong>Keep their current price</strong>
              <small>Only new customers pay ${centsToInput(cents!)}.</small>
            </span>
          </label>
          <label className={draft.existing === "move" ? "is-on" : undefined}>
            <input type="radio" name={`existing-${plan.key}`} checked={draft.existing === "move"} onChange={() => set({ existing: "move" })} />
            <span>
              <strong>Move them to the new price</strong>
              <small>Starts at their next bill. No surprise charge today.</small>
            </span>
          </label>
        </fieldset>
      ) : null}

      <label className="ap-field">
        <span>Who it's for</span>
        <textarea rows={2} maxLength={240} value={draft.bestFor} onChange={(event) => set({ bestFor: event.target.value })} />
      </label>

      <fieldset className="ap-included" data-testid={`ap-included-${plan.key}`}>
        <legend>What's included</legend>
        {GROUPS.map((group) => (
          <div key={group.key} className="ap-included-group">
            <h3>{group.label}</h3>
            {catalog
              .filter((feature) => feature.group === group.key)
              .map((feature) => {
                const on = draft.included.includes(feature.key);
                return (
                  <label key={feature.key} className={on ? "is-on" : undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={feature.required}
                      onChange={() => toggle(feature.key)}
                      data-testid={`ap-feature-${plan.key}-${feature.key}`}
                    />
                    <span>{feature.name}</span>
                    {feature.required ? (
                      <small title="Every paid plan includes the team workspace.">
                        <Lock size={11} /> Always on
                      </small>
                    ) : !feature.locksAccess ? (
                      <small title="Shown on the pricing page. Access isn't switched off yet.">Listing only</small>
                    ) : null}
                  </label>
                );
              })}
          </div>
        ))}
      </fieldset>

      <label className="ap-field">
        <span>
          Extra pricing-page lines <small>· optional, one per line</small>
        </span>
        <textarea
          rows={2}
          value={draft.features}
          placeholder="e.g. Onboarding call"
          onChange={(event) => set({ features: event.target.value })}
        />
      </label>

      <div className="ap-preview" data-testid={`ap-preview-${plan.key}`}>
        <span>Pricing page shows</span>
        <ul>
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <footer className="ap-plan-foot">
        {save.isError ? <span className="ap-error">{errorText(save.error)}</span> : null}
        {notice ? <span className="ap-saved">{notice}</span> : null}
        <span className="ap-spacer" />
        {dirty ? (
          <button type="button" className="an-btn" onClick={() => setDraft(draftOf(plan))} disabled={save.isPending}>
            Reset
          </button>
        ) : null}
        <button type="button" className="an-btn an-btn--primary" disabled={!canSave} onClick={submit} data-testid={`ap-save-${plan.key}`}>
          {save.isPending ? "Saving…" : needsChoice ? "Choose an option above" : "Save changes"}
        </button>
      </footer>
    </section>
  );
}

export function AdminPricingPage() {
  const { me } = useEnterpriseShell();
  const navigate = useNavigate();
  const allowed = staffCan(me, "pricing.manage");
  useEffect(() => {
    if (me && !allowed) navigate("/settings", { replace: true });
  }, [me, allowed, navigate]);

  const query = useQuery({
    queryKey: ADMIN_PRICING_KEY,
    queryFn: fetchAdminPricing,
    enabled: allowed,
    refetchInterval: (q) => (q.state.data?.history.some((change) => change.moveStatus === "running") ? 4000 : false),
  });

  if (!me || !allowed || query.isLoading) return <EnterprisePageLoading label="Loading pricing" />;
  const data = query.data;

  return (
    <div className="an-page ap-page" data-testid="admin-pricing">
      <header className="an-header">
        <div>
          <h1>Plans & pricing</h1>
          <p>Edit once here. The website, the apps and checkout all update within a minute.</p>
        </div>
        <a className="an-btn" href="/pricing" target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          View pricing page
        </a>
      </header>

      {query.isError ? <div className="an-error">{errorText(query.error)}</div> : null}
      {data && !data.billingConnected ? (
        <div className="ap-banner">Billing isn't connected on this server, so prices are locked. You can still edit names and features.</div>
      ) : null}

      {data ? (
        <>
          <div className="ap-grid">
            {data.plans.map((plan) => (
              <PlanEditor
                key={plan.key}
                plan={plan}
                plans={data.plans}
                catalog={data.catalog ?? []}
                billingConnected={data.billingConnected}
              />
            ))}
          </div>

          {data.googlePlay ? (
            <section className="ap-play" data-testid="ap-google-play">
              <strong>Android sales reported to Google Play</strong>
              <span>
                {data.googlePlay.connected ? "Connected" : "Not connected yet — sales are saved and sent once it is"}
                {" · "}
                {data.googlePlay.reported.toLocaleString()} reported
                {data.googlePlay.waiting ? ` · ${data.googlePlay.waiting.toLocaleString()} waiting` : ""}
                {data.googlePlay.failed ? ` · ${data.googlePlay.failed.toLocaleString()} retrying` : ""}
              </span>
            </section>
          ) : null}

          <section className="ap-history" aria-label="Change history">
            <h2>
              <History size={16} />
              Change history
            </h2>
            {data.history.length === 0 ? (
              <p className="ap-empty">No changes yet.</p>
            ) : (
              <ul>
                {data.history.map((change) => {
                  const note = moveNote(change);
                  const plan = data.plans.find((item) => item.key === change.planKey);
                  return (
                    <li key={change.id}>
                      <span className="ap-history-plan">{plan?.name ?? change.planKey}</span>
                      <span className="ap-history-copy">
                        {change.summary}
                        {note ? <small className={`ap-move ap-move--${change.moveStatus}`}>{note}</small> : null}
                      </span>
                      <span className="ap-history-meta">
                        {change.actorName} ·{" "}
                        {new Date(change.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
