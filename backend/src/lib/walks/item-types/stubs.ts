import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

export const multipleChoiceConfigSchema = z.object({
  options: z.array(z.string().min(1).max(80)).min(2).max(12),
  passingOptions: z.array(z.string().min(1).max(80)).default([]),
  allowMultiple: z.boolean().default(false),
});

export const multipleChoiceResponseSchema = z.object({
  selected: z.array(z.string().min(1)).min(1),
});

export type MultipleChoiceConfig = z.infer<typeof multipleChoiceConfigSchema>;
export type MultipleChoiceResponse = z.infer<typeof multipleChoiceResponseSchema>;

export const quantityConfigSchema = z.object({
  comparisonType: z.enum(["EXACT", "AT_LEAST", "AT_MOST", "BETWEEN"]).default("AT_LEAST"),
  target: z.number().optional().nullable(),
  minimum: z.number().optional().nullable(),
  maximum: z.number().optional().nullable(),
  unitLabel: z.string().max(40).optional().nullable(),
});

export const quantityResponseSchema = z.object({
  value: z.number(),
});

export type QuantityConfig = z.infer<typeof quantityConfigSchema>;
export type QuantityResponse = z.infer<typeof quantityResponseSchema>;

export const textConfigSchema = z.object({
  placeholder: z.string().max(120).optional().nullable(),
  minLength: z.number().int().min(0).max(2000).default(0),
  maxLength: z.number().int().min(1).max(5000).default(500),
  requireNonEmpty: z.boolean().default(true),
});

export const textResponseSchema = z.object({
  text: z.string(),
});

export type TextConfig = z.infer<typeof textConfigSchema>;
export type TextResponse = z.infer<typeof textResponseSchema>;

export const instructionConfigSchema = z.object({
  body: z.string().max(4000).default(""),
  acknowledgeRequired: z.boolean().default(false),
});

export const instructionResponseSchema = z.object({
  acknowledged: z.boolean().default(true),
});

export type InstructionConfig = z.infer<typeof instructionConfigSchema>;
export type InstructionResponse = z.infer<typeof instructionResponseSchema>;

export const DEFAULT_MULTIPLE_CHOICE_CONFIG: MultipleChoiceConfig = {
  options: ["Option A", "Option B"],
  passingOptions: ["Option A"],
  allowMultiple: false,
};

export const DEFAULT_QUANTITY_CONFIG: QuantityConfig = {
  comparisonType: "AT_LEAST",
  target: 1,
  minimum: 1,
  maximum: null,
  unitLabel: "items",
};

export const DEFAULT_TEXT_CONFIG: TextConfig = {
  placeholder: "Enter notes…",
  minLength: 0,
  maxLength: 500,
  requireNonEmpty: true,
};

export const DEFAULT_INSTRUCTION_CONFIG: InstructionConfig = {
  body: "",
  acknowledgeRequired: false,
};

export function evaluateMultipleChoice(
  config: MultipleChoiceConfig,
  response: MultipleChoiceResponse,
): WalkItemResponseStatus {
  const selected = response.selected.map((s) => s.trim());
  if (selected.length === 0) return "NEEDS_ACTION";
  if (!config.allowMultiple && selected.length > 1) return "FAIL";
  const passing = new Set(config.passingOptions);
  if (passing.size === 0) return "PASS";
  const ok = selected.every((s) => passing.has(s));
  return ok ? "PASS" : "FAIL";
}

export function evaluateQuantity(
  config: QuantityConfig,
  response: QuantityResponse,
): WalkItemResponseStatus {
  const value = response.value;
  switch (config.comparisonType) {
    case "EXACT":
      return config.target != null && value === config.target ? "PASS" : "FAIL";
    case "AT_LEAST":
      return (config.minimum ?? config.target) != null &&
        value >= Number(config.minimum ?? config.target)
        ? "PASS"
        : "FAIL";
    case "AT_MOST":
      return (config.maximum ?? config.target) != null &&
        value <= Number(config.maximum ?? config.target)
        ? "PASS"
        : "FAIL";
    case "BETWEEN":
      return config.minimum != null &&
        config.maximum != null &&
        value >= config.minimum &&
        value <= config.maximum
        ? "PASS"
        : "FAIL";
    default:
      return "FAIL";
  }
}

export function evaluateText(config: TextConfig, response: TextResponse): WalkItemResponseStatus {
  const text = response.text ?? "";
  if (config.requireNonEmpty && !text.trim()) return "NEEDS_ACTION";
  if (text.length < config.minLength) return "NEEDS_ACTION";
  if (text.length > config.maxLength) return "FAIL";
  return "PASS";
}

export function evaluateInstruction(
  config: InstructionConfig,
  response: InstructionResponse,
): WalkItemResponseStatus {
  if (config.acknowledgeRequired && !response.acknowledged) return "NEEDS_ACTION";
  return "NOT_APPLICABLE";
}
