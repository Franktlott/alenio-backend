import type {
  WalkCorrectiveAction,
  WalkLibraryItem,
  WalkLibraryItemVersion,
  WalkTemplate,
  WalkTemplateItem,
  WalkTemplatePlacement,
  WalkTemplateSection,
} from "@prisma/client";

type ItemLegacy = WalkTemplateItem;
type PlacementFull = WalkTemplatePlacement & {
  libraryItem?: WalkLibraryItem;
  libraryItemVersion?: WalkLibraryItemVersion & { correctiveActions?: WalkCorrectiveAction[] };
};
type SectionWithChildren = WalkTemplateSection & {
  items?: ItemLegacy[];
  placements?: PlacementFull[];
};
type TemplateFull = WalkTemplate & {
  sections?: SectionWithChildren[];
  items?: ItemLegacy[];
  placements?: PlacementFull[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function serializeCorrectiveAction(a: WalkCorrectiveAction) {
  return {
    id: a.id,
    libraryItemVersionId: a.libraryItemVersionId,
    trigger: a.trigger,
    actionType: a.actionType,
    title: a.title,
    instructions: a.instructions,
    position: a.position,
    required: a.required,
    blocksCompletion: a.blocksCompletion,
    config: a.config == null ? null : asRecord(a.config),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function serializeWalkItem(item: ItemLegacy) {
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
    libraryItemId: item.libraryItemId,
    correctiveActions: [] as ReturnType<typeof serializeCorrectiveAction>[],
    source: "legacy" as const,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializePlacement(placement: PlacementFull) {
  const ver = placement.libraryItemVersion;
  const lib = placement.libraryItem;
  const title = placement.titleOverride?.trim() || ver?.name || lib?.name || "Item";
  const instructions =
    placement.instructionsOverride !== null && placement.instructionsOverride !== undefined
      ? placement.instructionsOverride
      : (ver?.instructions ?? null);
  const required =
    placement.requiredOverride !== null && placement.requiredOverride !== undefined
      ? placement.requiredOverride
      : (ver?.requiredDefault ?? true);

  return {
    id: placement.id,
    templateId: placement.templateId,
    sectionId: placement.sectionId,
    type: lib?.type ?? "YES_NO",
    title,
    description: ver?.description ?? lib?.description ?? null,
    instructions,
    position: placement.sortOrder,
    required,
    failureBehavior: null as string | null,
    config: asRecord(ver?.config),
    libraryItemId: placement.libraryItemId,
    libraryItemVersionId: placement.libraryItemVersionId,
    libraryItemVersion: ver?.version ?? null,
    libraryItemCurrentVersion: lib?.currentVersion ?? null,
    category: lib?.category ?? null,
    titleOverride: placement.titleOverride,
    instructionsOverride: placement.instructionsOverride,
    requiredOverride: placement.requiredOverride,
    deviceMethods: asRecord(ver?.deviceMethods),
    correctiveActions: (ver?.correctiveActions ?? []).map(serializeCorrectiveAction),
    source: "placement" as const,
    createdAt: placement.createdAt.toISOString(),
    updatedAt: placement.updatedAt.toISOString(),
  };
}

export function serializeWalkSection(section: SectionWithChildren) {
  const placements = [...(section.placements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const legacyItems = [...(section.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const items =
    placements.length > 0
      ? placements.map(serializePlacement)
      : legacyItems.map(serializeWalkItem);

  return {
    id: section.id,
    templateId: section.templateId,
    title: section.title,
    description: section.description,
    position: section.sortOrder,
    items,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export function serializeWalkTemplate(template: TemplateFull, opts?: { includeItemsLoose?: boolean }) {
  const sections = [...(template.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const loosePlacements = [...(template.placements ?? [])]
    .filter((p) => !p.sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const looseLegacy = [...(template.items ?? [])]
    .filter((i) => !i.sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const unsectionedItems =
    loosePlacements.length > 0
      ? loosePlacements.map(serializePlacement)
      : looseLegacy.map(serializeWalkItem);

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
    ...(opts?.includeItemsLoose ? { unsectionedItems } : {}),
  };
}

export function serializeLibraryItem(
  item: WalkLibraryItem & {
    versions?: Array<WalkLibraryItemVersion & { correctiveActions?: WalkCorrectiveAction[] }>;
  },
) {
  const versions = [...(item.versions ?? [])].sort((a, b) => b.version - a.version);
  const current = versions.find((v) => v.version === item.currentVersion) ?? versions[0] ?? null;
  return {
    id: item.id,
    teamId: item.teamId,
    name: item.name,
    description: item.description,
    category: item.category,
    type: item.type,
    status: item.status,
    currentVersion: item.currentVersion,
    createdByUserId: item.createdByUserId,
    updatedByUserId: item.updatedByUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    current: current
      ? {
          id: current.id,
          version: current.version,
          name: current.name,
          description: current.description,
          instructions: current.instructions,
          requiredDefault: current.requiredDefault,
          config: asRecord(current.config),
          deviceMethods: asRecord(current.deviceMethods),
          correctiveActions: (current.correctiveActions ?? []).map(serializeCorrectiveAction),
          createdByUserId: current.createdByUserId,
          createdAt: current.createdAt.toISOString(),
        }
      : null,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      name: v.name,
      description: v.description,
      instructions: v.instructions,
      requiredDefault: v.requiredDefault,
      config: asRecord(v.config),
      deviceMethods: asRecord(v.deviceMethods),
      correctiveActions: (v.correctiveActions ?? []).map(serializeCorrectiveAction),
      createdByUserId: v.createdByUserId,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
