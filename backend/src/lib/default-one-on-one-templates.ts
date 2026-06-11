import { randomUUID } from "crypto";

export type DefaultOneOnOneTemplateField = {
  id: string;
  label: string;
  type: "section" | "short_text" | "long_text" | "rating" | "manager_notes" | "associate_notes";
  order: number;
  required: boolean;
  helpText?: string | null;
  ratingMax?: number;
};

export type DefaultOneOnOneTemplateDef = {
  title: string;
  description: string | null;
  questions: string[];
  sectionLabel?: string;
};

function buildFields(questions: string[], sectionLabel = "Check-in"): DefaultOneOnOneTemplateField[] {
  const sectionId = randomUUID();
  const fields: DefaultOneOnOneTemplateField[] = [
    {
      id: sectionId,
      label: sectionLabel,
      type: "section",
      order: 0,
      required: false,
    },
  ];
  questions.forEach((label, index) => {
    fields.push({
      id: randomUUID(),
      label,
      type: "long_text",
      order: index + 1,
      required: false,
      helpText: null,
    });
  });
  return fields;
}

export const DEFAULT_ONE_ON_ONE_TEMPLATES: DefaultOneOnOneTemplateDef[] = [
  {
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
    title: "Coaching Conversation",
    description: "Structured coaching discussion.",
    sectionLabel: "Coaching conversation",
    questions: ["Situation", "Expectations", "Agreement"],
  },
];

export function buildDefaultOneOnOneTemplateRecords() {
  return DEFAULT_ONE_ON_ONE_TEMPLATES.map((template) => ({
    title: template.title,
    description: template.description,
    fields: buildFields(template.questions, template.sectionLabel ?? "Check-in"),
  }));
}
