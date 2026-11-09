import type { ReactNode } from "react";
import { Popover } from "../ui/Menu";

/** Legacy row "…" menu for pages not yet on `RowActions`; shares positioning with `Menu`. */
export function RowMenu({
  anchor,
  onClose,
  children,
  className = "dm-menu",
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover anchor={anchor} onClose={() => onClose()} className={className} role="menu">
      {children}
    </Popover>
  );
}
