import type {
  OneOnOneTemplate,
  OneOnOneTemplateField,
} from "./member-profile-api";
import {
  LEADER_COMMENTS_FIELD_LABEL,
  LEADER_COMMENTS_HELP_TEXT,
  LEADER_COMMENTS_SECTION_LABEL,
} from "./check-in-leader-comments";

/** Default title for every new check-in. Mirrors backend OPEN_CHECK_IN_TITLE. */
export const OPEN_CHECK_IN_TITLE = "Check-in";
export const OPEN_CHECK_IN_TITLE_MAX = 60;

/** Mirrors backend open-check-in-structuring ids. */
export const OPEN_CHECK_IN_RECAP_FIELD_ID = "open-recap";
export const OPEN_CHECK_IN_RECAP_LABEL = "What we talked about";
export const OPEN_CHECK_IN_LEADER_SECTION_ID = "open-leader-section";
export const OPEN_CHECK_IN_LEADER_NOTES_ID = "open-leader-notes";

/** The fixed write-up every new check-in uses: recap plus leader comments. */
export function openCheckInFields(): OneOnOneTemplateField[] {
  return [
    {
      id: OPEN_CHECK_IN_RECAP_FIELD_ID,
      label: OPEN_CHECK_IN_RECAP_LABEL,
      type: "long_text",
      order: 0,
      required: false,
    },
    {
      id: OPEN_CHECK_IN_LEADER_SECTION_ID,
      label: LEADER_COMMENTS_SECTION_LABEL,
      type: "section",
      order: 1,
      required: false,
    },
    {
      id: OPEN_CHECK_IN_LEADER_NOTES_ID,
      label: LEADER_COMMENTS_FIELD_LABEL,
      type: "manager_notes",
      order: 2,
      required: false,
      helpText: LEADER_COMMENTS_HELP_TEXT,
    },
  ];
}

/** Form shape for a brand-new check-in, before the first save. */
export function openCheckInForm(teamId: string, createdById = ""): OneOnOneTemplate {
  const now = new Date().toISOString();
  return {
    id: "open-check-in",
    teamId,
    title: OPEN_CHECK_IN_TITLE,
    description: null,
    fields: openCheckInFields(),
    createdById,
    createdAt: now,
    updatedAt: now,
  };
}

export function openCheckInTitleForSave(title: string): string {
  const trimmed = title.trim().slice(0, OPEN_CHECK_IN_TITLE_MAX);
  return trimmed || OPEN_CHECK_IN_TITLE;
}
