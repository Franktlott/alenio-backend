import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Pagination } from "./Pagination";
import { Skeleton } from "./EmptyState";

export type SortDirection = "asc" | "desc";
export type SortState = { columnId: string; direction: SortDirection };

export type AlenioColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  /** Any CSS width, e.g. "140px" or "20%". Omit to let the column flex. */
  width?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
  /** Hide the column when the table container is narrower than sm (640px) or md (860px). */
  hideBelow?: "sm" | "md";
  /** Rendered as the card title in the stacked (narrow) layout. */
  primary?: boolean;
  /** Hide the header label in the stacked layout (e.g. avatars, icons). */
  hideLabelWhenStacked?: boolean;
  className?: string;
};

export type AlenioDataTableProps<T> = {
  rows: T[];
  columns: AlenioColumn<T>[];
  getRowId: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
  onRowClick?: (row: T) => void;
  getRowLabel?: (row: T) => string;
  loading?: boolean;
  loadingRows?: number;
  emptyState?: ReactNode;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  rowActions?: (row: T) => ReactNode;
  initialSort?: SortState | null;
  /** Controlled sort; pass with onSortChange. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  pageSize?: number;
  itemLabel?: string;
  density?: "comfortable" | "compact";
  /** Drop the outer border when the table sits inside a card. */
  flush?: boolean;
  /** Dim existing rows while a refetch is in flight. */
  busy?: boolean;
  rowClassName?: (row: T) => string | undefined;
  testId?: string;
  getRowTestId?: (row: T) => string;
};

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function stop(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

export function AlenioDataTable<T>({
  rows,
  columns,
  getRowId,
  label,
  onRowClick,
  getRowLabel,
  loading = false,
  loadingRows = 5,
  emptyState,
  selectable = false,
  selectedIds,
  onSelectionChange,
  rowActions,
  initialSort = null,
  sort: controlledSort,
  onSortChange,
  pageSize,
  itemLabel = "rows",
  density = "comfortable",
  flush = false,
  busy = false,
  rowClassName,
  testId,
  getRowTestId,
}: AlenioDataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState | null>(initialSort);
  const sort = controlledSort !== undefined ? controlledSort : innerSort;
  const [page, setPage] = useState(0);

  const setSort = (next: SortState | null) => {
    if (controlledSort === undefined) setInnerSort(next);
    onSortChange?.(next);
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    const get = col.sortValue;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const av = get(a.row);
        const bv = get(b.row);
        const aEmpty = av === null || av === undefined || av === "";
        const bEmpty = bv === null || bv === undefined || bv === "";
        // Empty values stay last in either direction.
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        return compareValues(av, bv) * factor || a.index - b.index;
      })
      .map((x) => x.row);
  }, [rows, columns, sort]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const visible = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const visibleIds = visible.map(getRowId);
  const selectedOnPage = visibleIds.filter((id) => selected.has(id)).length;
  const allOnPage = visibleIds.length > 0 && selectedOnPage === visibleIds.length;
  const someOnPage = selectedOnPage > 0 && !allOnPage;

  const headCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headCheckbox.current) headCheckbox.current.indeterminate = someOnPage;
  }, [someOnPage]);

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (allOnPage) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    onSelectionChange([...next]);
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  };

  const onHeaderSort = (col: AlenioColumn<T>) => {
    if (!sort || sort.columnId !== col.id) setSort({ columnId: col.id, direction: "asc" });
    else if (sort.direction === "asc") setSort({ columnId: col.id, direction: "desc" });
    else setSort(null);
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row);
    }
  };

  const hideCls = (col: AlenioColumn<T>) => (col.hideBelow ? ` al-dt-hide-${col.hideBelow}` : "");
  const alignCls = (col: AlenioColumn<T>) => (col.align && col.align !== "left" ? ` al-dt-align-${col.align}` : "");
  const showEmpty = !loading && rows.length === 0;

  return (
    <div className={`al-dt al-dt--${density}${flush ? " al-dt--flush" : ""}${busy ? " al-dt--busy" : ""}`} data-testid={testId}>
      <table className="al-dt-table" aria-label={label} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className="al-dt-select">
                <input
                  ref={headCheckbox}
                  type="checkbox"
                  className="al-checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label={allOnPage ? "Deselect all rows on this page" : "Select all rows on this page"}
                  disabled={visibleIds.length === 0}
                />
              </th>
            ) : null}
            {columns.map((col) => {
              const active = sort?.columnId === col.id;
              const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : col.sortable ? "none" : undefined;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`al-dt-th${alignCls(col)}${hideCls(col)}${col.className ? ` ${col.className}` : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable && col.sortValue ? (
                    <button type="button" className={`al-dt-sort${active ? " is-active" : ""}`} onClick={() => onHeaderSort(col)}>
                      {col.header}
                      {active ? (
                        sort!.direction === "asc" ? (
                          <ArrowUp size={14} strokeWidth={2.2} aria-hidden />
                        ) : (
                          <ArrowDown size={14} strokeWidth={2.2} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={14} strokeWidth={2} aria-hidden className="al-dt-sort-idle" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
            {rowActions ? (
              <th scope="col" className="al-dt-actions">
                <span className="al-sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0
            ? Array.from({ length: loadingRows }, (_, i) => (
                <tr key={`sk-${i}`} className="al-dt-row al-dt-row--skeleton" aria-hidden>
                  {selectable ? (
                    <td className="al-dt-select">
                      <Skeleton width={16} height={16} radius={4} />
                    </td>
                  ) : null}
                  {columns.map((col, ci) => (
                    <td key={col.id} className={`al-dt-td${hideCls(col)}`}>
                      <Skeleton width={ci === 0 ? "70%" : "55%"} height={12} />
                    </td>
                  ))}
                  {rowActions ? <td className="al-dt-actions" /> : null}
                </tr>
              ))
            : null}

          {!(loading && rows.length === 0)
            ? visible.map((row) => {
                const id = getRowId(row);
                const isSelected = selected.has(id);
                const extra = rowClassName?.(row);
                const cls = `al-dt-row${onRowClick ? " is-clickable" : ""}${isSelected ? " is-selected" : ""}${extra ? ` ${extra}` : ""}`;
                return (
                  <tr
                    key={id}
                    className={cls}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selectable ? isSelected : undefined}
                    aria-label={onRowClick && getRowLabel ? getRowLabel(row) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                    data-testid={getRowTestId?.(row)}
                  >
                    {selectable ? (
                      <td className="al-dt-select" onClick={stop}>
                        <input
                          type="checkbox"
                          className="al-checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(id)}
                          aria-label={`Select ${getRowLabel ? getRowLabel(row) : "row"}`}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={`al-dt-td${alignCls(col)}${hideCls(col)}${col.primary ? " al-dt-primary" : ""}${col.hideLabelWhenStacked ? " al-dt-nolabel" : ""}${col.className ? ` ${col.className}` : ""}`}
                        data-label={col.header}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className="al-dt-actions" onClick={stop} onKeyDown={stop}>
                        {rowActions(row)}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            : null}
        </tbody>
      </table>
      {showEmpty ? <div className="al-dt-empty">{emptyState ?? <p className="al-dt-empty-default">No {itemLabel} to show.</p>}</div> : null}
      {pageSize ? (
        <Pagination page={page} pageSize={pageSize} total={sorted.length} onPageChange={setPage} itemLabel={itemLabel} />
      ) : null}
    </div>
  );
}
