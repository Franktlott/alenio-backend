import { describe, expect, test } from "bun:test";

import {
  appendTranscriptionDelta,
  pcm16Base64Rms,
} from "./check-in-live-transcription";

describe("appendTranscriptionDelta", () => {
  test("keeps leading spaces that separate words", () => {
    expect(appendTranscriptionDelta("And", " she")).toBe("And she");
    expect(
      appendTranscriptionDelta("And she", " used to reside"),
    ).toBe("And she used to reside");
  });

  test("inserts a space when deltas arrive as bare words", () => {
    expect(appendTranscriptionDelta("And", "she")).toBe("And she");
    expect(
      appendTranscriptionDelta("And she used to reside", "therein"),
    ).toBe("And she used to reside therein");
  });
});

describe("pcm16Base64Rms", () => {
  test("returns 0 for silence", () => {
    const samples = 100;
    const bytes = new Uint8Array(samples * 2);
    const binary = String.fromCharCode(...bytes);
    expect(pcm16Base64Rms(btoa(binary))).toBe(0);
  });

  test("returns a higher value for a loud square wave", () => {
    const samples = 200;
    const bytes = new Uint8Array(samples * 2);
    for (let i = 0; i < samples; i += 1) {
      const value = i % 2 === 0 ? 20000 : -20000;
      bytes[i * 2] = value & 0xff;
      bytes[i * 2 + 1] = (value >> 8) & 0xff;
    }
    const binary = String.fromCharCode(...bytes);
    expect(pcm16Base64Rms(btoa(binary))).toBeGreaterThan(0.4);
  });
});
