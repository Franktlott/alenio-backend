import { describe, expect, it } from "bun:test";
import {
  canShowAgendaVideoJoin,
  rankMeetingsForBanner,
} from "./video-meeting-join";

function meeting(id: string, start: string, end: string) {
  return { event: { id, startDate: start, endDate: end } };
}

describe("rankMeetingsForBanner", () => {
  const now = Date.parse("2026-09-12T16:00:00.000Z");

  it("puts an in-progress meeting ahead of one that has not started", () => {
    const upcoming = meeting(
      "later",
      "2026-09-12T16:10:00.000Z",
      "2026-09-12T16:40:00.000Z",
    );
    const live = meeting(
      "now",
      "2026-09-12T15:50:00.000Z",
      "2026-09-12T16:20:00.000Z",
    );

    expect(rankMeetingsForBanner([upcoming, live], now).map((m) => m.event.id)).toEqual([
      "now",
      "later",
    ]);
  });

  it("orders overlapping live meetings by earliest start", () => {
    const second = meeting(
      "second",
      "2026-09-12T15:55:00.000Z",
      "2026-09-12T16:25:00.000Z",
    );
    const first = meeting(
      "first",
      "2026-09-12T15:45:00.000Z",
      "2026-09-12T16:15:00.000Z",
    );

    expect(rankMeetingsForBanner([second, first], now).map((m) => m.event.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("skips dismissed meetings", () => {
    const keep = meeting(
      "keep",
      "2026-09-12T15:50:00.000Z",
      "2026-09-12T16:20:00.000Z",
    );
    const gone = meeting(
      "gone",
      "2026-09-12T15:40:00.000Z",
      "2026-09-12T16:10:00.000Z",
    );

    expect(
      rankMeetingsForBanner([gone, keep], now, ["gone"]).map((m) => m.event.id),
    ).toEqual(["keep"]);
  });
});

describe("canShowAgendaVideoJoin", () => {
  it("shows Join 15 minutes before start through the meeting", () => {
    expect(
      canShowAgendaVideoJoin(
        "2026-09-12T05:21:00.000Z",
        "2026-09-12T06:21:00.000Z",
        Date.parse("2026-09-12T05:20:00.000Z"),
      ),
    ).toBe(true);
  });

  it("hides Join for a later meeting the same day", () => {
    expect(
      canShowAgendaVideoJoin(
        "2026-09-13T03:49:00.000Z",
        "2026-09-13T04:49:00.000Z",
        Date.parse("2026-09-12T05:20:00.000Z"),
      ),
    ).toBe(false);
  });

  it("hides Join after the meeting ends", () => {
    expect(
      canShowAgendaVideoJoin(
        "2026-09-12T03:49:00.000Z",
        "2026-09-12T04:49:00.000Z",
        Date.parse("2026-09-12T05:13:00.000Z"),
      ),
    ).toBe(false);
  });

  it("still shows Join when end is missing or equal to start", () => {
    const now = Date.parse("2026-09-12T05:21:00.000Z");
    expect(
      canShowAgendaVideoJoin("2026-09-12T05:21:00.000Z", null, now),
    ).toBe(true);
    expect(
      canShowAgendaVideoJoin(
        "2026-09-12T05:21:00.000Z",
        "2026-09-12T05:21:00.000Z",
        now,
      ),
    ).toBe(true);
  });
});
