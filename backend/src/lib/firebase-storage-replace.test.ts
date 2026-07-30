import { describe, expect, test } from "bun:test";
import { deleteReplacedStorageObject } from "./firebase-storage";

process.env.FIREBASE_STORAGE_BUCKET = "alenio-test.firebasestorage.app";

describe("deleteReplacedStorageObject", () => {
  test("does not delete when old and new URLs share the same profile object path", async () => {
    const oldUrl =
      "https://firebasestorage.googleapis.com/v0/b/alenio-test.firebasestorage.app/o/users%2Fuser-1%2Fprofile%2Favatar?alt=media&token=old-token";
    const newUrl =
      "https://firebasestorage.googleapis.com/v0/b/alenio-test.firebasestorage.app/o/users%2Fuser-1%2Fprofile%2Favatar?alt=media&token=new-token";

    // Would throw if it attempted a real Storage delete without credentials.
    await expect(deleteReplacedStorageObject(oldUrl, newUrl)).resolves.toBeUndefined();
  });

  test("no-ops when previous URL is empty or unchanged", async () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/alenio-test.firebasestorage.app/o/users%2Fuser-1%2Fprofile%2Favatar?alt=media&token=same";
    await expect(deleteReplacedStorageObject(null, url)).resolves.toBeUndefined();
    await expect(deleteReplacedStorageObject(url, url)).resolves.toBeUndefined();
  });
});
