import { Text, type TextProps } from "react-native";
import { premiumType } from "@/theme";

export type TextVariant =
  | "pageTitle"
  | "sectionTitle"
  | "sectionLabel"
  | "rowTitle"
  | "body"
  | "supporting"
  | "meta";

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: string;
};

/** The app's one text scale. Pick a variant instead of setting sizes per screen. */
export function AppText({ variant = "body", color, style, ...rest }: AppTextProps) {
  return (
    <Text
      style={[premiumType[variant], color ? { color } : null, style]}
      {...rest}
    />
  );
}
