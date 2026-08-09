import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Building2,
  ChevronRight,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { colors } from "@/theme";
import {
  addPersonActionKeys,
  type AddPersonActionKey,
} from "./add-person-actions";

type Props = {
  visible: boolean;
  canInviteWorkspaceMembers: boolean;
  workspaceName?: string | null;
  onClose: () => void;
  onConnect: () => void;
  onInvite: () => void;
};

type ActionDefinition = {
  key: AddPersonActionKey;
  title: string;
  description: string;
  icon: LucideIcon;
  tint: string;
  iconColor: string;
};

const ACTIONS: Record<AddPersonActionKey, ActionDefinition> = {
  connect: {
    key: "connect",
    title: "Connect with Someone",
    description:
      "Find anyone on Alenio by username or name and send a connection request.",
    icon: UserRoundPlus,
    tint: "#EEF2FF",
    iconColor: colors.brand,
  },
  invite: {
    key: "invite",
    title: "Invite to Workspace",
    description: "Invite someone to join the currently selected workspace.",
    icon: Building2,
    tint: "#F4F0FF",
    iconColor: "#7455E8",
  },
};

export function AddPersonSheet({
  visible,
  canInviteWorkspaceMembers,
  workspaceName,
  onClose,
  onConnect,
  onInvite,
}: Props) {
  const actions = addPersonActionKeys(canInviteWorkspaceMembers).map(
    (key) => ACTIONS[key],
  );

  const choose = (key: AddPersonActionKey) => {
    onClose();
    // Let the native modal finish dismissing before presenting the next sheet.
    setTimeout(() => {
      if (key === "connect") onConnect();
      else onInvite();
    }, 280);
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Add Person"
      subtitle="Choose how you'd like to connect with someone."
      onClose={onClose}
      scrollEnabled={false}
      compact
      testID="add-person-sheet"
      footer={
        <Pressable onPress={onClose} style={alenioSheetStyles.cancelButton}>
          <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
        </Pressable>
      }
    >
      <View style={styles.actions}>
        {actions.map((action) => {
          const Icon = action.icon;
          const description =
            action.key === "invite" && workspaceName
              ? `Invite someone to join ${workspaceName}.`
              : action.description;
          return (
            <Pressable
              key={action.key}
              onPress={() => choose(action.key)}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              testID={`add-person-${action.key}`}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: action.tint },
                ]}
              >
                <Icon
                  size={20}
                  color={action.iconColor}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.copy}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionDescription}>{description}</Text>
              </View>
              <ChevronRight size={18} color="#A0AABA" strokeWidth={2} />
            </Pressable>
          );
        })}
      </View>
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 9,
  },
  actionRow: {
    minHeight: 72,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E8F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172033",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  actionDescription: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7C899C",
  },
});
