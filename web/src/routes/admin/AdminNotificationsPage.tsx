import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Copy, Eye, FileText, Plus, Send, Trash2 } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  AlenioDataTable,
  EmptyState,
  RowActions,
  SearchField,
  SegmentedControl,
  StatusIndicator,
  type AlenioColumn,
  type IndicatorTone,
  type RowAction,
} from "../../components/ui";
import { UserAvatar } from "../../components/UserAvatar";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  deletePushCampaign,
  fetchPushCampaign,
  fetchPushCampaigns,
  fetchPushMetrics,
  pushCampaignAction,
  type PushCampaign,
  type PushCampaignInput,
  type PushCampaignStatus,
} from "../../lib/notifications-api";
import { staffCan } from "../../lib/staff-access";
import { audienceLine, CampaignPanel } from "./notifications/CampaignPanel";
import { NotificationComposer } from "./notifications/NotificationComposer";
import { NotificationTemplates } from "./notifications/NotificationTemplates";
import { errorText, formatWhen, statusLabel, TypeIcon } from "./notifications/notification-ui";
import "./admin-notifications.css";

type TabKey = "push" | "approval" | "scheduled" | "sent" | "templates";
type Filter = "" | "draft" | "pending" | "scheduled" | "sent";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "push", label: "Push Notifications" },
  { key: "approval", label: "Approval Queue" },
  { key: "scheduled", label: "Scheduled" },
  { key: "sent", label: "Sent" },
  { key: "templates", label: "Templates" },
];

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "pending", label: "Pending" },
  { key: "scheduled", label: "Scheduled" },
  { key: "sent", label: "Sent" },
];

const TAB_STATUS: Partial<Record<TabKey, Filter>> = { approval: "pending", scheduled: "scheduled", sent: "sent" };

function isTab(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

function whenColumn(campaign: PushCampaign): string {
  if (campaign.status === "sent") return formatWhen(campaign.sentAt);
  if (campaign.deliveryMode === "scheduled" && campaign.scheduledAt) return formatWhen(campaign.scheduledAt);
  return "—";
}

const STATUS_TONE: Record<PushCampaignStatus, IndicatorTone> = {
  draft: "neutral",
  pending: "warning",
  approved: "info",
  scheduled: "info",
  sending: "info",
  sent: "success",
  rejected: "danger",
};

function campaignActions(
  campaign: PushCampaign,
  canCreate: boolean,
  onOpen: () => void,
  onChanged: (campaign: PushCampaign | null, removedId?: string) => void,
): RowAction[] {
  const actions: RowAction[] = [
    { id: "open", label: "View details", icon: <Eye size={15} strokeWidth={2} />, onSelect: onOpen },
  ];
  if (!canCreate) return actions;
  actions.push({
    id: "duplicate",
    label: "Duplicate",
    icon: <Copy size={15} strokeWidth={2} />,
    onSelect: async () => {
      try {
        onChanged(await pushCampaignAction(campaign.id, "duplicate"));
      } catch (err) {
        window.alert(errorText(err));
      }
    },
  });
  if (campaign.status === "draft" || campaign.status === "rejected") {
    actions.push({
      id: "delete",
      label: "Delete",
      icon: <Trash2 size={15} strokeWidth={2} />,
      tone: "danger",
      onSelect: async () => {
        if (!window.confirm(`Delete “${campaign.title}”? This can't be undone.`)) return;
        try {
          await deletePushCampaign(campaign.id);
          onChanged(null, campaign.id);
        } catch (err) {
          window.alert(errorText(err));
        }
      },
    });
  }
  return actions;
}

/** Staff page for writing, approving and tracking push notifications sent to app users. */
export function AdminNotificationsPage() {
  const { me } = useEnterpriseShell();
  const queryClient = useQueryClient();
  const allowed = staffCan(me, "notifications.view");
  const canCreate = staffCan(me, "notifications.create");
  const canApprove = staffCan(me, "notifications.approve");

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "push";
  const selectedId = searchParams.get("id");
  const [filter, setFilter] = useState<Filter>("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [composer, setComposer] = useState<{ campaign: PushCampaign | null; initial?: Partial<PushCampaignInput> } | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const status = TAB_STATUS[tab] ?? filter;

  const metrics = useQuery({
    queryKey: ["admin", "push", "metrics"],
    queryFn: fetchPushMetrics,
    enabled: Boolean(me) && allowed,
    staleTime: 15_000,
  });

  const campaigns = useQuery({
    queryKey: ["admin", "push", "campaigns", status, debouncedQuery],
    queryFn: () => fetchPushCampaigns({ status: status || undefined, q: debouncedQuery || undefined }),
    enabled: Boolean(me) && allowed && tab !== "templates",
    staleTime: 10_000,
    refetchInterval: 60_000,
  });

  const selected = useQuery({
    queryKey: ["admin", "push", "campaign", selectedId],
    queryFn: () => fetchPushCampaign(selectedId!),
    enabled: Boolean(me) && allowed && Boolean(selectedId) && tab !== "templates",
    staleTime: 5_000,
  });

  if (me === undefined) return <EnterprisePageLoading label="Loading notifications" />;
  if (me === null || !allowed) return <Navigate to="/settings" replace />;

  const updateParams = (next: { tab?: TabKey; id?: string | null }) => {
    const params = new URLSearchParams(searchParams);
    if (next.tab !== undefined) {
      if (next.tab === "push") params.delete("tab");
      else params.set("tab", next.tab);
    }
    if (next.id !== undefined) {
      if (next.id) params.set("id", next.id);
      else params.delete("id");
    }
    setSearchParams(params, { replace: true });
  };

  const refresh = async (campaign: PushCampaign | null, removedId?: string) => {
    if (campaign) queryClient.setQueryData(["admin", "push", "campaign", campaign.id], campaign);
    if (removedId) queryClient.removeQueries({ queryKey: ["admin", "push", "campaign", removedId] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "push"] });
  };

  const onPanelChanged = (campaign: PushCampaign | null) => {
    const removedId = campaign ? undefined : selectedId ?? undefined;
    void refresh(campaign, removedId);
    updateParams({ id: campaign ? campaign.id : null });
  };

  const rows = campaigns.data ?? [];
  const pendingCount = metrics.data?.pending ?? 0;
  const panelCampaign = selectedId && selected.data?.id === selectedId ? selected.data : null;
  const listError = campaigns.isError ? errorText(campaigns.error, "Could not load notifications.") : null;

  const columns: AlenioColumn<PushCampaign>[] = [
    {
      id: "notification",
      header: "Notification",
      primary: true,
      cell: (campaign) => (
        <span className="al-cell-entity">
          <TypeIcon type={campaign.type} size={16} boxed />
          <span className="al-cell-copy">
            <span className="al-cell-title">
              <span className="al-cell-title-text al-cell-title-text--wrap">{campaign.title}</span>
            </span>
            <span className="al-cell-sub">{campaign.body}</span>
          </span>
        </span>
      ),
    },
    {
      id: "audience",
      header: "Audience",
      width: "22%",
      hideBelow: "md",
      cell: (campaign) => <span className="al-cell-muted">{audienceLine(campaign)}</span>,
    },
    {
      id: "status",
      header: "Status",
      width: "152px",
      cell: (campaign) => (
        <StatusIndicator tone={STATUS_TONE[campaign.status] ?? "neutral"}>{statusLabel(campaign.status)}</StatusIndicator>
      ),
    },
    {
      id: "when",
      header: tab === "sent" ? "Sent" : "Scheduled / Sent",
      width: "136px",
      cell: (campaign) => <span className="al-cell-muted">{whenColumn(campaign)}</span>,
    },
    {
      id: "creator",
      header: "Created by",
      width: "96px",
      hideLabelWhenStacked: true,
      cell: (campaign) => {
        const name = campaign.createdBy?.name || campaign.createdBy?.email || "Staff";
        return (
          <span title={name} aria-label={`Created by ${name}`}>
            <UserAvatar
              user={campaign.createdBy ?? { name: "Staff" }}
              className="al-row-avatar"
              imgClassName="an-avatar-img"
              alt=""
            />
          </span>
        );
      },
    },
  ];

  const stats = [
    { key: "draft" as Filter, label: "Drafts", value: metrics.data?.drafts, Icon: FileText, tone: "purple" },
    { key: "pending" as Filter, label: "Pending Approval", value: metrics.data?.pending, Icon: Clock3, tone: "amber" },
    { key: "scheduled" as Filter, label: "Scheduled", value: metrics.data?.scheduled, Icon: CalendarClock, tone: "blue" },
    { key: "sent" as Filter, label: "Sent (Last 30 Days)", value: metrics.data?.sent30, Icon: CheckCircle2, tone: "green" },
  ];

  return (
    <div className="an-page" data-testid="admin-notifications">
      <header className="an-header">
        <div>
          <h1>Notifications</h1>
          <p>Create and manage push notifications sent to Alenio users.</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className="an-btn an-btn--primary an-btn--lg"
            onClick={() => setComposer({ campaign: null })}
            data-testid="an-create"
          >
            <Plus size={18} />
            Create Notification
          </button>
        ) : null}
      </header>

      <nav className="an-tabs" aria-label="Notification sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? "is-active" : ""}
            aria-current={tab === item.key ? "page" : undefined}
            onClick={() => updateParams({ tab: item.key, id: null })}
          >
            {item.label}
            {item.key === "approval" && pendingCount > 0 ? <span className="an-tab-badge">{pendingCount}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "templates" ? (
        <NotificationTemplates
          canCreate={canCreate}
          onUse={(template) =>
            setComposer({
              campaign: null,
              initial: {
                title: template.title,
                body: template.body,
                type: template.type,
                category: template.category,
                linkKind: template.linkKind,
                linkValue: template.linkValue,
              },
            })
          }
        />
      ) : (
        <div className={`an-layout${panelCampaign ? " has-panel" : ""}`}>
          <div className="an-main">
            <div className="an-stats">
              {stats.map(({ key, label, value, Icon, tone }) => (
                <button
                  key={key}
                  type="button"
                  className={`an-stat${tab === "push" && filter === key ? " is-active" : ""}`}
                  onClick={() => {
                    setFilter(key);
                    updateParams({ tab: "push", id: null });
                  }}
                >
                  <span className={`an-stat-icon an-tone-${tone}`}>
                    <Icon size={20} />
                  </span>
                  <span>
                    <small>{label}</small>
                    <strong>{value ?? "–"}</strong>
                  </span>
                </button>
              ))}
            </div>

            <section className="an-card al-ds">
              <header className="al-table-head">
                <h2 className="al-panel-title">
                  {tab === "push" ? "Notification Campaigns" : TABS.find((item) => item.key === tab)?.label}
                </h2>
                <div className="al-toolbar">
                  {tab === "push" ? (
                    <SegmentedControl
                      quiet
                      label="Filter by status"
                      value={filter}
                      onChange={setFilter}
                      options={FILTERS.map((item) => ({ value: item.key, label: item.label }))}
                    />
                  ) : null}
                  <SearchField value={query} onChange={setQuery} placeholder="Search notifications" label="Search notifications" />
                </div>
              </header>

              {listError ? (
                <p className="an-error" role="alert">
                  {listError}
                </p>
              ) : null}

              {listError && rows.length === 0 ? null : (
                <AlenioDataTable
                  flush
                  label="Notifications"
                  rows={rows}
                  columns={columns}
                  getRowId={(campaign) => campaign.id}
                  getRowLabel={(campaign) => `Open ${campaign.title}`}
                  getRowTestId={() => "an-row"}
                  onRowClick={(campaign) => updateParams({ id: campaign.id })}
                  rowClassName={(campaign) => (campaign.id === selectedId ? "is-selected" : undefined)}
                  rowActions={(campaign) => (
                    <RowActions
                      actions={campaignActions(
                        campaign,
                        canCreate,
                        () => updateParams({ id: campaign.id }),
                        (changed, removedId) => {
                          void refresh(changed, removedId);
                          if (changed) updateParams({ id: changed.id });
                          else if (removedId === selectedId) updateParams({ id: null });
                        },
                      )}
                      label={`More for ${campaign.title}`}
                      testId={`an-menu-${campaign.id}`}
                    />
                  )}
                  loading={campaigns.isLoading}
                  loadingRows={4}
                  emptyState={
                    <EmptyState
                      icon={<Send size={20} strokeWidth={2} />}
                      title={debouncedQuery ? "No notifications match your search" : "Nothing here yet"}
                      description={
                        tab === "approval"
                          ? "Notifications waiting for a second admin will show up here."
                          : canCreate
                            ? "Create a notification to get started."
                            : "Notifications your team creates will show up here."
                      }
                    />
                  }
                />
              )}
            </section>
          </div>

          {panelCampaign ? (
            <CampaignPanel
              key={`${panelCampaign.id}:${panelCampaign.status}`}
              campaign={panelCampaign}
              meId={me.id}
              meEmail={me.email}
              canCreate={canCreate}
              canApprove={canApprove}
              onClose={() => updateParams({ id: null })}
              onEdit={(campaign) => setComposer({ campaign })}
              onChanged={onPanelChanged}
            />
          ) : null}
        </div>
      )}

      {composer ? (
        <NotificationComposer
          campaign={composer.campaign}
          initial={composer.initial}
          onClose={() => setComposer(null)}
          onSaved={(campaign) => {
            setComposer(null);
            void refresh(campaign);
            updateParams({ tab: tab === "templates" ? "push" : tab, id: campaign.id });
          }}
        />
      ) : null}
    </div>
  );
}
