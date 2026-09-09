import { senecaJson } from "./seneca-openai";

export type MappableTemplateField = {
  id: string;
  label: string;
  type: string;
  order?: number;
  required?: boolean;
  ratingMax?: number;
  helpText?: string | null;
};

export type TranscriptMappingResult = {
  responses: Record<string, string | number>;
  /** Labels of questions the conversation never covered, surfaced to the leader. */
  unanswered: string[];
  summary: string;
};

export type RawTranscriptMapping = {
  responses?: unknown;
  unanswered?: unknown;
  summary?: unknown;
};

/** Fields the leader or associate fills in themselves; never AI-drafted. */
function isMappableField(field: MappableTemplateField): boolean {
  return field.type !== "section" && field.type !== "associate_notes";
}

function clampRating(value: unknown, ratingMax: number): number | null {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 1) return null;
  return Math.min(rounded, ratingMax);
}

function normalizeYesNo(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/^(yes|y|true|affirmative)$/.test(text)) return "yes";
  if (/^(no|n|false|negative)$/.test(text)) return "no";
  return null;
}

/**
 * Coerces model output into responses the check-in create path will accept.
 * Anything the model invented (unknown ids, unusable ratings, prose in a yes/no
 * field) is dropped rather than saved, so the leader sees a blank they can fill
 * instead of a confident-sounding guess.
 */
export function normalizeTranscriptMapping(
  raw: RawTranscriptMapping | null | undefined,
  fields: MappableTemplateField[],
): TranscriptMappingResult {
  const byId = new Map(fields.filter(isMappableField).map((field) => [field.id, field]));
  const responses: Record<string, string | number> = {};

  const rawResponses =
    raw?.responses && typeof raw.responses === "object" && !Array.isArray(raw.responses)
      ? (raw.responses as Record<string, unknown>)
      : {};

  for (const [fieldId, value] of Object.entries(rawResponses)) {
    const field = byId.get(fieldId);
    if (!field) continue;
    if (value === null || value === undefined) continue;

    if (field.type === "rating") {
      const rating = clampRating(value, field.ratingMax ?? 5);
      if (rating !== null) responses[fieldId] = rating;
      continue;
    }

    if (field.type === "yes_no") {
      const answer = normalizeYesNo(value);
      if (answer) responses[fieldId] = answer;
      continue;
    }

    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (text) responses[fieldId] = text;
  }

  const answered = new Set(Object.keys(responses));
  const unanswered = fields
    .filter((field) => isMappableField(field) && !answered.has(field.id))
    .map((field) => field.label);

  const summary =
    typeof raw?.summary === "string" ? raw.summary.trim().slice(0, 4000) : "";

  return { responses, unanswered, summary };
}

function describeFieldsForPrompt(fields: MappableTemplateField[]): string {
  return fields
    .filter(isMappableField)
    .map((field) => {
      const parts = [`id: ${field.id}`, `question: ${field.label}`];
      if (field.type === "rating") {
        parts.push(`answer with a whole number from 1 to ${field.ratingMax ?? 5}`);
      } else if (field.type === "yes_no") {
        parts.push('answer with "yes" or "no"');
      } else if (field.type === "manager_notes") {
        parts.push("leader's summary and commitments, written in the leader's voice");
      } else {
        parts.push("answer with text");
      }
      if (field.helpText) parts.push(`hint: ${field.helpText}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

const MAPPING_INSTRUCTION = `You are turning the transcript of a real check-in conversation into a draft check-in record for the leader to review.

Rules:
- Only use what was actually said. Never infer, embellish, or fill gaps with plausible-sounding content.
- If a question was not discussed, OMIT its id from responses entirely. A blank is far better than a guess.
- Write answers as concise notes in the leader's voice, not as a transcript quote.
- The transcript comes from automatic speech recognition and may contain errors; ignore garbled fragments.
- Speakers are not labelled. Attribute carefully and stay neutral when it is unclear who said what.

Return JSON with exactly:
{
  "responses": { "<field id>": "<answer>" },
  "unanswered": ["<question label that was not discussed>"],
  "summary": "<2-4 sentence summary of the conversation>"
}`;

/** Asks Seneca to fill the template's questions from the transcript. */
export async function mapTranscriptToTemplate(params: {
  transcript: string;
  templateTitle: string;
  fields: MappableTemplateField[];
  memberName: string;
}): Promise<TranscriptMappingResult> {
  const context = `Check-in template: ${params.templateTitle}
Team member: ${params.memberName}

Questions to fill in:
${describeFieldsForPrompt(params.fields)}

Transcript:
${params.transcript}`;

  const raw = await senecaJson<RawTranscriptMapping>(MAPPING_INSTRUCTION, context);
  return normalizeTranscriptMapping(raw, params.fields);
}
