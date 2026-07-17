import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

export const photoConfigSchema = z.object({
  minimumPhotos: z.number().int().min(1).max(10).default(1),
  maximumPhotos: z.number().int().min(1).max(20).default(3),
  instructions: z.string().max(500).optional().nullable(),
});

export type PhotoConfig = z.infer<typeof photoConfigSchema>;

export const photoResponseSchema = z.object({
  photoUrls: z.array(z.string().url()).min(0),
});

export type PhotoResponse = z.infer<typeof photoResponseSchema>;

export const DEFAULT_PHOTO_CONFIG: PhotoConfig = {
  minimumPhotos: 1,
  maximumPhotos: 3,
  instructions: null,
};

export function evaluatePhoto(config: PhotoConfig, response: PhotoResponse): WalkItemResponseStatus {
  const count = response.photoUrls?.length ?? 0;
  if (count < config.minimumPhotos) return "NEEDS_ACTION";
  if (count > config.maximumPhotos) return "FAIL";
  return "PASS";
}
