import { senecaJson } from "./seneca-openai";

/** Fallback title when the model gives us nothing usable. */
export const OPEN_CHECK_IN_TITLE = "Open check-in";
/** Enough to cover a long conversation without turning the draft into a wall. */
export const OPEN_CHECK_IN_MAX_ITEMS = 12;

export type OpenCheckInField = {
  id: string;
  label: string;
  type: string;
  order: number;
  required?: boolean;
  helpText?: string | null;
};

export type OpenCheckInStructure = {
  title: string;
  fields: OpenCheckInField[];
  responses: Record<string, string | number>;
  summary: string;
};

export type RawOpenCheckIn = {
  title?: unknown;
  items?: unknown;
  summary?: unknown;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

/**
 * Builds the draft's questions from what the model heard. Ids are assigned here
 * rather than taken from the model, so a hallucinated or duplicated id cannot
 * detach an answer from its question.
 */
export function normalizeOpenCheckIn(
  raw: RawOpenCheckIn | null | undefined,
): OpenCheckInStructure {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const fields: OpenCheckInField[] = [];
  const responses: Record<string, string | number> = {};

  for (const entry of rawItems) {
    if (fields.length >= OPEN_CHECK_IN_MAX_ITEMS) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as { question?: unknown; answer?: unknown };
    const question = cleanText(item.question, 200);
    const answer = cleanText(item.answer, 4000);
    // A question with nothing behind it is noise the leader has to delete.
    if (!question || !answer) continue;
    const id = `open-${fields.length + 1}`;
    fields.push({
      id,
      label: question,
      type: "long_text",
      order: fields.length,
      required: false,
    });
    responses[id] = answer;
  }

  return {
    title: cleanText(raw?.title, 60) || OPEN_CHECK_IN_TITLE,
    fields,
    responses,
    summary: typeof raw?.summary === "string" ? raw.summary.trim().slice(0, 4000) : "",
  };
}

const OPEN_INSTRUCTION = `You are turning the transcript of a real check-in conversation into a draft check-in record for the leader to review. There is no template, so you decide the structure from what was actually discussed.

Rules:
- Work only from what was said. Never infer, embellish, or add plausible-sounding content.
- Break the conversation into the topics that were actually covered, in the order they came up.
- Write each topic as the question it answers, phrased the way a check-in template would ask it, for example "How is the new route going?" rather than "New route".
- Write each answer as concise notes in the leader's voice, not as a transcript quote.
- Merge small talk and tangents away. Only include a topic if there is something worth recording.
- Use at most ${OPEN_CHECK_IN_MAX_ITEMS} topics.
- The transcript comes from automatic speech recognition and may contain errors; ignore garbled fragments.
- Speakers are not labelled. Attribute carefully and stay neutral when it is unclear who said what.

Return JSON with exactly:
{
  "title": "<short title for this check-in, at most 5 words>",
  "items": [{ "question": "<topic as a question>", "answer": "<what was said>" }],
  "summary": "<2-4 sentence summary, including anything that was agreed>"
}`;

/** Asks Seneca to recap a template-less conversation as questions and answers. */
export async function structureOpenTranscript(params: {
  transcript: string;
  memberName: string;
}): Promise<OpenCheckInStructure> {
  const context = `Team member: ${params.memberName}

Transcript:
${params.transcript}`;

  const raw = await senecaJson<RawOpenCheckIn>(OPEN_INSTRUCTION, context);
  return normalizeOpenCheckIn(raw);
}
