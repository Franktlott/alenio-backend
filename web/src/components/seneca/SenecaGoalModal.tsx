import { useEffect, useMemo, useRef, useState } from "react";
import { createDevelopmentGoal, fetchWebTeam, type WebTeamMemberRow } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { fetchSenecaQuickGoal } from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer, SenecaIcon } from "./SenecaShared";

type PinnedMemberContext = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** When viewing a specific member's development plan */
  memberContext?: PinnedMemberContext;
  onSaved?: () => void;
};

type Phase = "prompt" | "generating" | "review";

const MAX_STEPS = 5;

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${Math.max(el.scrollHeight, 34)}px`;
}

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

export function SenecaGoalModal({ open, onClose, memberContext, onSaved }: Props) {
  const { me, selectedTeamId } = useEnterpriseShell();
  const pinned = memberContext ?? null;
  const teamId = pinned?.teamId ?? selectedTeamId ?? "";
  const [phase, setPhase] = useState<Phase>("prompt");
  const [skillOrGoal, setSkillOrGoal] = useState("");
  const [members, setMembers] = useState<WebTeamMemberRow[]>([]);
  const [myRole, setMyRole] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [senecaReady, setSenecaReady] = useState(true);
  const stepInputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  useEffect(() => {
    if (phase !== "review") return;
    for (const el of stepInputRefs.current) autoResizeTextarea(el);
  }, [phase, steps]);

  const memberOptions = useMemo(
    () => (pinned ? [] : eligibleMembers(members, me?.id ?? "", myRole)),
    [pinned, members, me?.id, myRole],
  );

  const selectedMember = memberOptions.find((m) => m.userId === memberUserId) ?? null;
  const activeMemberUserId = pinned?.memberUserId ?? memberUserId;
  const activeMemberName =
    pinned?.memberName ?? (selectedMember ? memberLabel(selectedMember) : "");
  const activeManagerName = pinned?.managerName ?? me?.name ?? me?.email ?? null;
  const showMemberPicker = !pinned && memberOptions.length > 1;

  useEffect(() => {
    if (!open) {
      setPhase("prompt");
      setSkillOrGoal("");
      setSkill("");
      setSteps([""]);
      setErr(null);
      setSaving(false);
      return;
    }

    void fetch(`${getWebApiBase()}/health`)
      .then((r) => r.json())
      .then((health: { senecaConfigured?: boolean }) => setSenecaReady(Boolean(health.senecaConfigured)))
      .catch(() => setSenecaReady(false));

    if (pinned) return;

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
  }, [open, pinned, selectedTeamId, me?.id]);

  const generate = async () => {
    const prompt = skillOrGoal.trim();
    if (!prompt || !teamId || !activeMemberUserId || !activeMemberName) return;
    if (!senecaReady) {
      setErr("Seneca is not configured on this server yet.");
      return;
    }

    setPhase("generating");
    setErr(null);
    try {
      const goal = await fetchSenecaQuickGoal(teamId, activeMemberUserId, {
        skillOrGoal: prompt,
        memberName: activeMemberName,
        managerName: activeManagerName,
      });
      setSkill(goal.skill);
      setSteps(goal.steps.length > 0 ? goal.steps.slice(0, MAX_STEPS) : [""]);
      setPhase("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Seneca could not create that goal.");
      setPhase("prompt");
    }
  };

  const save = async () => {
    if (!teamId || !activeMemberUserId) return;
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS);
    if (!skill.trim() || trimmedSteps.length === 0) {
      setErr("Add a goal title and at least one step.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await createDevelopmentGoal(teamId, activeMemberUserId, {
        skill: skill.trim(),
        steps: trimmedSteps,
      });
      onSaved?.();
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
        className={`seneca-soon-modal seneca-goal-modal${phase === "review" ? " seneca-goal-modal--review" : ""}`}
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

        {phase !== "review" ? <SenecaDisclaimer /> : null}

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

            {showMemberPicker ? (
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
            ) : activeMemberName ? (
              <p className="enterprise-muted seneca-goal-member-hint">For {activeMemberName}</p>
            ) : null}

            <button
              type="button"
              className="seneca-soon-dismiss seneca-goal-primary"
              disabled={!skillOrGoal.trim() || !activeMemberUserId || loadingMembers || !senecaReady}
              onClick={() => void generate()}
            >
              {pinned ? "Generate with Seneca" : "Create with Seneca"}
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
          <div className="seneca-goal-body seneca-goal-body--review">
            {activeMemberName ? (
              <p className="enterprise-muted seneca-goal-member-hint seneca-goal-member-hint--compact">
                For {activeMemberName}
              </p>
            ) : null}
            <label className="seneca-dev-plan-label" htmlFor="seneca-goal-skill">
              Goal / skill
            </label>
            <input
              id="seneca-goal-skill"
              className="auth-input seneca-dev-plan-input seneca-goal-skill-input"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            />
            <div className="seneca-goal-steps-head">
              <label className="seneca-dev-plan-label">
                Steps <span className="seneca-goal-step-cap">(max {MAX_STEPS})</span>
              </label>
              {steps.length < MAX_STEPS ? (
                <button
                  type="button"
                  className="enterprise-inline-link seneca-goal-add-step"
                  disabled={saving}
                  onClick={() => setSteps((current) => [...current, ""])}
                >
                  Add step
                </button>
              ) : null}
            </div>
            <div className="seneca-goal-steps-scroll">
              <ul className="seneca-goal-steps">
                {steps.map((step, index) => (
                  <li key={`seneca-step-${index}`} className="seneca-goal-step-row">
                    <div className="seneca-goal-step-head">
                      <span className="seneca-goal-step-label">Step {index + 1}</span>
                      {steps.length > 1 ? (
                        <button
                          type="button"
                          className="seneca-goal-remove-step"
                          disabled={saving}
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      ref={(el) => {
                        stepInputRefs.current[index] = el;
                        autoResizeTextarea(el);
                      }}
                      className="auth-input seneca-goal-step-input"
                      rows={1}
                      value={step}
                      placeholder={`Action step ${index + 1}`}
                      aria-label={`Step ${index + 1}`}
                      onChange={(e) => {
                        setSteps((current) => current.map((s, i) => (i === index ? e.target.value : s)));
                        autoResizeTextarea(e.target);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="seneca-goal-actions seneca-goal-actions--review">
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
