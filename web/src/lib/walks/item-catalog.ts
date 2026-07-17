import type { WalkItemType } from "./types";

export type WalkPaletteCard = {
  type: WalkItemType;
  label: string;
  description: string;
  icon: "temp" | "yesno" | "choice" | "visual" | "quantity" | "photo" | "text";
  phase2: boolean;
};

/** Matches the mock Add Item palette order. */
export const WALK_PALETTE_CARDS: WalkPaletteCard[] = [
  {
    type: "TEMPERATURE",
    label: "Temperature Check",
    description: "Check and record a temperature.",
    icon: "temp",
    phase2: true,
  },
  {
    type: "YES_NO",
    label: "Yes / No Question",
    description: "Simple pass/fail check.",
    icon: "yesno",
    phase2: true,
  },
  {
    type: "MULTIPLE_CHOICE",
    label: "Multiple Choice",
    description: "Choose from predefined options.",
    icon: "choice",
    phase2: false,
  },
  {
    type: "VISUAL_CHECK",
    label: "Visual Check",
    description: "Look and confirm condition.",
    icon: "visual",
    phase2: true,
  },
  {
    type: "QUANTITY",
    label: "Quantity Check",
    description: "Count or verify quantity.",
    icon: "quantity",
    phase2: false,
  },
  {
    type: "PHOTO",
    label: "Photo Required",
    description: "Take and attach a photo.",
    icon: "photo",
    phase2: true,
  },
  {
    type: "TEXT",
    label: "Note / Text",
    description: "Add notes or comments.",
    icon: "text",
    phase2: false,
  },
];

export function defaultTitleForType(type: WalkItemType): string {
  switch (type) {
    case "TEMPERATURE":
      return "New temperature check";
    case "YES_NO":
      return "New yes / no question";
    case "VISUAL_CHECK":
      return "New visual check";
    case "PHOTO":
      return "New photo check";
    case "MULTIPLE_CHOICE":
      return "New multiple choice";
    case "QUANTITY":
      return "New quantity check";
    case "TEXT":
      return "New note";
    case "INSTRUCTION":
      return "New instruction";
    default:
      return "New item";
  }
}
