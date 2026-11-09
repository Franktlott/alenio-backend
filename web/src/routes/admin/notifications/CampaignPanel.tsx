import { useState } from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Diamond,
  Link2,
  Pencil,
  Send,
  Smartphone,
  Tag,
  Trash2,
  Undo2,
  Users,
  X,
  Bell,
} from "lucide-react";
import { UserAvatar } from "../../../components/UserAvatar";
import {
  deletePushCampaign,
  PUSH_AUDIENCE_LABELS,
  PUSH_LINK_LABELS,
  PUSH_TYPE_LABELS,
  pushCampaignAction,
  sendPushCampaignTest,
  type PushCampaign,
  type StaffPerson,
} from "../../../lib/notifications-api";
import { deliveryLabel, errorText, formatWhen, PhonePreview, StatusPill, TypeIcon } from "./notification-ui";

type Tab = "overview" | "approval" | "performance";

type Props = {
  campaign: PushCampaign;
  meId: string | null;
  meEmail: string | null;
  canCreate: boolean;
  canApprove: boolean;
  onClose: () => void;
  onEdit: (campaign: PushCampaign) => void;
  onChanged: (campaign: PushCampaign | null) => void;
};

export function audienceLine(campaign: PushCampaign): string {
  const label =
    campaign.audienceKind === "workspace" && campaign.audienceTeamName
      ? campaign.audienceTeamName
      : PUSH_AUDIENCE_LABELS[campaign.audienceKind];
  const count = campaign.status === "sent" ? campaign.recipientCount : campaign.audienceCount?.total;
  return count == null ? label : `${label} (${count.toLocaleString()})`;
}

function Person({ person, fallback }: { person: StaffPerson | null; fallback: string }) {
  return (
    <span className="an-person">
      <UserAvatar user={person ?? { name: fallback }} className="an-avatar" imgClassName="an-avatar-img" alt="" />
      <span>
        <strong>{person?.name || person?.email || fallback}</strong>
        {person?.roleLabel ? <small>{person.roleLabel}</small> : null}
      </span>
    </span>
  );
}

export function CampaignPanel({ campaign, meId, meEmail, canCreate, canApprove, onClose, onEdit, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>(campaign.status === "pending" ? "approval" : "overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState(meEmail ?? "");
  const [testNotice, setTestNotice] = useState<string | null>(null);

  const isCreator = meId != null && (campaign.createdById === meId || campaign.submittedBy?.id === meId);
  const editable = campaign.status === "draft" || campaign.status === "rejected";

  const act = async (label: string, run: () => Promise<PushCampaign | null>) => {
    setBusy(label);
    setError(null);
    try {
      onChanged(await run());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const approve = () => {
    const when = campaign.deliveryMode === "scheduled" ? `It will send ${formatWhen(campaign.scheduledAt)}.` : "It will send right away.";
    if (!window.confirm(`Approve “${campaign.title}”? ${when}`)) return;
    void act("approve", () => pushCampaignAction(campaign.id, "approve"));
  };

  const remove = () => {
    if (!window.confirm(`Delete “${campaign.title}”? This can't be undone.`)) return;
    void act("delete", async () => {
      await deletePushCampaign(campaign.id);
      return null;
    });
  };

  const sendTest = async () => {
    setBusy("test");
    setError(null);
    setTestNotice(null);
    try {
      const result = await sendPushCampaignTest(campaign.id, testEmail.trim());
      setTestNotice(`Test sent to ${result.email}.`);
      setTesting(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const openRate = campaign.deliveredCount > 0 ? Math.round((campaign.openCount / campaign.deliveredCount) * 100) : 0;

  return (
    <aside className="an-panel" data-testid="an-panel" aria-label="Notification details">
      <div className="an-panel-top">
        <StatusPill status={campaign.status} />
        <button type="button" className="an-icon-btn" aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="an-panel-head">
        <TypeIcon type={campaign.type} size={24} boxed />
        <div>
          <h2>{campaign.title}</h2>
          <p>{campaign.body}</p>
        </div>
      </div>

      <div className="an-panel-tabs" role="tablist">
        {(["overview", "approval", "performance"] as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {key === "overview" ? "Overview" : key === "approval" ? "Approval" : "Performance"}
          </button>
        ))}
      </div>

      {error ? (
        <p className="an-error" role="alert">
          {error}
        </p>
      ) : null}
      {testNotice ? (
        <p className="an-success" role="status" data-testid="an-test-notice">
          {testNotice}
        </p>
      ) : null}

      <div className="an-panel-body">
        {tab === "overview" ? (
          <div className="an-overview">
            <section className="an-preview-box">
              <h3>Message Preview</h3>
              <PhonePreview title={campaign.title} body={campaign.body} />
            </section>
            <dl className="an-facts">
              <div>
                <Users size={17} />
                <dt>Audience</dt>
                <dd>{audienceLine(campaign)}</dd>
              </div>
              <div>
                <CalendarClock size={17} />
                <dt>Delivery</dt>
                <dd>{deliveryLabel(campaign)}</dd>
              </div>
              <div>
                <Bell size={17} />
                <dt>Type</dt>
                <dd>{PUSH_TYPE_LABELS[campaign.type]}</dd>
              </div>
              {campaign.category ? (
                <div>
                  <Tag size={17} />
                  <dt>Category</dt>
                  <dd>{campaign.category}</dd>
                </div>
              ) : null}
              <div>
                <Link2 size={17} />
                <dt>Opens</dt>
                <dd>
                  {PUSH_LINK_LABELS[campaign.linkKind]}
                  {campaign.linkKind === "discover" && campaign.linkValue ? ` · ${campaign.linkValue}` : ""}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {tab === "overview" || tab === "approval" ? (
          <section className="an-workflow" data-testid="an-workflow">
            <h3>Approval Workflow</h3>
            <ol>
              <li className="is-done">
                <span className="an-step-dot" aria-hidden>
                  <Check size={12} strokeWidth={3} />
                </span>
                <span className="an-step-label">Created by</span>
                <Person person={campaign.createdBy} fallback="Staff" />
                <time>{formatWhen(campaign.createdAt)}</time>
              </li>
              {campaign.status === "rejected" ? (
                <li className="is-rejected">
                  <span className="an-step-dot" aria-hidden>
                    <X size={12} strokeWidth={3} />
                  </span>
                  <span className="an-step-label">Changes requested</span>
                  <span className="an-step-copy">
                    <Person person={campaign.rejectedBy} fallback="Reviewer" />
                    {campaign.rejectionNote ? <q>{campaign.rejectionNote}</q> : null}
                  </span>
                  <time>{formatWhen(campaign.rejectedAt)}</time>
                </li>
              ) : campaign.approvedBy ? (
                <li className="is-done">
                  <span className="an-step-dot" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className="an-step-label">Approved by</span>
                  <Person person={campaign.approvedBy} fallback="Reviewer" />
                  <time>{formatWhen(campaign.approvedAt)}</time>
                </li>
              ) : (
                <li className={campaign.status === "pending" ? "is-current" : ""}>
                  <span className="an-step-dot" aria-hidden />
                  <span className="an-step-label">{campaign.status === "pending" ? "Pending Approval" : "Approval"}</span>
                  <span className="an-step-copy">
                    <strong>Second Admin Review</strong>
                    <small>Requires a different admin than the creator</small>
                  </span>
                  {campaign.status === "pending" && canApprove ? (
                    <span className="an-step-actions">
                      <button
                        type="button"
                        className="an-btn an-btn--primary"
                        disabled={isCreator || busy !== null}
                        title={isCreator ? "A different admin has to approve this." : undefined}
                        onClick={approve}
                        data-testid="an-approve"
                      >
                        {busy === "approve" ? "Approving…" : "Review & Approve"}
                      </button>
                      <button
                        type="button"
                        className="an-btn"
                        disabled={isCreator || busy !== null}
                        onClick={() => setRejecting((value) => !value)}
                        data-testid="an-reject"
                      >
                        Request changes
                      </button>
                    </span>
                  ) : null}
                </li>
              )}
              {campaign.status === "sent" ? (
                <li className="is-done">
                  <span className="an-step-dot" aria-hidden>
                    <Send size={11} strokeWidth={2.6} />
                  </span>
                  <span className="an-step-label">Sent</span>
                  <span className="an-step-copy">
                    <strong>{campaign.deliveredCount.toLocaleString()} delivered</strong>
                  </span>
                  <time>{formatWhen(campaign.sentAt)}</time>
                </li>
              ) : null}
            </ol>
            {campaign.status === "pending" && isCreator ? (
              <p className="an-note" data-testid="an-same-approver">
                You created this notification, so a different admin has to approve it.
              </p>
            ) : null}
            {rejecting ? (
              <div className="an-reject-box">
                <label htmlFor="an-reject-note">What should change?</label>
                <textarea
                  id="an-reject-note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="an-row-end">
                  <button type="button" className="an-btn" onClick={() => setRejecting(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="an-btn an-btn--danger"
                    disabled={busy !== null}
                    onClick={() =>
                      void act("reject", async () => {
                        const updated = await pushCampaignAction(campaign.id, "reject", { note });
                        setRejecting(false);
                        setNote("");
                        return updated;
                      })
                    }
                  >
                    Send back
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "performance" ? (
          <section className="an-performance" data-testid="an-performance">
            {campaign.status === "sent" ? (
              <div className="an-perf-grid">
                <div>
                  <span>Recipients</span>
                  <strong>{campaign.recipientCount.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Delivered</span>
                  <strong>{campaign.deliveredCount.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Opens</span>
                  <strong>{campaign.openCount.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Open rate</span>
                  <strong>{openRate}%</strong>
                </div>
              </div>
            ) : (
              <p className="an-empty-copy">
                Results appear here after it sends.
                {campaign.audienceCount
                  ? ` It will reach about ${campaign.audienceCount.reachable.toLocaleString()} of ${campaign.audienceCount.total.toLocaleString()} people (the rest have no device or turned announcements off).`
                  : ""}
              </p>
            )}
          </section>
        ) : null}
      </div>

      {canCreate && testing ? (
        <div className="an-test-box" data-testid="an-test-box">
          <label htmlFor="an-test-email">Send a test to this account's phone</label>
          <div className="an-test-row">
            <input
              id="an-test-email"
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              placeholder="name@company.com"
              onKeyDown={(event) => {
                if (event.key === "Enter" && testEmail.trim()) void sendTest();
              }}
            />
            <button type="button" className="an-btn" onClick={() => setTesting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="an-btn an-btn--primary"
              disabled={!testEmail.trim() || busy !== null}
              onClick={() => void sendTest()}
              data-testid="an-test-send"
            >
              {busy === "test" ? "Sending…" : "Send test"}
            </button>
          </div>
          <small>Only this person gets it. It doesn't count toward results.</small>
        </div>
      ) : null}

      {canCreate ? (
        <div className="an-panel-foot">
          {editable ? (
            <button type="button" className="an-btn" onClick={() => onEdit(campaign)} data-testid="an-edit">
              <Pencil size={15} />
              Edit
            </button>
          ) : null}
          {campaign.status === "pending" || campaign.status === "scheduled" ? (
            <button
              type="button"
              className="an-btn"
              disabled={busy !== null}
              onClick={() => {
                const verb = campaign.status === "scheduled" ? "Unschedule" : "Withdraw";
                if (window.confirm(`${verb} “${campaign.title}” and move it back to drafts?`)) {
                  void act("cancel", () => pushCampaignAction(campaign.id, "cancel"));
                }
              }}
            >
              <Undo2 size={15} />
              {campaign.status === "scheduled" ? "Unschedule" : "Withdraw"}
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="an-btn an-btn--primary"
              disabled={busy !== null}
              onClick={() => void act("submit", () => pushCampaignAction(campaign.id, "submit"))}
              data-testid="an-submit"
            >
              <Diamond size={15} />
              Submit for approval
            </button>
          ) : null}
          {!testing ? (
            <button
              type="button"
              className="an-btn"
              disabled={busy !== null}
              onClick={() => {
                setTesting(true);
                setTestNotice(null);
              }}
              data-testid="an-test"
            >
              <Smartphone size={15} />
              Send test
            </button>
          ) : null}
          <button
            type="button"
            className="an-btn"
            disabled={busy !== null}
            onClick={() => void act("duplicate", () => pushCampaignAction(campaign.id, "duplicate"))}
          >
            <Copy size={15} />
            Duplicate
          </button>
          {editable ? (
            <button type="button" className="an-btn an-btn--danger-ghost" disabled={busy !== null} onClick={remove}>
              <Trash2 size={15} />
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
