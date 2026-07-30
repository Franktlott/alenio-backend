import { describe, expect, test } from "bun:test";
import { shouldSyncAuthImage } from "./auth-image-sync";

process.env.FIREBASE_STORAGE_BUCKET = "alenio-test.firebasestorage.app";

describe("shouldSyncAuthImage", () => {
  test("preserves an uploaded app profile photo", () => {
    const uploaded =
      "https://firebasestorage.googleapis.com/v0/b/alenio-test.firebasestorage.app/o/users%2Fuser-1%2Fprofile%2Favatar?alt=media&token=upload";

    expect(
      shouldSyncAuthImage(
        "user-1",
        uploaded,
        "https://lh3.googleusercontent.com/older-provider-photo",
      ),
    ).toBe(false);
  });

  test("keeps provider image sync when there is no uploaded app photo", () => {
    expect(
      shouldSyncAuthImage(
        "user-1",
        "https://lh3.googleusercontent.com/old-provider-photo",
        "https://lh3.googleusercontent.com/new-provider-photo",
      ),
    ).toBe(true);
    expect(
      shouldSyncAuthImage(
        "user-1",
        null,
        "https://lh3.googleusercontent.com/provider-photo",
      ),
    ).toBe(true);
  });

  test("ignores empty or unchanged auth images", () => {
    const providerPhoto = "https://lh3.googleusercontent.com/provider-photo";
    expect(shouldSyncAuthImage("user-1", providerPhoto, null)).toBe(false);
    expect(shouldSyncAuthImage("user-1", providerPhoto, providerPhoto)).toBe(false);
  });
});
