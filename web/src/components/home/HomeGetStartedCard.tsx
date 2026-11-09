import { ChevronRight, Compass, KeyRound, Sparkles, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import type { WebTeamRow } from "../../lib/api";
import { setPersistedEnterpriseTeamId } from "../../lib/enterprise-selected-team";
import { WorkspaceCreateJoinModals } from "../WorkspaceCreateJoinModals";
import "./home-cards.css";

function Row({ icon, title, sub, to, onClick }: { icon: ReactNode; title: string; sub: string; to?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="hc-row-icon">{icon}</span>
      <span className="hc-row-copy">
        <span className="hc-row-title">{title}</span>
        <span className="hc-row-sub">{sub}</span>
      </span>
      <ChevronRight size={16} strokeWidth={2.3} className="hc-chev" />
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="hc-row">
          {body}
        </Link>
      ) : (
        <button type="button" className="hc-row" onClick={onClick}>
          {body}
        </button>
      )}
    </li>
  );
}

/** Takes Today's place on Home for people who aren't in a workspace yet. */
export function HomeGetStartedCard() {
  const { setTeams, setSelectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const enterWorkspace = (team: WebTeamRow) => {
    const row: WebTeamRow = {
      ...team,
      role: team.role ?? "owner",
      hasTeamFeatures: team.hasTeamFeatures ?? false,
      hasGoFeatures: team.hasGoFeatures ?? false,
    };
    setTeams((prev) => {
      const list = prev ?? [];
      return list.some((t) => t.id === row.id) ? list : [...list, row];
    });
    setPersistedEnterpriseTeamId(row.id);
    setSelectedTeamId(row.id);
  };

  return (
    <section className="hc-card" aria-label="Get started" data-testid="home-get-started">
      <div className="hc-head">
        <span className="hc-icon">
          <Sparkles size={18} strokeWidth={2.2} />
        </span>
        <span className="hc-head-copy">
          <span className="hc-title">Get started</span>
          <span className="hc-sub">A few ways to make Alenio yours</span>
        </span>
      </div>
      {info ? (
        <p className="hc-info" role="status">
          {info}
        </p>
      ) : null}
      <ul className="hc-list">
        <Row icon={<UserPlus size={16} strokeWidth={2.2} />} title="Find people" sub="Search for someone you know" to="/network?add=1" />
        <Row
          icon={<KeyRound size={16} strokeWidth={2.2} />}
          title="Join a workspace"
          sub="Enter your team's invite code"
          onClick={() => setJoinOpen(true)}
        />
        <Row icon={<Compass size={16} strokeWidth={2.2} />} title="Explore Discover" sub="Ideas and tools to help you grow" to="/discover" />
      </ul>
      <button type="button" className="hc-cta hc-cta--ghost" onClick={() => setCreateOpen(true)} data-testid="home-create-workspace">
        Create a workspace
      </button>
      <WorkspaceCreateJoinModals
        joinOpen={joinOpen}
        createOpen={createOpen}
        onCloseJoin={() => setJoinOpen(false)}
        onCloseCreate={() => setCreateOpen(false)}
        onRefreshWorkspaces={refreshMeAndTeams}
        onJoinSuccessInfo={(msg) => setInfo(msg)}
        onWorkspaceEntered={enterWorkspace}
      />
    </section>
  );
}
