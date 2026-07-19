import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Wider layout for table + detail panel pages */
  wide?: boolean;
  testId?: string;
};

export function TempsPageShell({ children, className, wide, testId }: Props) {
  return (
    <div
      className={["temps-page", wide ? "temps-page--wide" : "", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
