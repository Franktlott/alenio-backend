import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

export const visualCheckConfigSchema = z.object({
  passingOptions: z.array(z.string().min(1).max(80)).min(1).default(["Pass", "Looks good"]),
  failingOptions: z.array(z.string().min(1).max(80)).min(1).default(["Fail", "Needs attention"]),
  requirePhotoOnFailure: z.boolean().default(false),
});

export type VisualCheckConfig = z.infer<typeof visualCheckConfigSchema>;

export const visualCheckResponseSchema = z.object({
  selectedOption: z.string().min(1),
  photoUrls: z.array(z.string().url()).optional(),
});

export type VisualCheckResponse = z.infer<typeof visualCheckResponseSchema>;

export const DEFAULT_VISUAL_CHECK_CONFIG: VisualCheckConfig = {
  passingOptions: ["Pass", "Looks good"],
  failingOptions: ["Fail", "Needs attention"],
  requirePhotoOnFailure: false,
};

export function evaluateVisualCheck(
  config: VisualCheckConfig,
  response: VisualCheckResponse,
): WalkItemResponseStatus {
  const selected = response.selectedOption.trim();
  if (config.passingOptions.some((o) => o === selected)) return "PASS";
  if (config.failingOptions.some((o) => o === selected)) {
    if (config.requirePhotoOnFailure && (!response.photoUrls || response.photoUrls.length === 0)) {
      return "NEEDS_ACTION";
    }
    return "FAIL";
  }
  return "FAIL";
}
