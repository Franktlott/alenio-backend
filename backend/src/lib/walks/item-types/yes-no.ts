import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

export const yesNoConfigSchema = z.object({
  passingAnswer: z.enum(["YES", "NO"]).default("YES"),
  yesLabel: z.string().max(40).default("Yes"),
  noLabel: z.string().max(40).default("No"),
});

export type YesNoConfig = z.infer<typeof yesNoConfigSchema>;

export const yesNoResponseSchema = z.object({
  answer: z.enum(["YES", "NO"]),
});

export type YesNoResponse = z.infer<typeof yesNoResponseSchema>;

export const DEFAULT_YES_NO_CONFIG: YesNoConfig = {
  passingAnswer: "YES",
  yesLabel: "Yes",
  noLabel: "No",
};

export function evaluateYesNo(config: YesNoConfig, response: YesNoResponse): WalkItemResponseStatus {
  return response.answer === config.passingAnswer ? "PASS" : "FAIL";
}
