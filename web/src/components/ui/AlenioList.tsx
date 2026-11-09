import { useId, type ReactNode } from "react";
import { Skeleton } from "./EmptyState";
import { Pagination } from "./Pagination";

export function AlenioList({
  label,
  loading = false,
  loadingRows = 5,
  empty,
  pagination,
  children,
  testId,
}: {
  label: string;
  loading?: boolean;
  loadingRows?: number;
  /** Rendered instead of the list when not loading and there are no rows. */
  empty?: ReactNode;
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; itemLabel?: string };
  children?: ReactNode;
  testId?: string;
}) {
  if (loading) {
    return (
      <div className="al-list" aria-busy="true" aria-label={label}>
        <ul className="al-list-rows" aria-hidden>
          {Array.from({ length: loadingRows }, (_, i) => (
            <li key={i} className="al-row al-row--skeleton">
              <Skeleton width={18} height={18} radius={9} />
              <span className="al-row-skel-lines">
                <Skeleton width={i % 2 ? "48%" : "62%"} height={12} />
                <Skeleton width="34%" height={10} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (empty) return <div className="al-list al-list--empty">{empty}</div>;
  return (
    <div className="al-list" data-testid={testId}>
      <ul className="al-list-rows" aria-label={label}>
        {children}
      </ul>
      {pagination ? <Pagination {...pagination} /> : null}
    </div>
  );
}

/**
 * Two-line list row. The title is the row's open control (stretched over the row),
 * so leading/trailing controls stay independent of row navigation.
 */
export function AlenioListRow({
  title,
  titleAddon,
  description,
  meta,
  leading,
  trailing,
  onOpen,
  openLabel,
  selected = false,
  muted = false,
  wrapTitle = false,
  className,
  testId,
  expanded,
  children,
}: {
  title: ReactNode;
  /** Small inline items after the title (tags, counts). */
  titleAddon?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  selected?: boolean;
  /** De-emphasise the title (e.g. completed items). */
  muted?: boolean;
  wrapTitle?: boolean;
  className?: string;
  testId?: string;
  /** Makes the row a disclosure: the title toggles `children`, shown below the row while expanded. */
  expanded?: boolean;
  children?: ReactNode;
}) {
  const panelId = useId();
  const expandable = expanded !== undefined;
  const cls = [
    "al-row",
    onOpen ? "is-clickable" : "",
    selected ? "is-selected" : "",
    muted ? "is-muted" : "",
    wrapTitle ? "al-row--wrap" : "",
    expandable && expanded ? "is-expanded" : "",
    expandable ? "" : (className ?? ""),
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {leading ? <span className="al-row-leading">{leading}</span> : null}
      <span className="al-row-body">
        <span className="al-row-line">
          {onOpen ? (
            <button
              type="button"
              className="al-row-title al-row-open"
              onClick={onOpen}
              aria-label={openLabel}
              aria-expanded={expandable ? expanded : undefined}
              aria-controls={expandable && expanded ? panelId : undefined}
            >
              {title}
            </button>
          ) : (
            <span className="al-row-title">{title}</span>
          )}
          {titleAddon ? <span className="al-row-addon">{titleAddon}</span> : null}
        </span>
        {description ? <span className="al-row-desc">{description}</span> : null}
        {meta ? <span className="al-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="al-row-trailing">{trailing}</span> : null}
    </>
  );
  if (!expandable) {
    return (
      <li className={cls} data-testid={testId}>
        {content}
      </li>
    );
  }
  return (
    <li className={`al-row-item${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`} data-testid={testId}>
      <div className={cls}>{content}</div>
      {expanded ? (
        <div className="al-row-panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </li>
  );
}
