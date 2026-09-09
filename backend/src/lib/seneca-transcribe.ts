import { env } from "../env";

import {
  senecaAvailable,
  senecaOpenAiKey,
  senecaUnavailableMessage,
} from "./seneca-openai";

/** OpenAI rejects audio uploads above 25 MB, so segments must stay well under it. */
export const TRANSCRIBE_MAX_BYTES = 24 * 1024 * 1024;

export const CHECK_IN_AUDIO_MIME_TYPES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);

export function isSupportedCheckInAudio(mimeType: string): boolean {
  return CHECK_IN_AUDIO_MIME_TYPES.has(mimeType.split(";")[0]!.trim().toLowerCase());
}

export function transcriptionAvailable(): boolean {
  return senecaAvailable();
}

export function transcriptionUnavailableMessage(): string {
  return senecaUnavailableMessage();
}

/**
 * Sends one audio segment to OpenAI and returns its plain-text transcript.
 * Empty audio (silence) legitimately transcribes to an empty string.
 */
export async function transcribeAudio(params: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  /** Nudges the model toward workplace vocabulary and carries context across segments. */
  prompt?: string;
}): Promise<string> {
  if (!transcriptionAvailable()) {
    throw new Error(transcriptionUnavailableMessage());
  }
  if (params.bytes.byteLength > TRANSCRIBE_MAX_BYTES) {
    throw new Error("That audio segment is too large to transcribe.");
  }

  const form = new FormData();
  form.append(
    "file",
    new File([params.bytes], params.filename, {
      type: params.mimeType,
    }),
  );
  form.append("model", env.OPENAI_TRANSCRIBE_MODEL);
  form.append("response_format", "text");
  if (params.prompt) {
    // The API caps prompts at 224 tokens; a short tail of prior text is plenty.
    form.append("prompt", params.prompt.slice(-600));
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${senecaOpenAiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Transcription request failed", {
      status: res.status,
      detail: body.slice(0, 500),
    });
    throw new Error("I couldn’t transcribe that audio. Please try again.");
  }

  return (await res.text()).trim();
}
