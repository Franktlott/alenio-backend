import type { ReactNode } from "react";

export type TempsSummaryItem = {
  label: string;
  value: ReactNode;
};

type Props = {
  items: TempsSummaryItem[];
  className?: string;
};

export function TempsSummaryBar({ items, className }: Props) {
  return (
    <dl className={["temps-summary-bar", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <div key={item.label} className="temps-summary-item">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
