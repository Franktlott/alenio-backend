import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Undo2 } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";

type Person = {
  id: string;
  name: string | null;
  image: string | null;
};

export function CancelConnectionRequestSheet({
  person,
  pending,
  onClose,
  onConfirm,
}: {
  person: Person | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = person?.name?.trim() || "this person";

  return (
    <AlenioBottomSheet
      visible={person != null}
      title="Cancel request?"
      subtitle="They will not be notified"
      onClose={pending ? () => undefined : onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      testID="cancel-connection-request-confirmation"
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
            accessibilityLabel={`Cancel request to ${name}`}
            testID="confirm-cancel-connection-request"
          >
            {pending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>
                Cancel request
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onClose}
            disabled={pending}
            style={alenioSheetStyles.cancelButton}
            accessibilityRole="button"
            testID="keep-connection-request"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Keep request</Text>
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
              backgroundColor="#EFE9FF"
              resetKey={person.id}
            />
          ) : null}
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {person?.name?.trim() || "Alenio member"}
            </Text>
            <Text style={styles.description}>
              Withdraw the invitation you sent. You can send a new one later.
            </Text>
          </View>
          <AlenioSheetIcon color="#6D5CE7" compact>
            <Undo2 size={15} color="#FFFFFF" strokeWidth={2.2} />
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
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#111A2B",
  },
  description: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
});
