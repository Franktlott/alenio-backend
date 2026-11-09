import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

export type PushCampaignStatus = "draft" | "pending" | "approved" | "scheduled" | "sending" | "sent" | "rejected";
export type PushCampaignType = "product_announcement" | "feature_update" | "reminder" | "recognition" | "billing";
export type PushAudienceKind = "all" | "workspace" | "paid" | "trial";
export type PushLinkKind = "home" | "discover" | "seneca";
export type PushDeliveryMode = "immediate" | "scheduled";

export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 178;

export type StaffPerson = { id: string; name: string; email: string; image: string | null; roleLabel: string | null };

export type PushCampaign = {
  id: string;
  title: string;
  body: string;
  type: PushCampaignType;
  category: string;
  audienceKind: PushAudienceKind;
  audienceTeamId: string | null;
  audienceTeamName: string | null;
  audienceCount: { total: number; reachable: number } | null;
  linkKind: PushLinkKind;
  linkValue: string;
  status: PushCampaignStatus;
  deliveryMode: PushDeliveryMode;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string;
  sentAt: string | null;
  recipientCount: number;
  deliveredCount: number;
  openCount: number;
  createdById: string;
  createdBy: StaffPerson | null;
  submittedBy: StaffPerson | null;
  approvedBy: StaffPerson | null;
  rejectedBy: StaffPerson | null;
};

export type PushCampaignInput = {
  title: string;
  body: string;
  type: PushCampaignType;
  category: string;
  audienceKind: PushAudienceKind;
  audienceTeamId: string | null;
  linkKind: PushLinkKind;
  linkValue: string;
  deliveryMode: PushDeliveryMode;
  scheduledAt: string | null;
};

export type PushTemplate = {
  id: string;
  name: string;
  title: string;
  body: string;
  type: PushCampaignType;
  category: string;
  linkKind: PushLinkKind;
  linkValue: string;
  updatedAt: string;
};

export type PushTemplateInput = Omit<PushTemplate, "id" | "updatedAt">;

export type PushMetrics = { drafts: number; pending: number; scheduled: number; sent30: number };

export const PUSH_TYPE_LABELS: Record<PushCampaignType, string> = {
  product_announcement: "Product Announcement",
  feature_update: "Feature Update",
  reminder: "Reminder",
  recognition: "Recognition",
  billing: "Billing",
};

export const PUSH_AUDIENCE_LABELS: Record<PushAudienceKind, string> = {
  all: "All Users",
  workspace: "Workspace Members",
  paid: "All Paid Users",
  trial: "Trial Users",
};

export const PUSH_LINK_LABELS: Record<PushLinkKind, string> = {
  home: "Home",
  discover: "Discover article",
  seneca: "Seneca",
};

const BASE = "/api/admin/notifications";

export function fetchPushMetrics() {
  return apiGetJson<{ data: PushMetrics }>(`${BASE}/metrics`).then((res) => res.data);
}

export function fetchPushCampaigns(params: { status?: string; q?: string }) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query}` : "";
  return apiGetJson<{ data: PushCampaign[] }>(`${BASE}/campaigns${suffix}`).then((res) => res.data);
}

export function fetchPushCampaign(id: string) {
  return apiGetJson<{ data: PushCampaign }>(`${BASE}/campaigns/${encodeURIComponent(id)}`).then((res) => res.data);
}

export function fetchPushAudience(kind: PushAudienceKind, teamId?: string | null) {
  const query = new URLSearchParams({ kind });
  if (teamId) query.set("teamId", teamId);
  return apiGetJson<{ data: { total: number; reachable: number } }>(`${BASE}/audience?${query}`).then((res) => res.data);
}

export function fetchPushWorkspaces(q: string) {
  return apiGetJson<{ data: Array<{ id: string; name: string; memberCount: number }> }>(
    `${BASE}/workspaces?q=${encodeURIComponent(q)}`,
  ).then((res) => res.data);
}

export function createPushCampaign(input: PushCampaignInput) {
  return apiPostJson<{ data: PushCampaign }>(`${BASE}/campaigns`, input).then((res) => res.data);
}

export function updatePushCampaign(id: string, input: PushCampaignInput) {
  return apiPatchJson<{ data: PushCampaign }>(`${BASE}/campaigns/${encodeURIComponent(id)}`, input).then((res) => res.data);
}

type CampaignAction = "submit" | "approve" | "reject" | "cancel" | "duplicate";

export function pushCampaignAction(id: string, action: CampaignAction, body: object = {}) {
  return apiPostJson<{ data: PushCampaign }>(`${BASE}/campaigns/${encodeURIComponent(id)}/${action}`, body).then(
    (res) => res.data,
  );
}

export function sendPushCampaignTest(id: string, email: string) {
  return apiPostJson<{ data: { email: string } }>(`${BASE}/campaigns/${encodeURIComponent(id)}/test`, { email }).then(
    (res) => res.data,
  );
}

export function deletePushCampaign(id: string) {
  return apiDeleteJson<{ data: { ok: true } }>(`${BASE}/campaigns/${encodeURIComponent(id)}`);
}

export function fetchPushTemplates() {
  return apiGetJson<{ data: PushTemplate[] }>(`${BASE}/templates`).then((res) => res.data);
}

export function savePushTemplate(input: PushTemplateInput, id?: string) {
  return (
    id
      ? apiPatchJson<{ data: PushTemplate }>(`${BASE}/templates/${encodeURIComponent(id)}`, input)
      : apiPostJson<{ data: PushTemplate }>(`${BASE}/templates`, input)
  ).then((res) => res.data);
}

export function deletePushTemplate(id: string) {
  return apiDeleteJson<{ data: { ok: true } }>(`${BASE}/templates/${encodeURIComponent(id)}`);
}
