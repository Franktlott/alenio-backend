export type DevelopmentGoalPriority = "low" | "normal" | "high";

export type SkillPreset = {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  steps: string[];
};

export const SKILL_PRESETS: SkillPreset[] = [
  {
    id: "leadership",
    label: "Leadership",
    color: "#7C3AED",
    bg: "#F3E8FF",
    border: "#E9D5FF",
    steps: [
      "Observe an experienced leader in action",
      "Lead one shift meeting",
      "Give feedback to a peer",
      "Ask for feedback from your manager",
    ],
  },
  {
    id: "communication",
    label: "Communication",
    color: "#2563EB",
    bg: "#DBEAFE",
    border: "#BFDBFE",
    steps: [
      "Practice active listening in one conversation daily",
      "Write a clear handoff note for the next shift",
      "Ask clarifying questions before acting",
      "Share a concise update with your manager",
    ],
  },
  {
    id: "coaching",
    label: "Coaching",
    color: "#16A34A",
    bg: "#DCFCE7",
    border: "#BBF7D0",
    steps: [
      "Observe a coaching conversation",
      "Practice one coaching question with a teammate",
      "Document a win and the behavior behind it",
      "Ask for coaching feedback from your leader",
    ],
  },
  {
    id: "delegation",
    label: "Delegation",
    color: "#EA580C",
    bg: "#FFEDD5",
    border: "#FED7AA",
    steps: [
      "Identify one task to hand off this week",
      "Set a clear expectation and deadline",
      "Check in once without taking the work back",
      "Debrief what went well after completion",
    ],
  },
  {
    id: "customer-service",
    label: "Customer Service",
    color: "#0D9488",
    bg: "#CCFBF1",
    border: "#99F6E4",
    steps: [
      "Shadow a strong customer interaction",
      "Handle one difficult guest conversation",
      "Use a greeting and close on every interaction",
      "Capture one recovery win to share with the team",
    ],
  },
  {
    id: "conflict-resolution",
    label: "Conflict Resolution",
    color: "#DC2626",
    bg: "#FEE2E2",
    border: "#FECACA",
    steps: [
      "Stay calm and listen fully before responding",
      "Restate the other person’s concern out loud",
      "Propose one fair next step",
      "Follow up after the issue is resolved",
    ],
  },
];

export const DEVELOPMENT_PLAN_TIPS = [
  "Keep steps specific and observable.",
  "Aim for 3–5 actions that can happen in the next 30–90 days.",
  "Mix practice, observation, and feedback.",
  "Write steps the associate can own without waiting on others.",
];

export function defaultGoalDueDate(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 70);
  return d;
}

export function formatGoalDueDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildManagerNotesPayload(input: {
  dueDate: Date;
  priority: DevelopmentGoalPriority;
  notes?: string;
}): string | undefined {
  const priorityLabel =
    input.priority === "low" ? "Low" : input.priority === "high" ? "High" : "Normal";
  const meta = `Due ${formatGoalDueDate(input.dueDate)} · Priority ${priorityLabel}`;
  const notes = input.notes?.trim();
  if (!notes) return meta;
  return `${meta}\n\n${notes}`;
}

const GOAL_BOOTSTRAP_META_RE =
  /^Due (.+?) · Priority (Low|Normal|High)(?:\n\n([\s\S]*))?$/i;

export type ParsedGoalBootstrapNote = {
  dueLabel: string;
  priorityLabel: string;
  coachingBody: string | null;
};

/** Parse create-time Due/Priority note (optional coaching body after blank line). */
export function parseGoalBootstrapNote(body: string): ParsedGoalBootstrapNote | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const match = trimmed.match(GOAL_BOOTSTRAP_META_RE);
  if (!match) return null;
  const coaching = match[3]?.trim() || null;
  const rawPriority = match[2]!.trim().toLowerCase();
  const priorityLabel =
    rawPriority === "low" ? "Low" : rawPriority === "high" ? "High" : "Normal";
  return {
    dueLabel: match[1]!.trim(),
    priorityLabel,
    coachingBody: coaching,
  };
}

export function isGoalBootstrapMetaOnly(body: string): boolean {
  const parsed = parseGoalBootstrapNote(body);
  return !!parsed && !parsed.coachingBody;
}

export function extractGoalDuePriorityFromNotes(
  notes: Array<{ body: string }>,
): { dueLabel: string; priorityLabel: string } | null {
  for (const note of notes) {
    const parsed = parseGoalBootstrapNote(note.body);
    if (parsed) {
      return { dueLabel: parsed.dueLabel, priorityLabel: parsed.priorityLabel };
    }
  }
  return null;
}

/** Newest coaching preview, skipping pure Due/Priority bootstrap notes. */
export function latestCoachingNotePreview(notes: Array<{ body: string; createdAt: string }>): string | null {
  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const note of sorted) {
    const parsed = parseGoalBootstrapNote(note.body);
    if (parsed) {
      if (parsed.coachingBody) return parsed.coachingBody;
      continue;
    }
    const body = note.body.trim();
    if (body) return body;
  }
  return null;
}
