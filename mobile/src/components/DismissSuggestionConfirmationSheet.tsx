import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { EyeOff } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";

type SuggestedPerson = {
  id: string;
  name: string | null;
  image: string | null;
};

export function DismissSuggestionConfirmationSheet({
  person,
  pending,
  onClose,
  onConfirm,
}: {
  person: SuggestedPerson | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = person?.name?.trim() || "this person";

  return (
    <AlenioBottomSheet
      visible={person != null}
      title="Dismiss suggestion?"
      subtitle="They won’t be notified"
      onClose={pending ? () => undefined : onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      testID="dismiss-suggestion-confirmation"
      footer={
        <>
          <Pressable
            onPress={onConfirm}
            disabled={pending}
            style={[
              alenioSheetStyles.primaryButton,
              pending ? alenioSheetStyles.primaryButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss suggestion for ${name}`}
            testID="confirm-dismiss-suggestion"
          >
            {pending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>
                Dismiss suggestion
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onClose}
            disabled={pending}
            style={alenioSheetStyles.cancelButton}
            accessibilityRole="button"
            testID="keep-suggestion"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>
              Keep suggestion
            </Text>
          </Pressable>
        </>
      }
    >
      <AlenioSheetCard tint="slate" compact>
        <View style={styles.row}>
          {person ? (
            <UserAvatar
              user={person}
              size={42}
              radius={21}
              backgroundColor="#EEF2FF"
              resetKey={person.id}
            />
          ) : null}
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {person?.name?.trim() || "Alenio member"}
            </Text>
            <Text style={styles.description}>
              Hide this person from Suggested for you for 90 days. This does not
              block them.
            </Text>
          </View>
          <AlenioSheetIcon color="#6D5CE7" compact>
            <EyeOff size={15} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
        </View>
      </AlenioSheetCard>
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  description: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#667085",
  },
});
