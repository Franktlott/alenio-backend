import { describe, expect, test } from "bun:test";
import {
  cleanMediaUrl,
  isUnrestrictedLicense,
  mapWikimediaPages,
  normalizeStockPhotoQuery,
} from "./stock-photos";

describe("stock photos", () => {
  test("keeps a short searchable phrase", () => {
    expect(normalizeStockPhotoQuery("  Water Fall!!  ")).toBe("Water Fall");
    expect(normalizeStockPhotoQuery("x")).toBeNull();
  });

  test("allows public-domain licenses only", () => {
    expect(isUnrestrictedLicense("CC0")).toBe(true);
    expect(isUnrestrictedLicense("Public domain")).toBe(true);
    expect(isUnrestrictedLicense("CC BY-SA 3.0")).toBe(false);
    expect(isUnrestrictedLicense("CC BY 4.0")).toBe(false);
  });

  test("strips tracking params from media urls", () => {
    expect(
      cleanMediaUrl(
        "https://upload.wikimedia.org/wikipedia/commons/a.jpg?utm_source=commons.wikimedia.org",
      ),
    ).toBe("https://upload.wikimedia.org/wikipedia/commons/a.jpg");
  });

  test("maps only jpeg/png/webp cc0 files", () => {
    const photos = mapWikimediaPages({
      "1": {
        pageid: 1,
        title: "File:Office_team.jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumburl: "https://thumb.wikimedia.org/office.jpg",
            url: "https://upload.wikimedia.org/office.jpg",
            extmetadata: { LicenseShortName: { value: "CC0" } },
          },
        ],
      },
      "2": {
        pageid: 2,
        title: "File:clip.webm",
        imageinfo: [
          {
            mime: "video/webm",
            url: "https://upload.wikimedia.org/clip.webm",
            extmetadata: { LicenseShortName: { value: "CC0" } },
          },
        ],
      },
    });
    expect(photos).toEqual([
      {
        id: "1",
        title: "Office team",
        thumbUrl: "https://thumb.wikimedia.org/office.jpg",
        url: "https://thumb.wikimedia.org/office.jpg",
      },
    ]);
  });
});
