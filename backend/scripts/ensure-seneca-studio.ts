import { prisma } from "../src/prisma";
import { ensureSenecaStudioSchema } from "../src/lib/ensure-seneca-studio-schema";

async function main() {
  await ensureSenecaStudioSchema(prisma);
  console.log("Seneca studio schema ensured");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
