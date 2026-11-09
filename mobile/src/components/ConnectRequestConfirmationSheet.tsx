import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { UserPlus } from "lucide-react-native";
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
  /** Their job title, when we have one, so the sheet confirms who this is. */
  title?: string | null;
};

export function ConnectRequestConfirmationSheet({
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
      title="Send a connection request?"
      subtitle="They will see your name and profile"
      onClose={pending ? () => undefined : onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      testID="connect-request-confirmation"
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
            accessibilityLabel={`Send a connection request to ${name}`}
            testID="confirm-connect-request"
          >
            {pending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>
                Send request
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onClose}
            disabled={pending}
            style={alenioSheetStyles.cancelButton}
            accessibilityRole="button"
            testID="cancel-connect-request"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Not now</Text>
          </Pressable>
        </>
      }
    >
      <AlenioSheetCard tint="blue" compact>
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
              {person?.title?.trim()
                ? `${person.title.trim()}. They can accept or ignore it, and you can withdraw the request any time.`
                : "They can accept or ignore it, and you can withdraw the request any time."}
            </Text>
          </View>
          <AlenioSheetIcon color="#4361EE" compact>
            <UserPlus size={15} color="#FFFFFF" strokeWidth={2.2} />
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
