/**
 * Seed a Cooler Walk draft template for a workspace.
 *
 * Usage:
 *   bun run scripts/seed-cooler-walk.ts <teamId> <createdByUserId>
 */
import { prisma } from "../src/prisma";
import { DEFAULT_TEMPERATURE_CONFIG } from "../src/lib/walks/item-types/temperature";
import { DEFAULT_YES_NO_CONFIG } from "../src/lib/walks/item-types/yes-no";
import { DEFAULT_VISUAL_CHECK_CONFIG } from "../src/lib/walks/item-types/visual-check";
import { DEFAULT_PHOTO_CONFIG } from "../src/lib/walks/item-types/photo";

async function main() {
  const teamId = process.argv[2];
  const userId = process.argv[3];
  if (!teamId || !userId) {
    console.error("Usage: bun run scripts/seed-cooler-walk.ts <teamId> <createdByUserId>");
    process.exit(1);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    console.error("Team not found");
    process.exit(1);
  }

  const template = await prisma.walkTemplate.create({
    data: {
      teamId,
      name: "Cooler Walk",
      description: "Food safety and product condition walk for RSS / cooler areas.",
      workplace: team.name,
      status: "DRAFT",
      version: 1,
      estimatedDurationMinutes: 15,
      createdByUserId: userId,
      sections: {
        create: [
          { title: "Food Safety", sortOrder: 0 },
          { title: "Product Condition", sortOrder: 1 },
          { title: "Cleanliness", sortOrder: 2 },
          { title: "Final Verification", sortOrder: 3 },
        ],
      },
    },
    include: { sections: true },
  });

  const byTitle = Object.fromEntries(template.sections.map((s) => [s.title, s.id]));

  const items: Array<{
    sectionTitle: string;
    type: string;
    label: string;
    sortOrder: number;
    config: object;
  }> = [
    {
      sectionTitle: "Food Safety",
      type: "TEMPERATURE",
      label: "RSS Chicken – Hold Temp",
      sortOrder: 0,
      config: { ...DEFAULT_TEMPERATURE_CONFIG, comparisonType: "ABOVE", minimumTemperature: 165 },
    },
    {
      sectionTitle: "Food Safety",
      type: "TEMPERATURE",
      label: "Walk-In Cooler Temp",
      sortOrder: 1,
      config: {
        ...DEFAULT_TEMPERATURE_CONFIG,
        comparisonType: "BETWEEN",
        minimumTemperature: 34,
        maximumTemperature: 40,
      },
    },
    {
      sectionTitle: "Product Condition",
      type: "YES_NO",
      label: "Are any products frozen?",
      sortOrder: 0,
      config: { ...DEFAULT_YES_NO_CONFIG, passingAnswer: "NO" },
    },
    {
      sectionTitle: "Product Condition",
      type: "YES_NO",
      label: "Are all containers covered?",
      sortOrder: 1,
      config: { ...DEFAULT_YES_NO_CONFIG, passingAnswer: "YES" },
    },
    {
      sectionTitle: "Product Condition",
      type: "VISUAL_CHECK",
      label: "Are products properly dated?",
      sortOrder: 2,
      config: {
        ...DEFAULT_VISUAL_CHECK_CONFIG,
        passingOptions: ["Yes – dated correctly"],
        failingOptions: ["No – missing or incorrect dates"],
      },
    },
    {
      sectionTitle: "Cleanliness",
      type: "VISUAL_CHECK",
      label: "Are floors and shelves clean?",
      sortOrder: 0,
      config: DEFAULT_VISUAL_CHECK_CONFIG,
    },
    {
      sectionTitle: "Final Verification",
      type: "PHOTO",
      label: "Capture a photo of the cooler",
      sortOrder: 0,
      config: DEFAULT_PHOTO_CONFIG,
    },
  ];

  for (const item of items) {
    await prisma.walkTemplateItem.create({
      data: {
        templateId: template.id,
        sectionId: byTitle[item.sectionTitle]!,
        type: item.type,
        label: item.label,
        sortOrder: item.sortOrder,
        required: true,
        config: item.config,
      },
    });
  }

  console.log(JSON.stringify({ templateId: template.id, name: template.name, sections: template.sections.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
