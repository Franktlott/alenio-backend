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

export function senecaOpenAiKey(): string {
  return resolveOpenAiKey();
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

export type SenecaOpenAiUserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "auto" } }
    >;

export function buildSenecaUserContent(
  text: string,
  imageDataUrl?: string,
): SenecaOpenAiUserContent {
  if (!imageDataUrl) return text;
  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
  ];
}

export async function senecaJson<T>(
  instruction: string,
  context: string,
  options?: {
    systemPrompt?: string;
    imageDataUrl?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<T> {
  if (!senecaAvailable()) {
    throw new Error(senecaUnavailableMessage());
  }

  const historyMessages = (options?.history ?? []).map((message) => ({
    role: message.role,
    content: message.content,
  }));

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
        ...historyMessages,
        {
          role: "user",
          content: buildSenecaUserContent(
            `${instruction}\n\n---\nContext:\n${context}`,
            options?.imageDataUrl,
          ),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Seneca provider request failed", {
      status: res.status,
      detail: body.slice(0, 500),
    });
    if (
      res.status === 400 &&
      /unsupported image|image.*format|invalid.*image/i.test(body)
    ) {
      throw new Error(
        "I couldn’t read that image. Please choose a JPG, PNG, or WebP image and try again.",
      );
    }
    throw new Error("I couldn’t complete that request right now. Please try again.");
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
  options?: {
    systemPrompt?: string;
    imageDataUrl?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<string> {
  if (!senecaAvailable()) {
    throw new Error(senecaUnavailableMessage());
  }

  const historyMessages = (options?.history ?? []).map((message) => ({
    role: message.role,
    content: message.content,
  }));

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
        ...historyMessages,
        {
          role: "user",
          content: buildSenecaUserContent(
            `${instruction}\n\n---\nContext:\n${context}`,
            options?.imageDataUrl,
          ),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Seneca provider request failed", {
      status: res.status,
      detail: body.slice(0, 500),
    });
    if (
      res.status === 400 &&
      /unsupported image|image.*format|invalid.*image/i.test(body)
    ) {
      throw new Error(
        "I couldn’t read that image. Please choose a JPG, PNG, or WebP image and try again.",
      );
    }
    throw new Error("I couldn’t complete that request right now. Please try again.");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Seneca returned an empty response.");
  return text;
}

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: SenecaOpenAiUserContent | string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

function parseJsonContent<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as T;
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function senecaJsonWithTools<T>(
  instruction: string,
  context: string,
  options: {
    systemPrompt?: string;
    imageDataUrl?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    tools: unknown[];
    maxRounds?: number;
    executeTool: (name: string, argumentsJson: string) => Promise<unknown>;
    wrapToolResult: (payload: unknown) => string;
  },
): Promise<T> {
  if (!senecaAvailable()) {
    throw new Error(senecaUnavailableMessage());
  }

  const maxRounds = options.maxRounds ?? 8;
  const messages: OpenAiChatMessage[] = [
    { role: "system", content: options.systemPrompt ?? COACHING_SYSTEM },
    ...(options.history ?? []).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: buildSenecaUserContent(
        `${instruction}\n\n---\nContext:\n${context}`,
        options.imageDataUrl,
      ),
    },
  ];

  let forceJson = false;
  for (let round = 0; round < maxRounds; round += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveOpenAiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.4,
        messages,
        ...(forceJson
          ? { response_format: { type: "json_object" } }
          : { tools: options.tools, tool_choice: "auto" }),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Seneca provider request failed", {
        status: res.status,
        detail: body.slice(0, 500),
      });
      throw new Error("I couldn’t complete that request right now. Please try again.");
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
      }>;
    };
    const message = data.choices?.[0]?.message;
    const toolCalls = forceJson ? [] : (message?.tool_calls ?? []);
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: message?.content ?? null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const payload = await options.executeTool(
          call.function.name,
          call.function.arguments ?? "{}",
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: options.wrapToolResult(payload),
        });
      }
      continue;
    }

    const raw = message?.content?.trim();
    const parsed = raw ? parseJsonContent<T>(raw) : null;
    if (parsed) return parsed;
    if (!forceJson) {
      if (raw) {
        messages.push({ role: "assistant", content: raw });
      }
      messages.push({
        role: "user",
        content:
          "Return JSON now with a complete message string (all facts in message, not only a heading), insights array, suggestedActions array, and null for planOneOnOne, cancelOneOnOne, and createTask unless drafting a confirmation the app will show.",
      });
      forceJson = true;
      continue;
    }
    if (!raw) throw new Error("Seneca returned an empty response.");
    throw new Error("Seneca returned invalid JSON.");
  }

  throw new Error("I couldn’t complete that request right now. Please try again.");
}
