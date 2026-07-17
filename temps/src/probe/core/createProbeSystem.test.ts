import { describe, expect, it } from "vitest";
import { MockProbeAdapter } from "../mock/MockProbeAdapter";
import { createProbeSystem } from "./createProbeSystem";

describe("createProbeSystem", () => {
  it("wires session, store, and dispose lifecycle", async () => {
    const adapter = new MockProbeAdapter({ scenario: "one" });
    const system = createProbeSystem({ adapter });

    await system.session.startScan();
    expect(system.store.getSnapshot().discovered).toHaveLength(1);

    system.dispose();
    expect(system.store.getSnapshot().disposed).toBe(true);
    expect(() => adapter.setScenario("zero")).toThrow(/disposed/i);
  });
});
