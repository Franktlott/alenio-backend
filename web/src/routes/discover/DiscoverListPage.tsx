import {
  BookOpen,
  CalendarClock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  LayoutGrid,
  PenLine,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  deleteDiscoverArticle,
  duplicateDiscoverArticle,
  fetchDiscoverArticles,
  fetchDiscoverCategories,
  fetchDiscoverMetrics,
  unpublishDiscoverArticle,
  type DiscoverAdminArticle,
  type DiscoverCategory,
  type DiscoverMetrics,
  type DiscoverStatus,
} from "../../lib/discover-api";
import { discoverCategoryColor } from "../../lib/discover-public-api";
import { staffCan } from "../../lib/staff-access";
import {
  AlenioDataTable,
  EmptyState,
  Pagination,
  RowActions,
  SearchField,
  Select,
  StatusIndicator,
  type AlenioColumn,
  type IndicatorTone,
  type RowAction,
} from "../../components/ui";
import { UserAvatar } from "../../components/UserAvatar";
import { DiscoverCategoriesDrawer } from "./DiscoverCategoriesDrawer";
import "./discover.css";
import "./discover-manage.css";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<DiscoverStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Unpublished",
  archived: "Archived",
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function CategoryCell({ category }: { category: DiscoverCategory | null }) {
  if (!category) return <span className="al-cell-muted">—</span>;
  return (
    <span className="al-ind dm-category-ind" title={category.name}>
      <span className="al-ind-dot" style={{ background: discoverCategoryColor(category.slug) }} aria-hidden />
      <span className="al-cell-title-text">{category.name}</span>
    </span>
  );
}

const STATUS_TONE: Record<DiscoverStatus, IndicatorTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  unpublished: "warning",
  archived: "neutral",
};

function StatusCell({ article }: { article: DiscoverAdminArticle }) {
  const live = article.status === "scheduled" && article.isLive;
  return (
    <span className="al-cell-copy">
      <StatusIndicator tone={live ? "success" : STATUS_TONE[article.status]}>
        {live ? "Published" : STATUS_LABEL[article.status]}
      </StatusIndicator>
      {article.pendingDraft ? (
        <StatusIndicator tone="warning" title="Edits saved but not live yet">
          Changes
        </StatusIndicator>
      ) : null}
    </span>
  );
}

export function DiscoverListPage() {
  const navigate = useNavigate();
  const { me } = useEnterpriseShell();
  const mayEdit = staffCan(me, "content.edit");
  const [searchParams, setSearchParams] = useSearchParams();
  const categoriesOpen = searchParams.get("categories") === "1";
  const setCategoriesOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("categories", "1");
    else next.delete("categories");
    setSearchParams(next, { replace: true });
  };
  const [metrics, setMetrics] = useState<DiscoverMetrics | null>(null);
  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [items, setItems] = useState<DiscoverAdminArticle[]>([]);
  const [published, setPublished] = useState<DiscoverAdminArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState<"updatedAt" | "publishedAt">("updatedAt");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DiscoverAdminArticle | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [showMissingFeatures, setShowMissingFeatures] = useState(false);

  useEffect(() => {
    if (me && !staffCan(me, "content.view")) navigate("/settings", { replace: true });
  }, [me, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Summary data: counts, categories, and the live set for the side panels.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchDiscoverMetrics(),
      fetchDiscoverCategories(),
      fetchDiscoverArticles({
        status: "published",
        sort: "publishedAt",
        pageSize: 50,
      }),
    ])
      .then(([nextMetrics, nextCategories, live]) => {
        if (cancelled) return;
        setMetrics(nextMetrics);
        setCategories(nextCategories);
        setPublished(live.items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load content.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // The table itself.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDiscoverArticles({
      q: query,
      status,
      categoryId,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((list) => {
        if (cancelled) return;
        setItems(list.items);
        setTotal(list.total);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load articles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, status, categoryId, sort, page, reloadTick]);

  const mostRead = useMemo(() => [...published].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5), [published]);

  const categoryFeatureCoverage = useMemo(() => {
    if (categories.length === 0) {
      return { pct: null as number | null, missing: [] as DiscoverCategory[] };
    }
    const featuredCategoryIds = new Set(
      published
        .filter((article) => article.featuredInCategory && article.category)
        .map((article) => article.category!.id),
    );
    const missing = categories.filter(
      (category) => !featuredCategoryIds.has(category.id),
    );
    const covered = categories.length - missing.length;
    return {
      pct: Math.round((covered / categories.length) * 100),
      missing,
    };
  }, [categories, published]);

  // Every category, busiest first, with its share of the published articles.
  const categoryShare = useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of published) {
      if (!article.category) continue;
      counts.set(article.category.id, (counts.get(article.category.id) ?? 0) + 1);
    }
    const rows = categories.map((category) => ({
      category,
      count: counts.get(category.id) ?? 0,
    }));
    rows.sort((a, b) => b.count - a.count || a.category.displayOrder - b.category.displayOrder);
    const max = Math.max(1, ...rows.map((row) => row.count));
    return rows.map((row) => ({
      ...row,
      pct: published.length ? Math.round((row.count / published.length) * 100) : 0,
      width: Math.round((row.count / max) * 100),
    }));
  }, [categories, published]);

  const runRow = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setPage(1);
      setReloadTick((tick) => tick + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const resetAnd = (fn: () => void) => {
    setPage(1);
    fn();
  };

  const articleActions = (article: DiscoverAdminArticle): RowAction[] => {
    const busy = busyId === article.id;
    const actions: RowAction[] = [
      {
        id: "open",
        label: mayEdit ? "Edit" : "Open",
        icon: <Pencil size={15} strokeWidth={2} />,
        onSelect: () => navigate(`/admin/discover/${article.id}`),
      },
      {
        id: "preview",
        label: "Preview",
        icon: <Eye size={15} strokeWidth={2} />,
        onSelect: () => navigate(`/admin/discover/${article.id}?preview=1`),
      },
    ];
    if (!mayEdit) return actions;
    actions.push({
      id: "duplicate",
      label: "Duplicate",
      icon: <Copy size={15} strokeWidth={2} />,
      disabled: busy,
      onSelect: () =>
        void runRow(article.id, async () => {
          const copy = await duplicateDiscoverArticle(article.id);
          navigate(`/admin/discover/${copy.id}`);
        }),
    });
    if (article.status === "published" || article.status === "scheduled") {
      actions.push({
        id: "unpublish",
        label: "Unpublish",
        icon: <EyeOff size={15} strokeWidth={2} />,
        disabled: busy,
        onSelect: () => void runRow(article.id, () => unpublishDiscoverArticle(article.id)),
      });
    }
    actions.push({
      id: "delete",
      label: "Delete",
      icon: <Trash2 size={15} strokeWidth={2} />,
      tone: "danger",
      disabled: busy,
      onSelect: () => setPendingDelete(article),
    });
    return actions;
  };

  const columns: AlenioColumn<DiscoverAdminArticle>[] = [
    {
      id: "article",
      header: "Article",
      primary: true,
      cell: (article) => (
        <span className="al-cell-entity">
          {article.coverImageUrl ? (
            <img className="al-cell-thumb" src={article.coverImageUrl} alt="" />
          ) : (
            <span className="al-cell-thumb al-cell-thumb--blank">
              <BookOpen size={16} strokeWidth={2} />
            </span>
          )}
          <span className="al-cell-copy">
            <span className="al-cell-title">
              <span className="al-cell-title-text al-cell-title-text--wrap">{article.title || "Untitled"}</span>
              {article.isFeatured ? (
                <span className="dm-featured" title="Featured on Home">
                  <Sparkles size={11} strokeWidth={2.4} />
                </span>
              ) : null}
            </span>
            <span className="al-cell-sub">{article.excerpt || `Updated ${formatWhen(article.updatedAt)}`}</span>
          </span>
        </span>
      ),
    },
    {
      id: "category",
      header: "Category",
      width: "124px",
      cell: (article) => <CategoryCell category={article.category} />,
    },
    {
      id: "status",
      header: "Status",
      width: "112px",
      cell: (article) => <StatusCell article={article} />,
    },
    {
      id: "published",
      header: "Last published",
      width: "132px",
      cell: (article) => (
        <span className="al-cell-copy">
          <span className="al-cell-muted">
            {article.status === "scheduled" && !article.isLive
              ? formatWhen(article.scheduledAt)
              : formatWhen(article.lastPublishedAt ?? article.publishedAt)}
          </span>
          {article.lastPublishedBy ? (
            <span
              className="al-cell-sub al-cell-inline"
              title={article.lastPublishedBy.email}
              data-testid={`dm-published-by-${article.id}`}
            >
              <UserAvatar user={article.lastPublishedBy} className="dm-by-avatar" imgClassName="dm-by-avatar-img" alt="" />
              <span className="al-cell-title-text">
                {article.lastPublishedBy.name?.trim() || article.lastPublishedBy.email}
              </span>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "views",
      header: "Views",
      width: "84px",
      align: "right",
      cell: (article) =>
        article.status === "draft" ? (
          <span className="al-cell-muted">—</span>
        ) : (
          <span className="al-cell-num">{formatCount(article.viewCount)}</span>
        ),
    },
  ];

  return (
    <div className="dm-page" data-testid="discover-admin">
      <header className="dm-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/discover">Discover</Link>
            <span aria-hidden>›</span>
            <span>Content</span>
          </nav>
          <h1>Discover Management</h1>
          <p>Create, organize, and publish content to inspire growth across Alenio.</p>
        </div>
      </header>

      <ContentSectionTabs active="discover" />

      {error ? <p className="discover-error">{error}</p> : null}

      <div className="dm-grid">
        <div className="dm-main">
          <section className="dm-stats" aria-label="Content summary">
            <div className="dm-stat">
              <span className="dm-stat-icon">
                <FileText size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{metrics ? formatCount(metrics.published) : "—"}</strong>
                <span>Published</span>
              </div>
            </div>
            <div className="dm-stat">
              <span className="dm-stat-icon">
                <PenLine size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{metrics ? formatCount(metrics.drafts) : "—"}</strong>
                <span>Drafts</span>
              </div>
            </div>
            <div className="dm-stat">
              <span className="dm-stat-icon">
                <CalendarClock size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{metrics ? formatCount(metrics.scheduled) : "—"}</strong>
                <span>Scheduled</span>
              </div>
            </div>
            <div className="dm-stat">
              <span className="dm-stat-icon">
                <Eye size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{metrics ? formatCount(metrics.views) : "—"}</strong>
                <span>Total views</span>
              </div>
            </div>
            <button
              type="button"
              className="dm-stat dm-stat--action"
              data-testid="dm-stat-category-feature-pct"
              onClick={() => setShowMissingFeatures(true)}
              aria-haspopup="dialog"
              title="See categories missing a featured article"
            >
              <span className="dm-stat-icon">
                <Sparkles size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>
                  {categoryFeatureCoverage.pct == null
                    ? "—"
                    : `${categoryFeatureCoverage.pct}%`}
                </strong>
                <span>% with a feature</span>
              </div>
            </button>
          </section>

          {metrics && metrics.featured > 6 ? (
            <p className="dm-note">
              {metrics.featured} articles are featured. The Home row works best with six or fewer.
            </p>
          ) : null}

          <section className="dm-card dm-articles al-ds" aria-label="Articles">
            <header className="al-table-head">
              <h2 className="al-panel-title">
                Articles <span className="al-seg-count">{formatCount(total)}</span>
              </h2>
              <div className="al-toolbar">
                <SearchField
                  value={q}
                  onChange={(value) => resetAnd(() => setQ(value))}
                  placeholder="Search articles"
                  label="Search articles"
                />
                <Select
                  value={status}
                  aria-label="Filter by status"
                  onChange={(event) => resetAnd(() => setStatus(event.target.value))}
                >
                  <option value="">All statuses</option>
                  <option value="published">Published</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="draft">Draft</option>
                  <option value="unpublished">Unpublished</option>
                  <option value="archived">Archived</option>
                </Select>
                <Select
                  value={categoryId}
                  aria-label="Filter by category"
                  onChange={(event) => resetAnd(() => setCategoryId(event.target.value))}
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={sort}
                  aria-label="Sort articles"
                  onChange={(event) => resetAnd(() => setSort(event.target.value as "updatedAt" | "publishedAt"))}
                >
                  <option value="updatedAt">Last updated</option>
                  <option value="publishedAt">Published date</option>
                </Select>
              </div>
            </header>

            <AlenioDataTable
              flush
              label="Articles"
              rows={items}
              columns={columns}
              getRowId={(article) => article.id}
              getRowLabel={(article) => `Open ${article.title || "Untitled"}`}
              getRowTestId={(article) => `dm-row-${article.id}`}
              onRowClick={(article) => navigate(`/admin/discover/${article.id}`)}
              rowActions={(article) => (
                <RowActions
                  actions={articleActions(article)}
                  label={`Actions for ${article.title || "article"}`}
                  testId={`dm-menu-${article.id}`}
                />
              )}
              loading={loading}
              busy={loading && items.length > 0}
              loadingRows={5}
              emptyState={
                <EmptyState
                  icon={<Sparkles size={20} strokeWidth={2} />}
                  title={total === 0 && !query && !status && !categoryId ? "No articles yet" : "Nothing matches"}
                  description={
                    total === 0 && !query && !status && !categoryId
                      ? "Write the first article and it will show up here and in Discover."
                      : "Try a different search or clear the filters."
                  }
                />
              }
            />
            <Pagination
              page={page - 1}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={(next) => setPage(next + 1)}
              itemLabel="articles"
            />
          </section>
        </div>

        <aside className="dm-side">
          {mayEdit ? (
            <Link className="dm-new" to="/admin/discover/new" data-testid="dm-new-article">
              <Plus size={18} strokeWidth={2.4} />
              New Article
            </Link>
          ) : null}

          <section className="dm-card dm-panel" aria-label="Most read">
            <div className="dm-panel-head">
              <Eye size={15} strokeWidth={2.2} />
              <h3>Most read</h3>
            </div>
            {mostRead.length === 0 ? (
              <p className="dm-panel-empty">Views appear here once articles are published.</p>
            ) : (
              <ol className="dm-ranked">
                {mostRead.map((article, index) => (
                  <li key={article.id}>
                    <Link to={`/admin/discover/${article.id}`}>
                      <span className="dm-rank">{index + 1}</span>
                      <span className="dm-ranked-copy">
                        <span className="dm-ranked-title">{article.title}</span>
                        <span className="dm-ranked-sub">{article.category?.name ?? "Uncategorized"}</span>
                      </span>
                      <span className="dm-ranked-views">{formatCount(article.viewCount)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="dm-card dm-panel" aria-label="Top categories">
            <div className="dm-panel-head">
              <LayoutGrid size={15} strokeWidth={2.2} />
              <h3>Top categories</h3>
              <button type="button" className="dm-panel-link" onClick={() => setCategoriesOpen(true)}>
                Manage
              </button>
            </div>
            {categoryShare.length === 0 ? (
              <p className="dm-panel-empty">Add categories to group articles in Discover.</p>
            ) : (
              <ul className="dm-bars">
                {categoryShare.map((row) => (
                  <li key={row.category.id}>
                    <span className="dm-bar-label">{row.category.name}</span>
                    <span className="dm-bar-track">
                      <span
                        className="dm-bar-fill"
                        style={{
                          width: `${row.width}%`,
                          background: discoverCategoryColor(row.category.slug),
                        }}
                      />
                    </span>
                    <span className="dm-bar-pct">{row.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <DiscoverCategoriesDrawer
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        onChanged={() => setReloadTick((tick) => tick + 1)}
        counts={Object.fromEntries(categoryShare.map((row) => [row.category.id, row.count]))}
      />

      {showMissingFeatures ? (
        <div
          className="discover-confirm"
          role="presentation"
          onClick={() => setShowMissingFeatures(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-missing-features-title"
            data-testid="dm-missing-features-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="dm-missing-features-title">Categories without a feature</h2>
            {categoryFeatureCoverage.missing.length === 0 ? (
              <p>Every category has a featured article.</p>
            ) : (
              <>
                <p>
                  {categoryFeatureCoverage.missing.length === 1
                    ? "1 category still needs a featured article."
                    : `${categoryFeatureCoverage.missing.length} categories still need a featured article.`}
                </p>
                <ul className="dm-missing-features">
                  {categoryFeatureCoverage.missing.map((category) => (
                    <li key={category.id}>
                      <button
                        type="button"
                        className="dm-missing-feature"
                        onClick={() => {
                          setShowMissingFeatures(false);
                          resetAnd(() => setCategoryId(category.id));
                        }}
                      >
                        <span
                          className="al-ind-dot"
                          style={{
                            background: discoverCategoryColor(category.slug),
                          }}
                          aria-hidden
                        />
                        <span>{category.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="discover-actions">
              <button
                type="button"
                className="discover-btn"
                onClick={() => setShowMissingFeatures(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="discover-confirm" role="presentation" onClick={() => setPendingDelete(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="discover-delete-title">Delete this article?</h2>
            <p>“{pendingDelete.title}” will be removed for administrators and for Alenio.</p>
            <div className="discover-actions">
              <button type="button" className="discover-btn" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="discover-btn discover-btn-danger"
                onClick={() => {
                  const article = pendingDelete;
                  setPendingDelete(null);
                  void runRow(article.id, () => deleteDiscoverArticle(article.id));
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
