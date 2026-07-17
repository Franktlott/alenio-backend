import { z, type ZodTypeAny } from "zod";
import type { WalkItemResponseStatus, WalkItemType } from "../types";
import { isWalkItemType } from "../types";
import {
  DEFAULT_TEMPERATURE_CONFIG,
  evaluateTemperature,
  temperatureConfigSchema,
  temperatureResponseSchema,
  type TemperatureConfig,
  type TemperatureResponse,
} from "./temperature";
import {
  DEFAULT_YES_NO_CONFIG,
  evaluateYesNo,
  yesNoConfigSchema,
  yesNoResponseSchema,
  type YesNoConfig,
  type YesNoResponse,
} from "./yes-no";
import {
  DEFAULT_VISUAL_CHECK_CONFIG,
  evaluateVisualCheck,
  visualCheckConfigSchema,
  visualCheckResponseSchema,
  type VisualCheckConfig,
  type VisualCheckResponse,
} from "./visual-check";
import {
  DEFAULT_PHOTO_CONFIG,
  evaluatePhoto,
  photoConfigSchema,
  photoResponseSchema,
  type PhotoConfig,
  type PhotoResponse,
} from "./photo";
import {
  DEFAULT_INSTRUCTION_CONFIG,
  DEFAULT_MULTIPLE_CHOICE_CONFIG,
  DEFAULT_QUANTITY_CONFIG,
  DEFAULT_TEXT_CONFIG,
  evaluateStubUnsupported,
  instructionConfigSchema,
  multipleChoiceConfigSchema,
  quantityConfigSchema,
  textConfigSchema,
} from "./stubs";

export type WalkItemTypeDefinition = {
  type: WalkItemType;
  label: string;
  description: string;
  /** Fully supported for evaluate/response in current phase. */
  fullySupported: boolean;
  scorable: boolean;
  defaultConfig: Record<string, unknown>;
  configSchema: ZodTypeAny;
  responseSchema: ZodTypeAny;
  evaluate: (config: unknown, response: unknown) => WalkItemResponseStatus;
};

function parseConfig<T>(schema: ZodTypeAny, raw: unknown, fallback: T): T {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as T) : fallback;
}

export const WALK_ITEM_TYPE_REGISTRY: Record<WalkItemType, WalkItemTypeDefinition> = {
  TEMPERATURE: {
    type: "TEMPERATURE",
    label: "Temperature Check",
    description: "Check and record a temperature.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_TEMPERATURE_CONFIG },
    configSchema: temperatureConfigSchema,
    responseSchema: temperatureResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(temperatureConfigSchema, config, DEFAULT_TEMPERATURE_CONFIG);
      const r = temperatureResponseSchema.parse(response);
      return evaluateTemperature(c as TemperatureConfig, r as TemperatureResponse);
    },
  },
  YES_NO: {
    type: "YES_NO",
    label: "Yes / No Question",
    description: "Simple pass/fail check.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_YES_NO_CONFIG },
    configSchema: yesNoConfigSchema,
    responseSchema: yesNoResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(yesNoConfigSchema, config, DEFAULT_YES_NO_CONFIG);
      const r = yesNoResponseSchema.parse(response);
      return evaluateYesNo(c as YesNoConfig, r as YesNoResponse);
    },
  },
  VISUAL_CHECK: {
    type: "VISUAL_CHECK",
    label: "Visual Check",
    description: "Look and confirm condition.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_VISUAL_CHECK_CONFIG },
    configSchema: visualCheckConfigSchema,
    responseSchema: visualCheckResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(visualCheckConfigSchema, config, DEFAULT_VISUAL_CHECK_CONFIG);
      const r = visualCheckResponseSchema.parse(response);
      return evaluateVisualCheck(c as VisualCheckConfig, r as VisualCheckResponse);
    },
  },
  PHOTO: {
    type: "PHOTO",
    label: "Photo Required",
    description: "Take and attach a photo.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_PHOTO_CONFIG },
    configSchema: photoConfigSchema,
    responseSchema: photoResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(photoConfigSchema, config, DEFAULT_PHOTO_CONFIG);
      const r = photoResponseSchema.parse(response);
      return evaluatePhoto(c as PhotoConfig, r as PhotoResponse);
    },
  },
  MULTIPLE_CHOICE: {
    type: "MULTIPLE_CHOICE",
    label: "Multiple Choice",
    description: "Choose from predefined options.",
    fullySupported: false,
    scorable: true,
    defaultConfig: { ...DEFAULT_MULTIPLE_CHOICE_CONFIG },
    configSchema: multipleChoiceConfigSchema,
    responseSchema: zPassthroughResponse(),
    evaluate: () => evaluateStubUnsupported(),
  },
  QUANTITY: {
    type: "QUANTITY",
    label: "Quantity Check",
    description: "Count or verify quantity.",
    fullySupported: false,
    scorable: true,
    defaultConfig: { ...DEFAULT_QUANTITY_CONFIG },
    configSchema: quantityConfigSchema,
    responseSchema: zPassthroughResponse(),
    evaluate: () => evaluateStubUnsupported(),
  },
  TEXT: {
    type: "TEXT",
    label: "Note / Text",
    description: "Add notes or comments.",
    fullySupported: false,
    scorable: true,
    defaultConfig: { ...DEFAULT_TEXT_CONFIG },
    configSchema: textConfigSchema,
    responseSchema: zPassthroughResponse(),
    evaluate: () => evaluateStubUnsupported(),
  },
  INSTRUCTION: {
    type: "INSTRUCTION",
    label: "Instruction",
    description: "Guidance for associates (not scored).",
    fullySupported: false,
    scorable: false,
    defaultConfig: { ...DEFAULT_INSTRUCTION_CONFIG },
    configSchema: instructionConfigSchema,
    responseSchema: zPassthroughResponse(),
    evaluate: () => "NOT_APPLICABLE",
  },
};

function zPassthroughResponse(): ZodTypeAny {
  return z.record(z.string(), z.unknown()).or(z.object({}).passthrough());
}

export function getWalkItemTypeDefinition(type: string): WalkItemTypeDefinition | null {
  if (!isWalkItemType(type)) return null;
  return WALK_ITEM_TYPE_REGISTRY[type];
}

export function listWalkItemTypeCatalog() {
  return Object.values(WALK_ITEM_TYPE_REGISTRY).map((def) => ({
    type: def.type,
    label: def.label,
    description: def.description,
    fullySupported: def.fullySupported,
    scorable: def.scorable,
    defaultConfig: def.defaultConfig,
  }));
}

export function parseItemConfig(
  type: WalkItemType,
  raw: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const def = WALK_ITEM_TYPE_REGISTRY[type];
  const incoming = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const merged = { ...def.defaultConfig, ...incoming };
  const parsed = def.configSchema.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid item config" };
  }
  return { ok: true, value: parsed.data as Record<string, unknown> };
}

export function evaluateWalkItemResponse(
  type: WalkItemType,
  config: unknown,
  response: unknown,
): WalkItemResponseStatus {
  return WALK_ITEM_TYPE_REGISTRY[type].evaluate(config, response);
}
