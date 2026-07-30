import { prisma } from "../src/prisma";
import { ensureSenecaTeamBriefSchema } from "../src/lib/ensure-seneca-team-brief-schema";

async function main() {
  const result = await ensureSenecaTeamBriefSchema(prisma);
  if (!result.ok) throw new Error(result.error);
  console.log("Seneca team brief schema ensured");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
