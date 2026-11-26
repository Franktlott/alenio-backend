import { beforeAll, describe, expect, test } from "bun:test";
import {
  ORPHAN_PROTECTED_ACTIVITY_TYPES,
  collectUploadObjectPathsFromValue,
} from "./orphan-upload-cleanup";

const BUCKET = "alenio-test.appspot.com";

beforeAll(() => {
  process.env.FIREBASE_STORAGE_BUCKET = BUCKET;
});

describe("orphan upload activity media protection", () => {
  test("protects workspace and Alenio posts, not only network posts", () => {
    expect(ORPHAN_PROTECTED_ACTIVITY_TYPES).toContain("network_post");
    expect(ORPHAN_PROTECTED_ACTIVITY_TYPES).toContain("post");
    expect(ORPHAN_PROTECTED_ACTIVITY_TYPES).toContain("alenio_post");
  });

  test("collects imageUrl paths from post metadata", () => {
    const objectPath =
      "users/user-1/uploads/123-IMG_0284.jpg";
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
      objectPath,
    )}?alt=media&token=test-token`;

    const paths = collectUploadObjectPathsFromValue({
      body: "How cute",
      imageUrl: url,
      mediaType: "image",
      imageWidth: 960,
      imageHeight: 960,
    });

    expect(paths.has(objectPath)).toBe(true);
  });
});
