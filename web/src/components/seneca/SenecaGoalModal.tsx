import { useEffect, useMemo, useState } from "react";
import { createDevelopmentGoal, fetchWebTeam, type WebTeamMemberRow } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { fetchSenecaQuickGoal } from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer, SenecaIcon } from "./SenecaShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Phase = "prompt" | "generating" | "review";

const MAX_STEPS = 5;

function memberLabel(member: WebTeamMemberRow): string {
  return member.user.name ?? member.user.email ?? "Team member";
}

function isLeaderRole(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

function eligibleMembers(members: WebTeamMemberRow[], myId: string, myRole: string): WebTeamMemberRow[] {
  if (isLeaderRole(myRole)) return members;
  return members.filter((m) => m.userId === myId);
}

export function SenecaGoalModal({ open, onClose }: Props) {
  const { me, selectedTeamId } = useEnterpriseShell();
  const [phase, setPhase] = useState<Phase>("prompt");
  const [skillOrGoal, setSkillOrGoal] = useState("");
  const [members, setMembers] = useState<WebTeamMemberRow[]>([]);
  const [myRole, setMyRole] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [skill, setSkill] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [senecaReady, setSenecaReady] = useState(true);

  const memberOptions = useMemo(
    () => eligibleMembers(members, me?.id ?? "", myRole),
    [members, me?.id, myRole],
  );

  const selectedMember = memberOptions.find((m) => m.userId === memberUserId) ?? null;

  useEffect(() => {
    if (!open) {
      setPhase("prompt");
      setSkillOrGoal("");
      setSkill("");
      setStepsText("");
      setErr(null);
      setSaving(false);
      return;
    }

    void fetch(`${getWebApiBase()}/health`)
      .then((r) => r.json())
      .then((health: { senecaConfigured?: boolean }) => setSenecaReady(Boolean(health.senecaConfigured)))
      .catch(() => setSenecaReady(false));

    if (!selectedTeamId) return;
    setLoadingMembers(true);
    void fetchWebTeam(selectedTeamId)
      .then((team) => {
        setMembers(team.members);
        setMyRole(team.myRole);
        const options = eligibleMembers(team.members, me?.id ?? "", team.myRole);
        setMemberUserId((current) => current || options[0]?.userId || "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load team members."))
      .finally(() => setLoadingMembers(false));
  }, [open, selectedTeamId, me?.id]);

  const generate = async () => {
    const prompt = skillOrGoal.trim();
    if (!prompt || !selectedTeamId || !memberUserId || !selectedMember) return;
    if (!senecaReady) {
      setErr("Seneca is not configured on this server yet.");
      return;
    }

    setPhase("generating");
    setErr(null);
    try {
      const goal = await fetchSenecaQuickGoal(selectedTeamId, memberUserId, {
        skillOrGoal: prompt,
        memberName: memberLabel(selectedMember),
        managerName: me?.name ?? me?.email ?? null,
      });
      setSkill(goal.skill);
      setStepsText(goal.steps.join("\n"));
      setPhase("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Seneca could not create that goal.");
      setPhase("prompt");
    }
  };

  const save = async () => {
    if (!selectedTeamId || !memberUserId) return;
    const steps = stepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_STEPS);
    if (!skill.trim() || steps.length === 0) {
      setErr("Add a goal title and at least one step.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await createDevelopmentGoal(selectedTeamId, memberUserId, {
        skill: skill.trim(),
        steps,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save development goal.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="seneca-soon-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="seneca-soon-modal seneca-goal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-goal-title"
        aria-busy={phase === "generating" || saving}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="seneca-soon-close" aria-label="Close" disabled={saving} onClick={onClose}>
          ×
        </button>

        <div className="seneca-soon-glow" aria-hidden />

        <header className="seneca-goal-head">
          <SenecaIcon size={52} className="seneca-goal-head-icon" />
          <div>
            <p className="seneca-kicker seneca-soon-kicker">Development goal</p>
            <h2 id="seneca-goal-title" className="seneca-soon-title seneca-goal-title">
              {phase === "review" ? "Review before saving" : "What do you want to develop?"}
            </h2>
          </div>
        </header>

        <SenecaDisclaimer />

        {!senecaReady ? (
          <p className="enterprise-form-error seneca-goal-error" role="alert">
            Seneca is not configured on this server yet.
          </p>
        ) : null}

        {err ? <p className="enterprise-form-error seneca-goal-error" role="alert">{err}</p> : null}

        {phase === "prompt" ? (
          <div className="seneca-goal-body">
            <label className="seneca-dev-plan-label" htmlFor="seneca-skill-prompt">
              Goal or skill
            </label>
            <textarea
              id="seneca-skill-prompt"
              className="auth-input seneca-dev-plan-textarea seneca-goal-prompt"
              rows={3}
              placeholder="e.g. Run smoother shift handoffs, improve upselling, lead opening/closing…"
              value={skillOrGoal}
              onChange={(e) => setSkillOrGoal(e.target.value)}
              autoFocus
            />

            {memberOptions.length > 1 ? (
              <>
                <label className="seneca-dev-plan-label" htmlFor="seneca-goal-member">
                  For team member
                </label>
                <select
                  id="seneca-goal-member"
                  className="auth-input seneca-dev-plan-input"
                  value={memberUserId}
                  disabled={loadingMembers}
                  onChange={(e) => setMemberUserId(e.target.value)}
                >
                  {memberOptions.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
              </>
            ) : selectedMember ? (
              <p className="enterprise-muted seneca-goal-member-hint">For {memberLabel(selectedMember)}</p>
            ) : null}

            <button
              type="button"
              className="seneca-soon-dismiss seneca-goal-primary"
              disabled={!skillOrGoal.trim() || !memberUserId || loadingMembers || !senecaReady}
              onClick={() => void generate()}
            >
              Create with Seneca
            </button>
          </div>
        ) : null}

        {phase === "generating" ? (
          <div className="seneca-soon-loading seneca-goal-loading">
            <SenecaBrandMark />
            <p className="seneca-soon-loading-text">Seneca is building your goal</p>
            <span className="seneca-soon-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}

        {phase === "review" ? (
          <div className="seneca-goal-body">
            {selectedMember ? (
              <p className="enterprise-muted seneca-goal-member-hint">For {memberLabel(selectedMember)}</p>
            ) : null}
            <label className="seneca-dev-plan-label" htmlFor="seneca-goal-skill">
              Goal / skill
            </label>
            <input
              id="seneca-goal-skill"
              className="auth-input seneca-dev-plan-input"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            />
            <label className="seneca-dev-plan-label">
              Steps <span className="seneca-goal-step-cap">(max {MAX_STEPS})</span>
            </label>
            <textarea
              className="auth-input seneca-dev-plan-textarea"
              rows={MAX_STEPS + 1}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value.split("\n").slice(0, MAX_STEPS).join("\n"))}
              placeholder="One step per line"
            />
            <div className="seneca-goal-actions">
              <button type="button" className="enterprise-inline-link" disabled={saving} onClick={() => setPhase("prompt")}>
                Back
              </button>
              <button type="button" className="seneca-soon-dismiss seneca-goal-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save development goal"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
