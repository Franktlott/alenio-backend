import type { MemberStandardsCompliance } from "../lib/workplace-standards";

type Props = {
  displayName: string;
  isSelf?: boolean;
  roleLabel: string;
  roleBadgeClass?: string;
  joinedAt?: string | null;
  lastActiveLabel?: string | null;
  standardsCompliance?: MemberStandardsCompliance;
  onCheckIn?: () => void;
  onRecognition?: () => void;
  onGoal?: () => void;
};

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function standingFromCompliance(compliance: MemberStandardsCompliance | undefined): {
  label: string;
  tone: "good" | "attention";
} {
  if (!compliance) return { label: "Standing unknown", tone: "attention" };
  if (compliance.statusBadge === "On track") return { label: "In Good Standing", tone: "good" };
  return { label: compliance.statusBadge, tone: "attention" };
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MemberProfileHeader({
  displayName,
  isSelf = false,
  roleLabel,
  roleBadgeClass = "",
  joinedAt,
  lastActiveLabel,
  standardsCompliance,
  onCheckIn,
  onRecognition,
  onGoal,
}: Props) {
  const standing = standingFromCompliance(standardsCompliance);

  return (
    <header className="enterprise-mo-header">
      <div className="enterprise-mo-header-main">
        <div className="enterprise-mo-header-titles">
          <h1 className="enterprise-mo-name">
            {displayName}
            {isSelf ? " (You)" : ""}
          </h1>
          <div className="enterprise-mo-badges">
            <span className={`enterprise-mo-role-badge ${roleBadgeClass}`}>{roleLabel}</span>
            <span
              className={`enterprise-mo-standing-badge${standing.tone === "good" ? " is-good" : " is-attention"}`}
            >
              {standing.label}
            </span>
          </div>
          <p className="enterprise-mo-meta">
            <span>
              Member since <strong>{joinedAt ? formatDateOnly(joinedAt) : "—"}</strong>
            </span>
            <span className="enterprise-mo-meta-sep" aria-hidden>
              ·
            </span>
            <span>
              Last active <strong>{lastActiveLabel?.trim() || "—"}</strong>
            </span>
          </p>
        </div>
        <div className="enterprise-mo-actions">
          <button type="button" className="enterprise-mo-action-btn" onClick={() => onCheckIn?.()}>
            <IconPlus /> Check-in
          </button>
          <button type="button" className="enterprise-mo-action-btn" onClick={() => onRecognition?.()}>
            <IconPlus /> Recognition
          </button>
          <button type="button" className="enterprise-mo-action-btn" onClick={() => onGoal?.()}>
            <IconPlus /> Goal
          </button>
        </div>
      </div>
    </header>
  );
}
