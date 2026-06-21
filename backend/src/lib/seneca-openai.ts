import { env } from "../env";

const COACHING_SYSTEM = `You are Seneca, a manager coaching assistant inside Alenio — a workplace team management app.
Your role is to help frontline team leaders run better 1:1 check-ins and development conversations.
You are NOT a general chatbot. Stay focused on coaching, feedback quality, and actionable follow-through.

Guidelines:
- Use clear, supportive, professional language appropriate for frontline managers.
- Be practical and concise — managers are busy.
- Never invent facts not present in the provided context.
- When generating suggestions, make them specific to the team member when context allows.
- Output valid JSON only when asked for JSON.`;

function resolveOpenAiKey(): string {
  const raw = env.OPENAI_API_KEY?.trim() ?? "";
  if (!raw) return "";
  // Railway paste sometimes includes wrapping quotes or accidental line breaks.
  return raw.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

export function senecaAvailable(): boolean {
  const key = resolveOpenAiKey();
  return key.startsWith("sk-") && key.length > 20;
}

export function senecaUnavailableMessage(): string {
  return "Seneca is not configured on this server. Add OPENAI_API_KEY to enable coaching assistance.";
}

export async function senecaJson<T>(instruction: string, context: string): Promise<T> {
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
        { role: "system", content: COACHING_SYSTEM },
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

export async function senecaText(instruction: string, context: string): Promise<string> {
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
        { role: "system", content: COACHING_SYSTEM },
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
