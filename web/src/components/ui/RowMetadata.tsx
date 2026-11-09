import { Children, type ReactNode } from "react";

/** Secondary line of a row: items spaced evenly with dot separators; wraps on narrow screens. */
export function RowMetadata({ children, className }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children).filter((c) => c !== "");
  if (items.length === 0) return null;
  return (
    <span className={`al-meta${className ? ` ${className}` : ""}`}>
      {items.map((item, i) => (
        <span key={i} className="al-meta-item">
          {item}
        </span>
      ))}
    </span>
  );
}
