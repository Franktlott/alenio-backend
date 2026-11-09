import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { AlenioDataTable, Button, EmptyState, type AlenioColumn } from "../../components/ui";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { fetchStaffActivity, type StaffActivityRow } from "../../lib/admin-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-categories-drawer.css";
import "../discover/discover-manage.css";
import "./admin-users.css";

const PAGE_SIZE = 50;

const AREA_LABELS: Record<string, string> = {
  user: "Users",
  team: "Workspaces",
  organization: "Organizations",
  article: "Content",
  seneca: "Seneca",
  notification: "Notifications",
  pricing: "Pricing",
};

function areaLabel(targetType: string): string {
  return AREA_LABELS[targetType] ?? targetType.charAt(0).toUpperCase() + targetType.slice(1);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const COLUMNS: AlenioColumn<StaffActivityRow>[] = [
  {
    id: "summary",
    header: "What changed",
    primary: true,
    cell: (row) => <span className="au-activity-summary">{row.summary}</span>,
  },
  {
    id: "who",
    header: "Who",
    width: "200px",
    hideBelow: "md",
    cell: (row) => <span className="al-cell-muted">{row.actorEmail ?? "Unknown"}</span>,
  },
  {
    id: "area",
    header: "Area",
    width: "128px",
    cell: (row) => <span className="al-tag">{areaLabel(row.targetType)}</span>,
  },
  {
    id: "when",
    header: "When",
    width: "184px",
    cell: (row) => <span className="al-cell-muted">{formatWhen(row.createdAt)}</span>,
  },
];

/** Log of every change made by Alenio staff in the admin tools. */
export function AdminActivityPage() {
  const { me } = useEnterpriseShell();
  const allowed = staffCan(me, "activity.view");

  const activity = useInfiniteQuery({
    queryKey: ["admin", "activity"],
    queryFn: ({ pageParam }) => fetchStaffActivity({ before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: StaffActivityRow[]) =>
      last.length < PAGE_SIZE ? undefined : last[last.length - 1]?.createdAt,
    enabled: Boolean(me) && allowed,
    staleTime: 15_000,
  });

  if (me === undefined) return <EnterprisePageLoading label="Loading activity" />;
  if (me === null || !allowed) return <Navigate to="/settings" replace />;

  const rows = activity.data?.pages.flat() ?? [];
  const error =
    activity.error instanceof Error ? activity.error.message : activity.isError ? "Could not load activity." : null;

  return (
    <div className="dm-page au-page" data-testid="admin-activity">
      <header className="dm-hero">
        <img src="/alenio-home-hero-morning.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <span>Admin</span>
            <span aria-hidden>›</span>
            <span>Activity</span>
          </nav>
          <h1>Staff Activity</h1>
          <p>Every change Alenio staff make in the admin tools, newest first.</p>
        </div>
      </header>

      {error ? <p className="discover-error">{error}</p> : null}

      <div className="dm-grid au-activity-grid">
        <div className="dm-main">
          <section className="dm-card dm-articles al-ds" aria-label="Activity">
            <header className="al-table-head">
              <h2 className="al-panel-title">
                Changes{" "}
                <span className="al-seg-count">
                  {rows.length.toLocaleString()}
                  {activity.hasNextPage ? "+" : ""}
                </span>
              </h2>
            </header>

            {error && rows.length === 0 ? null : (
              <AlenioDataTable
                flush
                label="Staff activity"
                rows={rows}
                columns={COLUMNS}
                getRowId={(row) => row.id}
                getRowTestId={() => "activity-row"}
                loading={activity.isLoading}
                loadingRows={6}
                emptyState={
                  <EmptyState
                    icon={<History size={20} strokeWidth={2} />}
                    title="No changes yet"
                    description="When staff edit users, workspaces, content or Seneca, it shows up here."
                  />
                }
              />
            )}

            {activity.hasNextPage ? (
              <div className="al-pagination">
                <span className="al-pagination-info">Showing the newest {rows.length.toLocaleString()} changes</span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={activity.isFetchingNextPage}
                  onClick={() => void activity.fetchNextPage()}
                >
                  Load older
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
