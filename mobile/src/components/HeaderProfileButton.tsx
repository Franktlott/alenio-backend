import { Pressable, StyleSheet, View } from "react-native";
import { UserRound } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { useSession } from "@/lib/auth/use-session";
import { useProfileSheetStore } from "@/lib/state/seneca-sheet-store";
import { HEADER_BUTTON_HIT_SLOP } from "@/lib/header-brand";

type Props = {
  tone?: "brand" | "light";
};

export function HeaderProfileButton({ tone = "brand" }: Props) {
  const { data: session } = useSession();
  const open = useProfileSheetStore((state) => state.open);
  const openSheet = useProfileSheetStore((state) => state.openSheet);
  const user = session?.user;

  return (
    <Pressable
      onPress={() => openSheet()}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      accessibilityState={{ selected: open }}
      testID="header-profile-button"
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
    >
      <View
        style={[
          styles.ring,
          tone === "light" ? styles.ringLight : styles.ringBrand,
          open ? styles.ringActive : null,
        ]}
      >
        {user ? (
          <UserAvatar
            user={user}
            size={30}
            radius={15}
            resetKey={user.id}
          />
        ) : (
          <View style={styles.fallback}>
            <UserRound size={15} color={tone === "light" ? "#334155" : "#FFFFFF"} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ringBrand: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.88)",
  },
  ringLight: {
    borderWidth: 1.5,
    borderColor: "#D7DEE8",
  },
  ringActive: {
    borderColor: "#4361EE",
  },
  fallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
});
