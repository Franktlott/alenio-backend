import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { fetchDiscoverArticles } from "../../../lib/discover-api";
import {
  createPushCampaign,
  fetchPushAudience,
  fetchPushTemplates,
  fetchPushWorkspaces,
  PUSH_AUDIENCE_LABELS,
  PUSH_BODY_MAX,
  PUSH_LINK_LABELS,
  PUSH_TITLE_MAX,
  PUSH_TYPE_LABELS,
  pushCampaignAction,
  updatePushCampaign,
  type PushAudienceKind,
  type PushCampaign,
  type PushCampaignInput,
  type PushCampaignType,
  type PushLinkKind,
} from "../../../lib/notifications-api";
import { errorText, PhonePreview } from "./notification-ui";

type Props = {
  campaign: PushCampaign | null;
  initial?: Partial<PushCampaignInput>;
  onClose: () => void;
  onSaved: (campaign: PushCampaign) => void;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const EMPTY: PushCampaignInput = {
  title: "",
  body: "",
  type: "product_announcement",
  category: "",
  audienceKind: "all",
  audienceTeamId: null,
  linkKind: "home",
  linkValue: "",
  deliveryMode: "immediate",
  scheduledAt: null,
};

export function NotificationComposer({ campaign, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<PushCampaignInput>(() =>
    campaign
      ? {
          title: campaign.title,
          body: campaign.body,
          type: campaign.type,
          category: campaign.category,
          audienceKind: campaign.audienceKind,
          audienceTeamId: campaign.audienceTeamId,
          linkKind: campaign.linkKind,
          linkValue: campaign.linkValue,
          deliveryMode: campaign.deliveryMode,
          scheduledAt: campaign.scheduledAt,
        }
      : { ...EMPTY, ...initial },
  );
  const [teamName, setTeamName] = useState(campaign?.audienceTeamName ?? "");
  const [teamQuery, setTeamQuery] = useState("");
  const [articleQuery, setArticleQuery] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PushCampaignInput>(key: K, value: PushCampaignInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const templates = useQuery({ queryKey: ["admin", "push-templates"], queryFn: fetchPushTemplates, staleTime: 30_000 });

  const audienceReady = form.audienceKind !== "workspace" || Boolean(form.audienceTeamId);
  const audience = useQuery({
    queryKey: ["admin", "push-audience", form.audienceKind, form.audienceTeamId],
    queryFn: () => fetchPushAudience(form.audienceKind, form.audienceTeamId),
    enabled: audienceReady,
    staleTime: 30_000,
  });

  const debouncedTeamQuery = useDebounced(teamQuery);
  const workspaces = useQuery({
    queryKey: ["admin", "push-workspaces", debouncedTeamQuery],
    queryFn: () => fetchPushWorkspaces(debouncedTeamQuery),
    enabled: form.audienceKind === "workspace" && !form.audienceTeamId,
    staleTime: 30_000,
  });

  const debouncedArticleQuery = useDebounced(articleQuery);
  const articles = useQuery({
    queryKey: ["admin", "push-articles", debouncedArticleQuery],
    queryFn: () => fetchDiscoverArticles({ q: debouncedArticleQuery, status: "published", pageSize: 8 }),
    enabled: form.linkKind === "discover",
    staleTime: 30_000,
  });
  const chosenArticle = useMemo(
    () => articles.data?.items.find((item) => item.slug === form.linkValue) ?? null,
    [articles.data, form.linkValue],
  );

  const applyTemplate = (id: string) => {
    const template = templates.data?.find((item) => item.id === id);
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      title: template.title,
      body: template.body,
      type: template.type,
      category: template.category,
      linkKind: template.linkKind,
      linkValue: template.linkValue,
    }));
  };

  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "draft");
    setError(null);
    try {
      const payload: PushCampaignInput = {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category.trim(),
        audienceTeamId: form.audienceKind === "workspace" ? form.audienceTeamId : null,
        linkValue: form.linkKind === "discover" ? form.linkValue : "",
        scheduledAt: form.deliveryMode === "scheduled" ? form.scheduledAt : null,
      };
      const existingId = campaign?.id ?? savedId;
      let saved = existingId ? await updatePushCampaign(existingId, payload) : await createPushCampaign(payload);
      setSavedId(saved.id);
      if (submit) saved = await pushCampaignAction(saved.id, "submit");
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const canSave = form.title.trim().length > 0 && form.body.trim().length > 0 && busy === null;

  return (
    <div className="an-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="an-modal" role="dialog" aria-modal="true" aria-labelledby="an-composer-title" data-testid="an-composer">
        <header className="an-modal-head">
          <div>
            <h2 id="an-composer-title">{campaign ? "Edit notification" : "Create notification"}</h2>
            <p>Every notification is reviewed by a second admin before it sends.</p>
          </div>
          <button type="button" className="an-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="an-modal-body">
          <div className="an-form">
            {templates.data && templates.data.length > 0 ? (
              <label className="an-field">
                <span>Start from a template</span>
                <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)} data-testid="an-use-template">
                  <option value="" disabled>
                    Choose a template…
                  </option>
                  {templates.data.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="an-field">
              <span>
                Title <em>{form.title.length}/{PUSH_TITLE_MAX}</em>
              </span>
              <input
                value={form.title}
                maxLength={PUSH_TITLE_MAX}
                onChange={(event) => set("title", event.target.value)}
                placeholder="New: Smart Check-ins are here"
                data-testid="an-title"
              />
            </label>
            <label className="an-field">
              <span>
                Message <em>{form.body.length}/{PUSH_BODY_MAX}</em>
              </span>
              <textarea
                rows={3}
                value={form.body}
                maxLength={PUSH_BODY_MAX}
                onChange={(event) => set("body", event.target.value)}
                placeholder="Keep it short. Most phones show about two lines."
                data-testid="an-body"
              />
            </label>

            <div className="an-field-row">
              <label className="an-field">
                <span>Type</span>
                <select value={form.type} onChange={(event) => set("type", event.target.value as PushCampaignType)}>
                  {Object.entries(PUSH_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="an-field">
                <span>Category (optional)</span>
                <input
                  value={form.category}
                  maxLength={60}
                  onChange={(event) => set("category", event.target.value)}
                  placeholder="Product Updates"
                />
              </label>
            </div>

            <fieldset className="an-field">
              <span>Audience</span>
              <div className="an-segments">
                {(Object.keys(PUSH_AUDIENCE_LABELS) as PushAudienceKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={form.audienceKind === kind}
                    onClick={() => set("audienceKind", kind)}
                  >
                    {kind === "workspace" ? "One workspace" : PUSH_AUDIENCE_LABELS[kind]}
                  </button>
                ))}
              </div>
              {form.audienceKind === "workspace" ? (
                form.audienceTeamId ? (
                  <div className="an-chosen">
                    <strong>{teamName || "Selected workspace"}</strong>
                    <button
                      type="button"
                      className="an-link"
                      onClick={() => {
                        set("audienceTeamId", null);
                        setTeamName("");
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="an-picker">
                    <input
                      value={teamQuery}
                      onChange={(event) => setTeamQuery(event.target.value)}
                      placeholder="Search workspaces"
                      data-testid="an-workspace-search"
                    />
                    <ul>
                      {(workspaces.data ?? []).map((team) => (
                        <li key={team.id}>
                          <button
                            type="button"
                            onClick={() => {
                              set("audienceTeamId", team.id);
                              setTeamName(team.name);
                            }}
                          >
                            <span>{team.name}</span>
                            <small>{team.memberCount.toLocaleString()} members</small>
                          </button>
                        </li>
                      ))}
                      {workspaces.data && workspaces.data.length === 0 ? <li className="an-picker-empty">No workspaces found</li> : null}
                    </ul>
                  </div>
                )
              ) : null}
              <p className="an-hint" data-testid="an-audience-count">
                {!audienceReady
                  ? "Choose a workspace to see how many people this reaches."
                  : audience.data
                    ? `${audience.data.total.toLocaleString()} people · ${audience.data.reachable.toLocaleString()} can receive it right now`
                    : "Counting…"}
              </p>
            </fieldset>

            <fieldset className="an-field">
              <span>When tapped, open</span>
              <div className="an-segments">
                {(Object.keys(PUSH_LINK_LABELS) as PushLinkKind[]).map((kind) => (
                  <button key={kind} type="button" aria-pressed={form.linkKind === kind} onClick={() => set("linkKind", kind)}>
                    {PUSH_LINK_LABELS[kind]}
                  </button>
                ))}
              </div>
              {form.linkKind === "discover" ? (
                form.linkValue ? (
                  <div className="an-chosen">
                    <strong>{chosenArticle?.title ?? form.linkValue}</strong>
                    <button type="button" className="an-link" onClick={() => set("linkValue", "")}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="an-picker">
                    <input
                      value={articleQuery}
                      onChange={(event) => setArticleQuery(event.target.value)}
                      placeholder="Search published articles"
                    />
                    <ul>
                      {(articles.data?.items ?? []).map((article) => (
                        <li key={article.id}>
                          <button type="button" onClick={() => set("linkValue", article.slug)}>
                            <span>{article.title}</span>
                          </button>
                        </li>
                      ))}
                      {articles.data && articles.data.items.length === 0 ? <li className="an-picker-empty">No published articles found</li> : null}
                    </ul>
                  </div>
                )
              ) : null}
            </fieldset>

            <fieldset className="an-field">
              <span>Delivery</span>
              <div className="an-segments">
                <button type="button" aria-pressed={form.deliveryMode === "immediate"} onClick={() => set("deliveryMode", "immediate")}>
                  As soon as it's approved
                </button>
                <button type="button" aria-pressed={form.deliveryMode === "scheduled"} onClick={() => set("deliveryMode", "scheduled")}>
                  At a set time
                </button>
              </div>
              {form.deliveryMode === "scheduled" ? (
                <input
                  type="datetime-local"
                  value={toLocalInput(form.scheduledAt)}
                  min={toLocalInput(new Date().toISOString())}
                  onChange={(event) =>
                    set("scheduledAt", event.target.value ? new Date(event.target.value).toISOString() : null)
                  }
                  data-testid="an-schedule"
                />
              ) : null}
            </fieldset>
          </div>

          <div className="an-modal-preview">
            <h3>Preview</h3>
            <PhonePreview title={form.title} body={form.body} />
            <p className="an-hint">Phones may cut long text short. Put the key point first.</p>
          </div>
        </div>

        {error ? (
          <p className="an-error an-error--modal" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="an-modal-foot">
          <button type="button" className="an-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="an-btn" disabled={!canSave} onClick={() => void save(false)} data-testid="an-save-draft">
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="an-btn an-btn--primary"
            disabled={!canSave}
            onClick={() => void save(true)}
            data-testid="an-composer-submit"
          >
            {busy === "submit" ? "Submitting…" : "Submit for approval"}
          </button>
        </footer>
      </div>
    </div>
  );
}
