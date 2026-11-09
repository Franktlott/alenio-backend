import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="al-pagination" aria-label="Pagination">
      <span className="al-pagination-info">
        {from}–{to} of {total} {itemLabel}
      </span>
      <div className="al-pagination-controls">
        <Button
          size="sm"
          variant="secondary"
          iconOnly
          icon={<ChevronLeft size={16} strokeWidth={2} />}
          aria-label="Previous page"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        />
        <span className="al-pagination-page" aria-live="polite">
          Page {page + 1} of {pages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          iconOnly
          icon={<ChevronRight size={16} strokeWidth={2} />}
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}
