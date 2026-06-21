import { useEffect, useRef, useState } from "react";
import type { OneOnOneTemplate } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import {
  senecaAssist,
  type SenecaAssistAction,
  type SenecaAssistResult,
  type SenecaDevelopmentGoalDraft,
} from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer } from "./SenecaShared";
import { findLeaderCommitmentsFieldId } from "../../lib/check-in-leader-comments";

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
  placement?: "sidebar" | "header";
  onApplyText: (fieldId: string, text: string) => void;
  onAddFollowUpTasks: (tasks: SenecaFollowUpSuggestion[]) => void;
  onSuggestDevelopmentGoal: (draft: SenecaDevelopmentGoalDraft) => void;
};

const ACTIONS: { action: SenecaAssistAction; label: string }[] = [
  { action: "suggest_next_question", label: "Suggest next question" },
  { action: "rewrite_feedback", label: "Leadership review" },
  { action: "notes_to_action_items", label: "Turn notes into action items" },
  { action: "summarize_conversation", label: "Summarize conversation" },
];

function buildLeaderCommitmentsText(result: SenecaAssistResult): string {
  const parts: string[] = [];
  const main = result.result?.trim();
  if (main) parts.push(main);
  const suggestions = result.suggestions?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (suggestions.length > 0) {
    parts.push(suggestions.map((item) => `• ${item}`).join("\n"));
  }
  return parts.join("\n\n");
}

function mergeLeaderCommitments(existing: string | number | undefined, next: string): string {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (!current) return next;
  if (!next.trim()) return current;
  return `${current}\n\n${next}`;
}

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
  placement = "sidebar",
  onApplyText,
  onAddFollowUpTasks,
  onSuggestDevelopmentGoal,
}: Props) {
  const [busy, setBusy] = useState<SenecaAssistAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SenecaAssistResult | null>(null);
  const [lastAction, setLastAction] = useState<SenecaAssistAction | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isHeader = placement === "header";

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

  useEffect(() => {
    if (!isHeader || !open) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [isHeader, open]);

  useEffect(() => {
    if (isHeader && result) setOpen(true);
  }, [isHeader, result]);

  const runAction = async (action: SenecaAssistAction) => {
    setBusy(action);
    setErr(null);
    setResult(null);
    setLastAction(null);
    if (isHeader) setOpen(true);
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
      setLastAction(action);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Seneca could not complete that action.");
    } finally {
      setBusy(null);
    }
  };

  const leaderCommitmentsFieldId = findLeaderCommitmentsFieldId(template.fields);
  const leaderCommitmentsText = result ? buildLeaderCommitmentsText(result) : "";

  const panelBody = (
    <>
      {!isHeader ? (
        <header className="seneca-checkin-head">
          <SenecaBrandMark />
          <p className="seneca-kicker">Coach the manager</p>
        </header>
      ) : null}
      <SenecaDisclaimer compact={isHeader} />

      <div className={`seneca-checkin-actions${isHeader ? " seneca-checkin-actions--header" : ""}`}>
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
            {lastAction === "rewrite_feedback" && leaderCommitmentsFieldId && leaderCommitmentsText ? (
              <button
                type="button"
                className="seneca-checkin-apply-btn"
                onClick={() =>
                  onApplyText(
                    leaderCommitmentsFieldId,
                    mergeLeaderCommitments(responses[leaderCommitmentsFieldId], leaderCommitmentsText),
                  )
                }
              >
                Apply to leader commitments
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
    </>
  );

  if (isHeader) {
    return (
      <div ref={wrapRef} className="seneca-checkin-header-wrap">
        <button
          type="button"
          className={`seneca-checkin-header-trigger${open ? " seneca-checkin-header-trigger--open" : ""}${result ? " seneca-checkin-header-trigger--active" : ""}`}
          aria-expanded={open}
          aria-controls="seneca-checkin-header-popover"
          aria-label="Open Seneca coaching assistant"
          onClick={() => setOpen((current) => !current)}
        >
          <SenecaBrandMark compact />
          <span className="seneca-checkin-header-trigger-text">
            <span className="seneca-checkin-header-trigger-title">Seneca</span>
            <span className="seneca-checkin-header-trigger-sub">Coach the manager</span>
          </span>
        </button>
        {open ? (
          <aside
            id="seneca-checkin-header-popover"
            className="seneca-checkin-panel seneca-checkin-panel--header-popover"
            aria-label="Seneca coaching assistant"
            onClick={(e) => e.stopPropagation()}
          >
            {panelBody}
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="seneca-checkin-panel" aria-label="Seneca coaching assistant">
      {panelBody}
    </aside>
  );
}
