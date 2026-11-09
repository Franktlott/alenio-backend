import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { requireAbility, requireAbilityByMethod, type StaffActor } from "./admin-guard";
import type { StaffRole } from "../lib/staff-roles";

function appFor(role: StaffRole | null) {
  const app = new Hono();
  // Stands in for adminGuard: the actor is resolved once and cached on the request.
  app.use("*", async (c, next) => {
    const actor: StaffActor | null = role ? { id: "u1", email: "a@lotttechnologies.com", role } : null;
    (c as unknown as { set(key: string, value: unknown): void }).set("staffActor", actor);
    await next();
  });
  app.delete("/users/:id", requireAbility("users.delete"), (c) => c.json({ id: c.req.param("id") }));
  app.use("/content/*", requireAbilityByMethod("content.view", "content.edit"));
  app.get("/content/articles", (c) => c.json({ ok: true }));
  app.post("/content/articles", (c) => c.json({ ok: true }));
  return app;
}

describe("requireAbility", () => {
  test("lets a Super Admin delete a user", async () => {
    const res = await appFor("super_admin").request("/users/42", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "42" });
  });

  test("blocks Support from deleting a user", async () => {
    const res = await appFor("support").request("/users/42", { method: "DELETE" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STAFF_FORBIDDEN");
  });

  test("blocks a request with no staff role", async () => {
    const res = await appFor(null).request("/users/42", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("requireAbilityByMethod", () => {
  test("Read-only can read Discover admin but not change it", async () => {
    const app = appFor("read_only");
    expect((await app.request("/content/articles")).status).toBe(200);
    expect((await app.request("/content/articles", { method: "POST" })).status).toBe(403);
  });

  test("Content Editor can change Discover", async () => {
    const res = await appFor("content_editor").request("/content/articles", { method: "POST" });
    expect(res.status).toBe(200);
  });

  test("Support cannot even read Discover admin", async () => {
    expect((await appFor("support").request("/content/articles")).status).toBe(403);
  });
});
