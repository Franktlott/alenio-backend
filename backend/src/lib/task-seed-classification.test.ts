import { describe, expect, test } from "bun:test";

describe("development task seed classification", () => {
  test("marks every Momentum demo task as an eligible workspace task", async () => {
    const source = await Bun.file(
      new URL("../../scripts/seed-workspace-network-dev.ts", import.meta.url),
    ).text();

    expect(source.match(/prisma\.task\.create\(/g)).toHaveLength(2);
    expect(source.match(/kind: "workspace_task"/g)).toHaveLength(2);
    expect(source.match(/momentumEligible: true/g)).toHaveLength(2);
    expect(source).toContain("Momentum demo · completed on time");
    expect(source).toContain("Momentum demo · overdue");
  });
});
