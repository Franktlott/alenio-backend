import type {
  WalkCorrectiveAction,
  WalkTemplate,
  WalkTemplateItem,
  WalkTemplateSection,
} from "@prisma/client";

type ItemWithActions = WalkTemplateItem & { correctiveActions?: WalkCorrectiveAction[] };
type SectionWithItems = WalkTemplateSection & { items?: ItemWithActions[] };
type TemplateFull = WalkTemplate & {
  sections?: SectionWithItems[];
  items?: ItemWithActions[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function serializeWalkItem(item: ItemWithActions) {
  return {
    id: item.id,
    templateId: item.templateId,
    sectionId: item.sectionId,
    type: item.type,
    title: item.label,
    description: item.description,
    instructions: item.instructions,
    position: item.sortOrder,
    required: item.required,
    failureBehavior: item.failureBehavior,
    config: asRecord(item.config),
    correctiveActions: (item.correctiveActions ?? []).map((a) => ({
      id: a.id,
      itemId: a.itemId,
      trigger: a.trigger,
      actionType: a.actionType,
      title: a.title,
      instructions: a.instructions,
      position: a.position,
      required: a.required,
      config: a.config == null ? null : asRecord(a.config),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializeWalkSection(section: SectionWithItems) {
  const items = [...(section.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: section.id,
    templateId: section.templateId,
    title: section.title,
    description: section.description,
    position: section.sortOrder,
    items: items.map(serializeWalkItem),
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export function serializeWalkTemplate(template: TemplateFull, opts?: { includeItemsLoose?: boolean }) {
  const sections = [...(template.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const looseItems = [...(template.items ?? [])]
    .filter((i) => !i.sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: template.id,
    teamId: template.teamId,
    name: template.name,
    description: template.description,
    workplace: template.workplace,
    scoringEnabled: template.scoringEnabled,
    status: template.status,
    version: template.version,
    estimatedDurationMinutes: template.estimatedDurationMinutes,
    publishedAt: template.publishedAt?.toISOString() ?? null,
    publishedByUserId: template.publishedByUserId,
    parentTemplateId: template.parentTemplateId,
    isActive: template.isActive,
    createdByUserId: template.createdByUserId,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    sections: sections.map(serializeWalkSection),
    ...(opts?.includeItemsLoose ? { unsectionedItems: looseItems.map(serializeWalkItem) } : {}),
  };
}
