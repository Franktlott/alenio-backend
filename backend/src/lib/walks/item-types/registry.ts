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
  evaluateInstruction,
  evaluateMultipleChoice,
  evaluateQuantity,
  evaluateText,
  instructionConfigSchema,
  instructionResponseSchema,
  multipleChoiceConfigSchema,
  multipleChoiceResponseSchema,
  quantityConfigSchema,
  quantityResponseSchema,
  textConfigSchema,
  textResponseSchema,
  type InstructionConfig,
  type InstructionResponse,
  type MultipleChoiceConfig,
  type MultipleChoiceResponse,
  type QuantityConfig,
  type QuantityResponse,
  type TextConfig,
  type TextResponse,
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
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_MULTIPLE_CHOICE_CONFIG },
    configSchema: multipleChoiceConfigSchema,
    responseSchema: multipleChoiceResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(multipleChoiceConfigSchema, config, DEFAULT_MULTIPLE_CHOICE_CONFIG);
      const r = multipleChoiceResponseSchema.parse(response);
      return evaluateMultipleChoice(c as MultipleChoiceConfig, r as MultipleChoiceResponse);
    },
  },
  QUANTITY: {
    type: "QUANTITY",
    label: "Quantity Check",
    description: "Count or verify quantity.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_QUANTITY_CONFIG },
    configSchema: quantityConfigSchema,
    responseSchema: quantityResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(quantityConfigSchema, config, DEFAULT_QUANTITY_CONFIG);
      const r = quantityResponseSchema.parse(response);
      return evaluateQuantity(c as QuantityConfig, r as QuantityResponse);
    },
  },
  TEXT: {
    type: "TEXT",
    label: "Note / Text",
    description: "Add notes or comments.",
    fullySupported: true,
    scorable: true,
    defaultConfig: { ...DEFAULT_TEXT_CONFIG },
    configSchema: textConfigSchema,
    responseSchema: textResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(textConfigSchema, config, DEFAULT_TEXT_CONFIG);
      const r = textResponseSchema.parse(response);
      return evaluateText(c as TextConfig, r as TextResponse);
    },
  },
  INSTRUCTION: {
    type: "INSTRUCTION",
    label: "Instruction",
    description: "Guidance for associates (not scored).",
    fullySupported: true,
    scorable: false,
    defaultConfig: { ...DEFAULT_INSTRUCTION_CONFIG },
    configSchema: instructionConfigSchema,
    responseSchema: instructionResponseSchema,
    evaluate: (config, response) => {
      const c = parseConfig(instructionConfigSchema, config, DEFAULT_INSTRUCTION_CONFIG);
      const r = instructionResponseSchema.parse(response);
      return evaluateInstruction(c as InstructionConfig, r as InstructionResponse);
    },
  },
};

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
