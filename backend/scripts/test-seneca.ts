/**
 * Quick Seneca smoke test — run from backend/: bun run scripts/test-seneca.ts
 */
import { senecaAvailable, senecaJson } from "../src/lib/seneca-openai";

async function main() {
  console.log("Seneca available:", senecaAvailable());
  if (!senecaAvailable()) {
    console.error("FAIL: OPENAI_API_KEY not set in backend/.env");
    process.exit(1);
  }

  const prep = await senecaJson<{
    suggestedTalkingPoints: string[];
    suggestedCoachingQuestions: string[];
  }>(
    `Return JSON with suggestedTalkingPoints (array of 2 strings) and suggestedCoachingQuestions (array of 2 strings) for a manager check-in with a team member named Alex who has 2 open tasks.`,
    JSON.stringify({ memberName: "Alex", activeTasks: 2 }),
  );

  if (!prep.suggestedTalkingPoints?.length || !prep.suggestedCoachingQuestions?.length) {
    console.error("FAIL: unexpected response shape", prep);
    process.exit(1);
  }

  console.log("OK: OpenAI responded");
  console.log("  Talking point:", prep.suggestedTalkingPoints[0]);
  console.log("  Question:", prep.suggestedCoachingQuestions[0]);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
