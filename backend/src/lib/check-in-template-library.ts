import { randomUUID } from "crypto";
import {
  LEADER_COMMENTS_FIELD_LABEL,
  LEADER_COMMENTS_HELP_TEXT,
  LEADER_COMMENTS_SECTION_LABEL,
  appendLeaderCommentsFields,
} from "./check-in-leader-comments";

export type CheckInLibraryField = {
  id: string;
  label: string;
  type: "section" | "short_text" | "long_text" | "rating" | "yes_no" | "manager_notes" | "associate_notes";
  order: number;
  required: boolean;
  helpText?: string | null;
  ratingMax?: number;
};

export type CheckInLibraryTemplate = {
  key: string;
  title: string;
  description: string | null;
  fields: CheckInLibraryField[];
};

type LibraryDef = {
  key: string;
  title: string;
  description: string | null;
  questions: string[];
  sectionLabel?: string;
};

const LIBRARY_DEFS: LibraryDef[] = [
  {
    key: "weekly-check-in",
    title: "Weekly Check-In",
    description: "Regular weekly sync with your team member.",
    questions: [
      "What's going well?",
      "Any roadblocks?",
      "What support do you need?",
      "Wins from this week?",
      "Focus for next week?",
    ],
  },
  {
    key: "development-check-in",
    title: "Development Check-In",
    description: "Focus on growth, skills, and career development.",
    questions: [
      "What skill are you working on?",
      "Where do you want to grow?",
      "What experience do you need?",
      "What action will you take?",
    ],
  },
  {
    key: "new-hire-30-60-90",
    title: "New Hire 30/60/90",
    description: "Huge for retail: onboarding pulse for new hires.",
    questions: [
      "How is training going?",
      "What feels unclear?",
      "Do you feel supported?",
      "What should we improve?",
    ],
  },
  {
    key: "coaching-conversation",
    title: "Coaching Conversation",
    description: "Structured coaching discussion.",
    sectionLabel: "Coaching conversation",
    questions: ["Situation", "Expectations", "Agreement"],
  },
];

function buildLibraryFields(def: LibraryDef, idPrefix: string): CheckInLibraryField[] {
  const sectionId = `${idPrefix}__section`;
  const fields: CheckInLibraryField[] = [
    {
      id: sectionId,
      label: def.sectionLabel ?? "Check-in",
      type: "section",
      order: 0,
      required: false,
    },
  ];
  def.questions.forEach((label, index) => {
    fields.push({
      id: `${idPrefix}__q${index}`,
      label,
      type: "long_text",
      order: index + 1,
      required: false,
      helpText: null,
    });
  });
  const leaderOrder = def.questions.length + 1;
  fields.push(
    {
      id: `${idPrefix}__leader_section`,
      label: LEADER_COMMENTS_SECTION_LABEL,
      type: "section",
      order: leaderOrder,
      required: false,
    },
    {
      id: `${idPrefix}__leader_notes`,
      label: LEADER_COMMENTS_FIELD_LABEL,
      type: "manager_notes",
      order: leaderOrder + 1,
      required: false,
      helpText: LEADER_COMMENTS_HELP_TEXT,
    },
  );
  return fields;
}

export function getCheckInTemplateLibrary(): CheckInLibraryTemplate[] {
  return LIBRARY_DEFS.map((def) => ({
    key: def.key,
    title: def.title,
    description: def.description,
    fields: buildLibraryFields(def, def.key),
  })).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export function getCheckInLibraryTemplateByKey(libraryKey: string): CheckInLibraryTemplate | null {
  const def = LIBRARY_DEFS.find((item) => item.key === libraryKey);
  if (!def) return null;
  return {
    key: def.key,
    title: def.title,
    description: def.description,
    fields: buildLibraryFields(def, def.key),
  };
}

export function getCheckInLibraryDefByKey(libraryKey: string): LibraryDef | null {
  return LIBRARY_DEFS.find((item) => item.key === libraryKey) ?? null;
}

export function cloneLibraryFieldsForTeam(def: LibraryDef): CheckInLibraryField[] {
  const sectionId = randomUUID();
  const fields: CheckInLibraryField[] = [
    {
      id: sectionId,
      label: def.sectionLabel ?? "Check-in",
      type: "section",
      order: 0,
      required: false,
    },
  ];
  def.questions.forEach((label, index) => {
    fields.push({
      id: randomUUID(),
      label,
      type: "long_text",
      order: index + 1,
      required: false,
      helpText: null,
    });
  });
  return appendLeaderCommentsFields(fields);
}
