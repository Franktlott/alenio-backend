import { describe, expect, test } from "bun:test";
import { addPersonActionKeys } from "./add-person-actions";

describe("addPersonActionKeys", () => {
  test("always offers the connection flow", () => {
    expect(addPersonActionKeys(false)).toEqual(["connect"]);
  });

  test("adds workspace invitation only when permitted", () => {
    expect(addPersonActionKeys(true)).toEqual(["connect", "invite"]);
  });
});
