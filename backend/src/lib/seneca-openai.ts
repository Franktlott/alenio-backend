import { env } from "../env";

import { SENECA_DATA_GROUNDING_RULES } from "./seneca-grounding";

const COACHING_SYSTEM = `You are Seneca, a manager coaching assistant inside Alenio — a workplace team management app.
Your role is to help frontline team leaders run better check-ins and development conversations.
You are NOT a general chatbot. Stay focused on coaching, feedback quality, and actionable follow-through.

Guidelines:
- Use clear, supportive, professional language appropriate for frontline managers.
- Be practical and concise — managers are busy.
- Never invent facts not present in the provided context.
- When generating suggestions, make them specific to the team member when context allows.
- Output valid JSON only when asked for JSON.

${SENECA_DATA_GROUNDING_RULES}`;

const OPENAI_ENV_CANDIDATES = [
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "OPEN_AI_API_KEY",
  "SENECA_OPENAI_API_KEY",
] as const;

function normalizeOpenAiKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Railway paste sometimes includes wrapping quotes or accidental line breaks.
  return trimmed.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function resolveOpenAiKeySource(): { key: string; sourceVar: string | null; raw: string } {
  for (const name of OPENAI_ENV_CANDIDATES) {
    const fromProcess = process.env[name];
    const fromEnv = name === "OPENAI_API_KEY" ? env.OPENAI_API_KEY : undefined;
    const raw = fromProcess ?? fromEnv ?? "";
    const key = normalizeOpenAiKey(raw);
    if (key) return { key, sourceVar: name, raw };
  }
  // Railway UI sometimes saves the name with a trailing space: "OPENAI_API_KEY "
  for (const [name, value] of Object.entries(process.env)) {
    if (name.trim() !== "OPENAI_API_KEY") continue;
    const raw = value ?? "";
    const key = normalizeOpenAiKey(raw);
    if (key) return { key, sourceVar: name, raw };
  }
  return { key: "", sourceVar: null, raw: "" };
}

function resolveOpenAiKey(): string {
  return resolveOpenAiKeySource().key;
}

export function senecaDiagnostics() {
  const { key, sourceVar, raw } = resolveOpenAiKeySource();
  const openAiEnvKeys = OPENAI_ENV_CANDIDATES.filter((name) => Boolean(process.env[name]?.trim()));
  const openAiRelatedEnvKeyNames = Object.keys(process.env).filter((name) => /openai/i.test(name));
  const misnamedOpenAiKey = openAiRelatedEnvKeyNames.find((name) => name !== name.trim());
  return {
    present: Boolean(raw),
    length: raw.length,
    validFormat: key.startsWith("sk-") && key.length > 20,
    sourceVar,
    openAiEnvKeys,
    openAiRelatedEnvKeyNames,
    misnamedOpenAiKey: misnamedOpenAiKey ?? null,
    railwayService: process.env.RAILWAY_SERVICE_NAME ?? null,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  };
}

export function senecaAvailable(): boolean {
  const key = resolveOpenAiKey();
  return key.startsWith("sk-") && key.length > 20;
}

export function senecaUnavailableMessage(): string {
  return "Seneca is not configured on this server. Add OPENAI_API_KEY to enable coaching assistance.";
}

export async function senecaJson<T>(
  instruction: string,
  context: string,
  options?: { systemPrompt?: string },
): Promise<T> {
  if (!senecaAvailable()) {
    throw new Error(senecaUnavailableMessage());
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveOpenAiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options?.systemPrompt ?? COACHING_SYSTEM },
        {
          role: "user",
          content: `${instruction}\n\n---\nContext:\n${context}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Seneca request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Seneca returned an empty response.");

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Seneca returned invalid JSON.");
  }
}

export async function senecaText(
  instruction: string,
  context: string,
  options?: { systemPrompt?: string },
): Promise<string> {
  if (!senecaAvailable()) {
    throw new Error(senecaUnavailableMessage());
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveOpenAiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: options?.systemPrompt ?? COACHING_SYSTEM },
        {
          role: "user",
          content: `${instruction}\n\n---\nContext:\n${context}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Seneca request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Seneca returned an empty response.");
  return text;
}
