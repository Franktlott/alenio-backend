import type { ReactNode } from "react";

export function FilterBar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="al-filterbar">
      <div className="al-filterbar-main">{children}</div>
      {end ? <div className="al-filterbar-end">{end}</div> : null}
    </div>
  );
}
