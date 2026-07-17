import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

/** Schemas for Phase 6 types — accepted in DB, not fully runnable yet. */

export const multipleChoiceConfigSchema = z.object({
  options: z.array(z.string().min(1).max(80)).min(2).max(12),
  passingOptions: z.array(z.string().min(1).max(80)).default([]),
  allowMultiple: z.boolean().default(false),
});

export const quantityConfigSchema = z.object({
  comparisonType: z.enum(["EXACT", "AT_LEAST", "AT_MOST", "BETWEEN"]).default("AT_LEAST"),
  target: z.number().optional().nullable(),
  minimum: z.number().optional().nullable(),
  maximum: z.number().optional().nullable(),
  unitLabel: z.string().max(40).optional().nullable(),
});

export const textConfigSchema = z.object({
  placeholder: z.string().max(120).optional().nullable(),
  minLength: z.number().int().min(0).max(2000).default(0),
  maxLength: z.number().int().min(1).max(5000).default(500),
  requireNonEmpty: z.boolean().default(true),
});

export const instructionConfigSchema = z.object({
  body: z.string().max(4000).default(""),
  acknowledgeRequired: z.boolean().default(false),
});

export const DEFAULT_MULTIPLE_CHOICE_CONFIG = {
  options: ["Option A", "Option B"],
  passingOptions: ["Option A"],
  allowMultiple: false,
};

export const DEFAULT_QUANTITY_CONFIG = {
  comparisonType: "AT_LEAST" as const,
  target: 1,
  minimum: 1,
  maximum: null,
  unitLabel: "items",
};

export const DEFAULT_TEXT_CONFIG = {
  placeholder: "Enter notes…",
  minLength: 0,
  maxLength: 500,
  requireNonEmpty: true,
};

export const DEFAULT_INSTRUCTION_CONFIG = {
  body: "",
  acknowledgeRequired: false,
};

export function evaluateStubUnsupported(): WalkItemResponseStatus {
  return "NOT_STARTED";
}
