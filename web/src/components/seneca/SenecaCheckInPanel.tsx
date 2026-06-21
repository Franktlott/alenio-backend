import { useEffect, useState } from "react";
import type { OneOnOneTemplate } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import {
  senecaAssist,
  type SenecaAssistAction,
  type SenecaAssistResult,
  type SenecaDevelopmentGoalDraft,
} from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer } from "./SenecaShared";

export type SenecaFollowUpSuggestion = {
  title: string;
  assigneeRole: "associate" | "leader";
  dueDate?: string;
};

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  template: OneOnOneTemplate;
  responses: Record<string, string | number>;
  focusFieldId?: string | null;
  onApplyText: (fieldId: string, text: string) => void;
  onAddFollowUpTasks: (tasks: SenecaFollowUpSuggestion[]) => void;
  onSuggestDevelopmentGoal: (draft: SenecaDevelopmentGoalDraft) => void;
};

const ACTIONS: { action: SenecaAssistAction; label: string }[] = [
  { action: "suggest_next_question", label: "Suggest next question" },
  { action: "rewrite_feedback", label: "Rewrite feedback" },
  { action: "notes_to_action_items", label: "Turn notes into action items" },
  { action: "create_follow_up_task", label: "Create follow-up task" },
  { action: "create_development_goal", label: "Create development goal" },
  { action: "summarize_conversation", label: "Summarize conversation" },
];

function focusTextFromResponses(
  fields: OneOnOneTemplate["fields"],
  responses: Record<string, string | number>,
  focusFieldId?: string | null,
): string {
  if (focusFieldId) {
    const val = responses[focusFieldId];
    if (typeof val === "string" && val.trim()) return val;
  }
  const textFields = fields.filter(
    (f) => f.type === "long_text" || f.type === "manager_notes" || f.type === "short_text",
  );
  for (const f of textFields) {
    const val = responses[f.id];
    if (typeof val === "string" && val.trim()) return val;
  }
  return Object.entries(responses)
    .map(([id, val]) => {
      const field = fields.find((f) => f.id === id);
      return field ? `${field.label}: ${String(val)}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function SenecaCheckInPanel({
  teamId,
  memberUserId,
  memberName,
  managerName,
  template,
  responses,
  focusFieldId,
  onApplyText,
  onAddFollowUpTasks,
  onSuggestDevelopmentGoal,
}: Props) {
  const [busy, setBusy] = useState<SenecaAssistAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SenecaAssistResult | null>(null);

  useEffect(() => {
    const apiBase = getWebApiBase();
    void fetch(`${apiBase}/health`)
      .then((r) => r.json())
      .then((health: { senecaConfigured?: boolean }) => {
        if (!health.senecaConfigured) {
          setErr("Seneca is not configured on this server. Add OPENAI_API_KEY to enable coaching assistance.");
        }
      })
      .catch(() => {});
  }, []);

  const runAction = async (action: SenecaAssistAction) => {
    setBusy(action);
    setErr(null);
    setResult(null);
    try {
      const focusText = focusTextFromResponses(template.fields, responses, focusFieldId);
      const out = await senecaAssist(teamId, memberUserId, {
        action,
        templateId: template.id,
        templateTitle: template.title,
        templateFields: template.fields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
        responses,
        focusFieldId: focusFieldId ?? undefined,
        focusText,
        memberName,
        managerName,
      });
      setResult(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Seneca could not complete that action.");
    } finally {
      setBusy(null);
    }
  };

  const textFieldId =
    focusFieldId ??
    template.fields.find((f) => f.type === "manager_notes" || f.type === "long_text")?.id ??
    null;

  return (
    <aside className="seneca-checkin-panel" aria-label="Seneca coaching assistant">
      <header className="seneca-checkin-head">
        <SenecaBrandMark />
        <p className="seneca-kicker">Coach the manager</p>
      </header>
      <SenecaDisclaimer />

      <div className="seneca-checkin-actions">
        {ACTIONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            className="seneca-checkin-action-btn"
            disabled={busy !== null}
            onClick={() => void runAction(action)}
          >
            {busy === action ? "Working…" : label}
          </button>
        ))}
      </div>

      {err ? <p className="enterprise-form-error seneca-checkin-error" role="alert">{err}</p> : null}

      {result ? (
        <div className="seneca-checkin-result">
          <p className="seneca-checkin-result-text">{result.result}</p>
          {result.suggestions && result.suggestions.length > 0 ? (
            <ul className="seneca-prep-list">
              {result.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}

          <div className="seneca-checkin-result-actions">
            {textFieldId && result.result ? (
              <button
                type="button"
                className="seneca-checkin-apply-btn"
                onClick={() => onApplyText(textFieldId, result.result)}
              >
                Apply to notes
              </button>
            ) : null}
            {result.followUpTasks && result.followUpTasks.length > 0 ? (
              <button
                type="button"
                className="seneca-checkin-apply-btn"
                onClick={() =>
                  onAddFollowUpTasks(
                    result.followUpTasks!.map((t) => ({
                      title: t.title,
                      assigneeRole: t.assigneeRole,
                      dueDate: t.dueDate,
                    })),
                  )
                }
              >
                Add follow-up tasks
              </button>
            ) : null}
            {result.developmentGoal ? (
              <button
                type="button"
                className="seneca-checkin-apply-btn"
                onClick={() => onSuggestDevelopmentGoal(result.developmentGoal!)}
              >
                Review development goal
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
