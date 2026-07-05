import { useState } from "react";
import type { WalkTemplateRow } from "../../lib/api";
import { postTeamVerifyGoLeaderPin } from "../../lib/api";
import { GoLeaderPinGate } from "./GoLeaderPinGate";
import type { GoLeaderSession } from "../../lib/go-leader-session";

export type WalkStartLeader = {
  userId: string;
  name: string;
  role: string;
};

type Props = {
  template: WalkTemplateRow;
  hubToken?: string;
  teamId?: string;
  onCancel: () => void;
  onReady: (leader: WalkStartLeader) => void;
};

function leaderInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "L";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Leader";
}

function WalkStartConfirm({
  template,
  leader,
  onStart,
  onBack,
  backLabel,
}: {
  template: WalkTemplateRow;
  leader: WalkStartLeader;
  onStart: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const itemCount = template.itemCount ?? template.items?.length ?? 0;

  return (
    <div className="go-walk-start-confirm" data-testid="go-walk-start-confirm">
      <div className="go-walk-start-confirm-card">
        <p className="go-walk-start-confirm-kicker">Confirm walk leader</p>
        <h1 className="go-walk-start-confirm-title">Who is starting this walk?</h1>
        <p className="go-walk-start-confirm-sub">
          Confirm your identity before observations begin. This walk will be recorded under your name.
        </p>

        <div className="go-walk-start-confirm-leader">
          <span className="go-walk-start-confirm-avatar" aria-hidden>
            {leaderInitials(leader.name)}
          </span>
          <div className="go-walk-start-confirm-leader-copy">
            <strong className="go-walk-start-confirm-leader-name">{leader.name}</strong>
            <span className="go-walk-start-confirm-leader-role">{roleLabel(leader.role)}</span>
          </div>
        </div>

        <div className="go-walk-start-confirm-walk">
          <p className="go-walk-start-confirm-walk-label">Walk</p>
          <h2 className="go-walk-start-confirm-walk-name">{template.name}</h2>
          <p className="go-walk-start-confirm-walk-meta">
            <span>📍 {template.workplace}</span>
            <span aria-hidden>•</span>
            <span>{itemCount} observations</span>
          </p>
        </div>

        <div className="go-walk-start-confirm-actions">
          <button type="button" className="go-walk-start-confirm-start" onClick={onStart} data-testid="go-walk-start-begin">
            Start walk as {leader.name.split(" ")[0] || leader.name}
          </button>
          <button type="button" className="go-walk-start-confirm-back" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GoWalkLeaderStartFlow({ template, hubToken, teamId, onCancel, onReady }: Props) {
  const requiresPin = Boolean(hubToken || teamId);
  const [phase, setPhase] = useState<"pin" | "confirm">(requiresPin ? "pin" : "confirm");
  const [leader, setLeader] = useState<WalkStartLeader | null>(null);

  if (phase === "pin" && requiresPin) {
    return (
      <GoLeaderPinGate
        hubToken={hubToken}
        verifyPin={
          teamId
            ? async (pin) => {
                const verified = await postTeamVerifyGoLeaderPin(teamId, pin);
                return verified;
              }
            : undefined
        }
        title="Enter your PIN to start this walk"
        subtitle="Leaders must sign in with their Alenio Go PIN before a walk can begin."
        onCancel={onCancel}
        onVerified={(session: GoLeaderSession) => {
          setLeader({
            userId: session.userId,
            name: session.name,
            role: session.role,
          });
          setPhase("confirm");
        }}
      />
    );
  }

  if (!leader) return null;

  return (
    <WalkStartConfirm
      template={template}
      leader={leader}
      onStart={() => onReady(leader)}
      onBack={() => {
        if (requiresPin) {
          setLeader(null);
          setPhase("pin");
          return;
        }
        onCancel();
      }}
      backLabel="Use a different PIN"
    />
  );
}
