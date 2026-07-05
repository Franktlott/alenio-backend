import { useState } from "react";
import type { TempCheckTemplateRow } from "../../lib/api";
import { formatTempCheckSchedule, formatTempCheckWindow } from "../../lib/temp-checks-display";
import { GoLeaderPinGate } from "./GoLeaderPinGate";
import type { GoLeaderSession } from "../../lib/go-leader-session";

export type TempCheckStartLeader = {
  userId: string;
  name: string;
  role: string;
};

type Props = {
  template: TempCheckTemplateRow;
  hubToken: string;
  onCancel: () => void;
  onReady: (leader: TempCheckStartLeader) => void;
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

function TempCheckStartConfirm({
  template,
  leader,
  onStart,
  onBack,
}: {
  template: TempCheckTemplateRow;
  leader: TempCheckStartLeader;
  onStart: () => void;
  onBack: () => void;
}) {
  const itemCount = template.itemCount ?? template.items?.length ?? 0;

  return (
    <div className="go-walk-start-confirm go-temp-check-start-confirm" data-testid="go-temp-check-start-confirm">
      <div className="go-walk-start-confirm-card">
        <p className="go-walk-start-confirm-kicker">Confirm check leader</p>
        <h1 className="go-walk-start-confirm-title">Who is running this temp check?</h1>
        <p className="go-walk-start-confirm-sub">
          Confirm your identity before readings begin. This check will be recorded under your name.
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
          <p className="go-walk-start-confirm-walk-label">Program</p>
          <h2 className="go-walk-start-confirm-walk-name">{template.name}</h2>
          <p className="go-walk-start-confirm-walk-meta">
            <span>{formatTempCheckSchedule(template)}</span>
            <span aria-hidden>•</span>
            <span>{itemCount} temperature items</span>
            <span aria-hidden>•</span>
            <span>Window {formatTempCheckWindow(template)}</span>
          </p>
        </div>

        <div className="go-walk-start-confirm-actions">
          <button type="button" className="go-walk-start-confirm-start" onClick={onStart} data-testid="go-temp-check-start-begin">
            Start check as {leader.name.split(" ")[0] || leader.name}
          </button>
          <button type="button" className="go-walk-start-confirm-back" onClick={onBack}>
            Use a different PIN
          </button>
        </div>
      </div>
    </div>
  );
}

export function GoTempCheckLeaderStartFlow({ template, hubToken, onCancel, onReady }: Props) {
  const [phase, setPhase] = useState<"pin" | "confirm">("pin");
  const [leader, setLeader] = useState<TempCheckStartLeader | null>(null);

  if (phase === "pin") {
    return (
      <GoLeaderPinGate
        hubToken={hubToken}
        title="Enter your PIN to start this temp check"
        subtitle="Leaders must sign in with their Alenio Go PIN before temperature readings can begin."
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
    <TempCheckStartConfirm
      template={template}
      leader={leader}
      onStart={() => onReady(leader)}
      onBack={() => {
        setLeader(null);
        setPhase("pin");
      }}
    />
  );
}
