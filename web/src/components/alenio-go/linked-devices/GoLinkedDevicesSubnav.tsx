import { NavLink } from "react-router-dom";

export type GoLinkedDevicesTab = {
  id: string;
  label: string;
  to: string;
  badge?: number;
};

type Props = {
  tabs: GoLinkedDevicesTab[];
};

export function GoLinkedDevicesSubnav({ tabs }: Props) {
  return (
    <nav className="go-linked-devices-subnav" aria-label="Linked devices sections" data-testid="go-linked-devices-subnav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.to}
          end={tab.to === "/go/devices"}
          className={({ isActive }) =>
            `go-linked-devices-subnav-link${isActive ? " go-linked-devices-subnav-link--active" : ""}`
          }
          data-testid={`go-linked-devices-tab-${tab.id}`}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 ? (
            <span className="go-linked-devices-subnav-badge">{tab.badge}</span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
