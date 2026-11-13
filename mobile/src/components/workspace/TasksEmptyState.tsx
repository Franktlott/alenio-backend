import { ClipboardList } from "lucide-react-native";
import { EmptyState, tintInk } from "@/components/ui";

type Props = {
  title: string;
  accentTitle?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Empty list state — centers in the pane beside the detail empty. */
export function TasksEmptyState({
  title,
  accentTitle,
  subtitle,
  actionLabel,
  onAction,
}: Props) {
  const combinedTitle = accentTitle
    ? `${title} ${accentTitle}`.replace(/\s+/g, " ").trim()
    : title;

  return (
    <EmptyState
      testID="empty-state"
      tint="lavender"
      icon={<ClipboardList size={18} color={tintInk("lavender")} strokeWidth={2.2} />}
      title={combinedTitle}
      body={subtitle}
      actionLabel={actionLabel}
      onAction={onAction}
      style={{
        alignSelf: "stretch",
        paddingVertical: 22,
      }}
    />
  );
}
