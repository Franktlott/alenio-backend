import { env } from "../env";

/**
 * One-line, credential-free summary of DATABASE_URL for public /health responses.
 */
export function getDatabasePublicSummary(): string {
  const raw = env.DATABASE_URL.trim();
  if (!raw) return "(not configured)";

  if (raw.startsWith("file:")) {
    const path = raw.slice("file:".length).trim() || "./dev.db";
    return `SQLite — ${path}`;
  }

  try {
    const normalized = raw.replace(/^postgres(ql)?:/i, "https:");
    const u = new URL(normalized);
    const host = u.hostname || "unknown";
    const dbPath = u.pathname.replace(/^\//, "").split("?")[0];
    return dbPath ? `PostgreSQL — ${host} / ${dbPath}` : `PostgreSQL — ${host}`;
  } catch {
    return "PostgreSQL (configured)";
  }
}
