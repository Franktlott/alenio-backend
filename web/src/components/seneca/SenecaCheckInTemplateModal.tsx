import { useEffect, useRef, useState } from "react";
import { createOneOnOneTemplate } from "../../lib/api";
import { checkInTemplateDraftToFields } from "../../lib/check-in-template-draft";
import { getWebApiBase } from "../../lib/api-base";
import { fetchSenecaCheckInTemplate, type SenecaCheckInTemplateDraft } from "../../lib/seneca-api";
import { SenecaBrandMark, SenecaDisclaimer, SenecaIcon } from "./SenecaShared";

type Props = {
  open: boolean;
  teamId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type Phase = "prompt" | "generating" | "review";

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${Math.max(el.scrollHeight, 34)}px`;
}

function questionTypeLabel(type: string): string {
  if (type === "short_text") return "Short answer";
  if (type === "rating") return "Rating";
  if (type === "yes_no") return "Yes / No";
  return "Long answer";
}

export function SenecaCheckInTemplateModal({ open, teamId, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<SenecaCheckInTemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [senecaReady, setSenecaReady] = useState(true);
  const questionInputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  useEffect(() => {
    if (phase !== "review" || !draft) return;
    for (const el of questionInputRefs.current) autoResizeTextarea(el);
  }, [phase, draft]);

  useEffect(() => {
    if (!open) {
      setPhase("prompt");
      setBrief("");
      setDraft(null);
      setErr(null);
      setSaving(false);
      return;
    }

    void fetch(`${getWebApiBase()}/health`)
      .then((r) => r.json())
      .then((health: { senecaConfigured?: boolean }) => setSenecaReady(Boolean(health.senecaConfigured)))
      .catch(() => setSenecaReady(false));
  }, [open]);

  const generate = async () => {
    const prompt = brief.trim();
    if (!prompt || !teamId.trim()) return;
    if (!senecaReady) {
      setErr("Seneca is not configured on this server yet.");
      return;
    }

    setPhase("generating");
    setErr(null);
    try {
      const next = await fetchSenecaCheckInTemplate(teamId, { brief: prompt });
      setDraft(next);
      setPhase("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Seneca could not create that template.");
      setPhase("prompt");
    }
  };

  const save = async () => {
    if (!draft || !teamId.trim()) return;
    const title = draft.title.trim();
    const fields = checkInTemplateDraftToFields(draft);
    if (!title || fields.length === 0) {
      setErr("Add a template title and at least one question.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      await createOneOnOneTemplate(teamId, {
        title,
        description: draft.description?.trim() || null,
        fields,
        leaderPrep: draft.leaderPrep.map((item) => item.trim()).filter(Boolean),
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save check-in template.");
    } finally {
      setSaving(false);
    }
  };

  const updateSectionTitle = (sectionIndex: number, title: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, index) =>
          index === sectionIndex ? { ...section, title } : section,
        ),
      };
    });
  };

  const updateQuestionLabel = (sectionIndex: number, questionIndex: number, label: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, sIndex) =>
          sIndex === sectionIndex
            ? {
                ...section,
                questions: section.questions.map((question, qIndex) =>
                  qIndex === questionIndex ? { ...question, label } : question,
                ),
              }
            : section,
        ),
      };
    });
  };

  const updateLeaderPrepItem = (index: number, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        leaderPrep: current.leaderPrep.map((item, i) => (i === index ? value : item)),
      };
    });
  };

  if (!open) return null;

  return (
    <div className="seneca-soon-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className={`seneca-soon-modal seneca-goal-modal${phase === "review" ? " seneca-goal-modal--review seneca-template-modal--review" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-template-title"
        aria-busy={phase === "generating" || saving}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="seneca-soon-close" aria-label="Close" disabled={saving} onClick={onClose}>
          ×
        </button>

        <div className="seneca-soon-glow" aria-hidden />

        <header className="seneca-goal-head">
          <SenecaIcon size={phase === "review" ? 40 : 52} className="seneca-goal-head-icon" />
          <div>
            <p className="seneca-kicker seneca-soon-kicker">Check-in template</p>
            <h2 id="seneca-template-title" className="seneca-soon-title seneca-goal-title">
              {phase === "review" ? "Review before saving" : "What check-in do you want?"}
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
            <label className="seneca-dev-plan-label" htmlFor="seneca-template-brief">
              Describe the check-in
            </label>
            <textarea
              id="seneca-template-brief"
              className="auth-input seneca-dev-plan-textarea seneca-goal-prompt"
              rows={3}
              placeholder="e.g. Weekly 1:1 for retail associates — wins, blockers, and focus for next week"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="seneca-soon-dismiss seneca-goal-primary"
              disabled={!brief.trim() || !senecaReady}
              onClick={() => void generate()}
            >
              Generate with Seneca
            </button>
          </div>
        ) : null}

        {phase === "generating" ? (
          <div className="seneca-soon-loading seneca-goal-loading">
            <SenecaBrandMark />
            <p className="seneca-soon-loading-text">Seneca is building your template</p>
            <span className="seneca-soon-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : null}

        {phase === "review" && draft ? (
          <div className="seneca-goal-body seneca-goal-body--review">
            <label className="seneca-dev-plan-label" htmlFor="seneca-template-name">
              Template name
            </label>
            <input
              id="seneca-template-name"
              className="auth-input seneca-dev-plan-input seneca-goal-skill-input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <label className="seneca-dev-plan-label" htmlFor="seneca-template-description">
              Description
            </label>
            <textarea
              id="seneca-template-description"
              className="auth-input seneca-dev-plan-textarea seneca-template-description"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
            />
            <div className="seneca-goal-steps-head">
              <label className="seneca-dev-plan-label">Questions</label>
            </div>
            <div className="seneca-goal-steps-scroll seneca-template-sections-scroll">
              {draft.sections.map((section, sectionIndex) => {
                const priorQuestions = draft.sections
                  .slice(0, sectionIndex)
                  .reduce((sum, item) => sum + item.questions.length, 0);
                return (
                <section key={`section-${sectionIndex}`} className="seneca-template-section">
                  <label className="seneca-dev-plan-label" htmlFor={`seneca-section-${sectionIndex}`}>
                    Section
                  </label>
                  <input
                    id={`seneca-section-${sectionIndex}`}
                    className="auth-input seneca-dev-plan-input seneca-template-section-title"
                    value={section.title}
                    onChange={(e) => updateSectionTitle(sectionIndex, e.target.value)}
                  />
                  <ul className="seneca-goal-steps">
                    {section.questions.map((question, qIndex) => {
                      const flatIndex = priorQuestions + qIndex;
                      return (
                        <li key={`question-${sectionIndex}-${qIndex}`} className="seneca-goal-step-row">
                          <div className="seneca-goal-step-head">
                            <span className="seneca-goal-step-label">Question {flatIndex + 1}</span>
                            <span className="seneca-template-question-type">{questionTypeLabel(question.type)}</span>
                          </div>
                          <textarea
                            ref={(el) => {
                              questionInputRefs.current[flatIndex] = el;
                              autoResizeTextarea(el);
                            }}
                            className="auth-input seneca-goal-step-input"
                            rows={1}
                            value={question.label}
                            aria-label={`Question ${flatIndex + 1}`}
                            onChange={(e) => {
                              updateQuestionLabel(sectionIndex, qIndex, e.target.value);
                              autoResizeTextarea(e.target);
                            }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
                );
              })}
            </div>
            {draft.leaderPrep.length > 0 ? (
              <>
                <label className="seneca-dev-plan-label">Leader prep</label>
                <ul className="seneca-goal-steps seneca-template-prep-list">
                  {draft.leaderPrep.map((item, index) => (
                    <li key={`prep-${index}`} className="seneca-template-prep-row">
                      <input
                        className="auth-input seneca-dev-plan-input"
                        value={item}
                        aria-label={`Leader prep ${index + 1}`}
                        onChange={(e) => updateLeaderPrepItem(index, e.target.value)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="seneca-goal-actions seneca-goal-actions--review">
              <button type="button" className="enterprise-inline-link" disabled={saving} onClick={() => setPhase("prompt")}>
                Back
              </button>
              <button type="button" className="seneca-soon-dismiss seneca-goal-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save check-in template"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
