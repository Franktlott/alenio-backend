import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function TempsToolbar({ children, trailing, className }: Props) {
  return (
    <div className={["temps-toolbar", className].filter(Boolean).join(" ")}>
      <div className="temps-toolbar-main">{children}</div>
      {trailing ? <div className="temps-toolbar-trailing">{trailing}</div> : null}
    </div>
  );
}
