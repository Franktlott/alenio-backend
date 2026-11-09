import { BellRing, CalendarDays, CreditCard, Megaphone, Sparkles, Star } from "lucide-react";
import type { ComponentType } from "react";
import type { PushCampaign, PushCampaignStatus, PushCampaignType } from "../../../lib/notifications-api";

const TYPE_ICON: Record<PushCampaignType, { Icon: ComponentType<{ size?: number; strokeWidth?: number }>; tone: string }> = {
  product_announcement: { Icon: Megaphone, tone: "purple" },
  feature_update: { Icon: Sparkles, tone: "blue" },
  reminder: { Icon: CalendarDays, tone: "indigo" },
  recognition: { Icon: Star, tone: "amber" },
  billing: { Icon: CreditCard, tone: "rose" },
};

export function TypeIcon({ type, size = 18, boxed = false }: { type: PushCampaignType; size?: number; boxed?: boolean }) {
  const { Icon, tone } = TYPE_ICON[type] ?? { Icon: BellRing, tone: "purple" };
  return (
    <span className={`an-type-icon an-tone-${tone}${boxed ? " an-type-icon--boxed" : ""}`} aria-hidden>
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

const STATUS_LABEL: Record<PushCampaignStatus, string> = {
  draft: "Draft",
  pending: "Pending Approval",
  approved: "Sending",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  rejected: "Changes Requested",
};

export function statusLabel(status: PushCampaignStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export function StatusPill({ status }: { status: PushCampaignStatus }) {
  return <span className={`an-pill an-pill--${status}`}>{statusLabel(status)}</span>;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export function deliveryLabel(campaign: Pick<PushCampaign, "status" | "deliveryMode" | "scheduledAt" | "sentAt">): string {
  if (campaign.status === "sent") return `Sent ${formatWhen(campaign.sentAt)}`;
  if (campaign.deliveryMode === "scheduled" && campaign.scheduledAt) return formatWhen(campaign.scheduledAt);
  return "Immediately (on approval)";
}

/** Lock-screen style card, so the writer sees roughly what lands on a phone. */
export function PhonePreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="an-phone" data-testid="an-phone-preview">
      <div className="an-phone-card">
        <div className="an-phone-head">
          <img src="/icon.png" alt="" className="an-phone-app" />
          <span className="an-phone-name">Alenio</span>
          <span className="an-phone-time">now</span>
        </div>
        <strong className="an-phone-title">{title || "Notification title"}</strong>
        <p className="an-phone-body">{body || "Your message appears here."}</p>
      </div>
    </div>
  );
}

export function errorText(error: unknown, fallback = "Something went wrong. Try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
