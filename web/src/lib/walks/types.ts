export type WalkItemType =
  | "TEMPERATURE"
  | "YES_NO"
  | "MULTIPLE_CHOICE"
  | "VISUAL_CHECK"
  | "QUANTITY"
  | "PHOTO"
  | "TEXT"
  | "INSTRUCTION";

export type WalkTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type WalkCorrectiveAction = {
  id: string;
  itemId: string;
  trigger: string;
  actionType: string;
  title: string;
  instructions: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown> | null;
};

export type WalkItem = {
  id: string;
  templateId: string;
  sectionId: string | null;
  type: WalkItemType;
  title: string;
  description: string | null;
  instructions: string | null;
  position: number;
  required: boolean;
  failureBehavior: string | null;
  config: Record<string, unknown>;
  correctiveActions: WalkCorrectiveAction[];
  libraryItemId?: string | null;
  libraryItemVersionId?: string | null;
  libraryItemVersion?: number | null;
  libraryItemCurrentVersion?: number | null;
  source?: "placement" | "legacy";
  createdAt: string;
  updatedAt: string;
};

export type WalkSection = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  position: number;
  items: WalkItem[];
  createdAt: string;
  updatedAt: string;
};

export type WalkTemplate = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  workplace: string;
  scoringEnabled: boolean;
  status: WalkTemplateStatus;
  version: number;
  estimatedDurationMinutes: number | null;
  publishedAt: string | null;
  publishedByUserId: string | null;
  parentTemplateId: string | null;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  sections: WalkSection[];
  unsectionedItems?: WalkItem[];
};

export type WalkItemTypeCatalogEntry = {
  type: WalkItemType;
  label: string;
  description: string;
  fullySupported: boolean;
  scorable: boolean;
  defaultConfig: Record<string, unknown>;
};

export type WalkItemResponseStatus =
  | "NOT_STARTED"
  | "PASS"
  | "FAIL"
  | "NEEDS_ACTION"
  | "RESOLVED"
  | "NOT_APPLICABLE";

export type WalkRunCorrectiveAction = {
  id: string;
  title: string;
  actionType: string;
  instructions: string | null;
  required?: boolean;
  blocksCompletion: boolean;
  branch?: "first_failure" | "if_pass" | "if_fail" | null;
  config?: Record<string, unknown> | null;
  status: string;
  completedAt: string | null;
};

export type WalkRunItemResponse = {
  id: string;
  status: WalkItemResponseStatus | string;
  response: unknown;
  failed: boolean;
  notes: string | null;
  photoUrls: unknown;
  completedBy: string | null;
  completedAt: string | null;
  correctiveActions?: WalkRunCorrectiveAction[];
};

export type WalkRunSnapshotItem = {
  id: string;
  sectionId: string | null;
  type: WalkItemType | string;
  title: string;
  description: string | null;
  instructions: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown>;
  response: WalkRunItemResponse | null;
};

export type WalkRun = {
  id: string;
  teamId: string;
  templateId: string;
  templateVersion: number;
  status: string;
  startedByUserId: string | null;
  startedByName: string | null;
  deviceId: string | null;
  isTest: boolean;
  testSessionId: string | null;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  template: {
    id: string;
    name: string;
    description: string | null;
    workplace: string;
    scoringEnabled: boolean;
    version: number;
    sections: Array<{
      id: string;
      title: string;
      description: string | null;
      position: number;
      items: Array<Omit<WalkRunSnapshotItem, "response">>;
    }>;
    unsectionedItems: Array<Omit<WalkRunSnapshotItem, "response">>;
  };
  items: WalkRunSnapshotItem[];
  progress: {
    total: number;
    answered: number;
    requiredRemaining: number;
  };
};

export const PHASE2_ITEM_TYPES: WalkItemType[] = [
  "TEMPERATURE",
  "YES_NO",
  "MULTIPLE_CHOICE",
  "VISUAL_CHECK",
  "QUANTITY",
  "PHOTO",
  "TEXT",
  "INSTRUCTION",
];

export function isPhase2ItemType(type: string): boolean {
  return (PHASE2_ITEM_TYPES as string[]).includes(type);
}

export type WalkOccurrenceListItem = {
  id: string;
  templateId: string;
  status: string;
  windowStart: string;
  dueAt: string;
  graceEndsAt?: string | null;
  template?: { id: string; name: string; description?: string | null };
  schedule?: { id: string; name: string | null };
};

export function flattenWalkItems(template: WalkTemplate): WalkItem[] {
  const fromSections = [...template.sections]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => [...s.items].sort((a, b) => a.position - b.position));
  const loose = [...(template.unsectionedItems ?? [])].sort((a, b) => a.position - b.position);
  return [...fromSections, ...loose];
}
