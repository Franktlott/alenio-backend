import { describe, expect, test } from "bun:test";
import {
  isSenecaImageEditRequest,
  isSenecaImageRequest,
} from "./seneca-image-intent";

describe("Seneca image intent", () => {
  test("detects clear generation requests", () => {
    expect(isSenecaImageRequest("Generate an image of a mountain cabin")).toBe(true);
    expect(isSenecaImageRequest("Design a poster for our summer party")).toBe(true);
    expect(isSenecaImageRequest("Show me an illustration of a calm workspace")).toBe(true);
    expect(isSenecaImageRequest("Generate a Wawa themed GIF. Great job J’Zaria!")).toBe(true);
    expect(isSenecaImageRequest("Make a celebration meme for the team")).toBe(true);
    expect(isSenecaImageRequest("Create an onboarding infographic")).toBe(true);
    expect(isSenecaImageRequest("Draw a friendly team mascot")).toBe(true);
  });

  test("keeps ordinary coaching requests in text chat", () => {
    expect(isSenecaImageRequest("Help me prepare for a difficult conversation")).toBe(false);
    expect(isSenecaImageRequest("Create a development goal")).toBe(false);
    expect(isSenecaImageRequest("Generate a checklist for opening")).toBe(false);
    expect(isSenecaImageRequest("What image does my leadership style project?")).toBe(false);
  });
});

describe("Seneca image edit intent", () => {
  test("detects explicit edit instructions for supported images", () => {
    const mimeType = "image/png";

    expect(isSenecaImageEditRequest("Recolor the wall blue", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Remove the person in the background", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Replace the logo and resize this", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Apply a watercolor style", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Turn this office into a cafe", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Make the flowers blue", mimeType)).toBe(true);
    expect(isSenecaImageEditRequest("Make the water swampy", mimeType)).toBe(true);
  });

  test("keeps image questions and analysis on the vision ask path", () => {
    const mimeType = "image/jpeg";

    expect(isSenecaImageEditRequest("What is this?", mimeType)).toBe(false);
    expect(isSenecaImageEditRequest("Analyze this image", mimeType)).toBe(false);
    expect(isSenecaImageEditRequest("Summarize what you see", mimeType)).toBe(false);
    expect(isSenecaImageEditRequest("Create a caption for this image", mimeType)).toBe(false);
  });

  test("never treats PDFs or missing attachments as image edits", () => {
    expect(
      isSenecaImageEditRequest("Remove the last section", "application/pdf"),
    ).toBe(false);
    expect(isSenecaImageEditRequest("Crop this image")).toBe(false);
  });
});
