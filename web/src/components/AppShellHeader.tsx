import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";

type Props = {
  onSignOutNavigate: (path: string) => void;
  active: "dashboard" | "chat";
};

export function AppShellHeader({ onSignOutNavigate, active }: Props) {
  const signOut = async () => {
    try {
      await getAuthClient().signOut();
    } catch {
      /* ignore */
    }
    clearAccessToken();
    onSignOutNavigate("/login?reason=session");
  };

  const linkStyle = (isActive: boolean): CSSProperties => ({
    color: isActive ? "#fff" : "rgba(255,255,255,0.88)",
    fontWeight: isActive ? 700 : 500,
    textDecoration: "none",
    fontSize: "0.875rem",
    padding: "6px 10px",
    borderRadius: 8,
    background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
  });

  return (
    <header className="dashboard-header">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link to="/dashboard" className="app-header-logo-link" aria-label="Alenio home" data-testid="nav-home-logo">
          <img src="/alenio-logo-white.png" alt="Alenio" className="app-header-logo" />
        </Link>
        <span className="dashboard-header-sub">Team admin</span>
        <nav style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }} aria-label="Main">
          <Link to="/dashboard" style={linkStyle(active === "dashboard")} data-testid="nav-dashboard">
            Dashboard
          </Link>
          <Link to="/chat" style={linkStyle(active === "chat")} data-testid="nav-chat">
            Team chat
          </Link>
        </nav>
      </div>
      <button type="button" className="dashboard-signout" onClick={signOut} data-testid="sign-out-button">
        Sign out
      </button>
    </header>
  );
}
