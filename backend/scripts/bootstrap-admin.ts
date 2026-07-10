/**
 * One-time bootstrap: create platform admin login (Neon Auth + Prisma isAdmin).
 * Usage: cd backend && bun run scripts/bootstrap-admin.ts
 */
import { env } from "../src/env";
import { prisma } from "../src/prisma";

const EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@alenio.app").trim().toLowerCase();
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "AlenioAdmin123!";
const NAME = process.env.BOOTSTRAP_ADMIN_NAME ?? "Alenio Admin";
const ORIGIN = (env.BACKEND_URL || "http://localhost:3000").replace(/\/$/, "");
if (ORIGIN === "http://localhost") {
  // Neon Auth rejects bare localhost without a port as Origin in some setups
}

async function neonPost(path: string, body: Record<string, unknown>) {
  const base = env.NEON_AUTH_URL.replace(/\/$/, "");
  const origin = ORIGIN.includes("localhost") && !ORIGIN.includes(":3000")
    ? "http://localhost:3000"
    : ORIGIN;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const signUp = await neonPost("/sign-up/email", {
    email: EMAIL,
    password: PASSWORD,
    name: NAME,
  });
  console.log("sign-up:", signUp.status, JSON.stringify(signUp.data)?.slice(0, 200));

  let authId: string | null =
    signUp.data?.user?.id ??
    signUp.data?.data?.user?.id ??
    null;

  if (!authId) {
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM neon_auth."user" WHERE email = ${EMAIL} LIMIT 1
      `;
      authId = rows[0]?.id ?? null;
    } catch (err) {
      console.warn("neon_auth lookup failed:", err);
    }
  }

  if (!authId) {
    const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    authId = existing?.id ?? null;
  }

  if (!authId) {
    console.error("Could not resolve auth user id.");
    process.exit(1);
  }

  try {
    await prisma.$executeRaw`
      UPDATE neon_auth."user"
      SET "emailVerified" = true, "updatedAt" = NOW()
      WHERE id = CAST(${authId} AS uuid)
    `;
  } catch (err) {
    console.warn("verify update failed:", err);
  }

  const byId = await prisma.user.findUnique({ where: { id: authId } });
  const byEmail = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (byId) {
    await prisma.user.update({
      where: { id: authId },
      data: { isAdmin: true, emailVerified: true, name: NAME },
    });
  } else if (byEmail) {
    await prisma.user.update({
      where: { email: EMAIL },
      data: { isAdmin: true, emailVerified: true, name: NAME },
    });
  } else {
    await prisma.user.create({
      data: {
        id: authId,
        email: EMAIL,
        name: NAME,
        emailVerified: true,
        isAdmin: true,
        updatedAt: new Date(),
      },
    });
  }

  const signIn = await neonPost("/sign-in/email", { email: EMAIL, password: PASSWORD });
  console.log("sign-in check:", signIn.status, signIn.ok ? "ok" : JSON.stringify(signIn.data));

  console.log("\nInitial admin ready.");
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
