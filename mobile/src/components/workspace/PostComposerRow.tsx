import { Pressable, StyleSheet, Text, View } from "react-native";
import { ImagePlus } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  author: { name: string; image?: string | null };
  onPress: () => void;
};

/** The "what's on your mind" row that opens the composer. */
export function PostComposerRow({ author, onPress }: Props) {
  return (
    <View style={styles.band}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Share an update with your workspace"
        testID="workspace-post-composer-row"
        style={styles.row}
      >
        <UserAvatar
          user={author}
          size={36}
          radius={18}
          backgroundColor="#EEF2FF"
          textColor="#4361EE"
          fontSize={14}
          workplaceConnected={false}
        />
        <View style={styles.field}>
          <Text style={styles.placeholder} numberOfLines={1}>
            Share an update
          </Text>
        </View>
        <View style={styles.photo}>
          <ImagePlus size={19} color="#4361EE" strokeWidth={2.1} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 6,
    borderBottomColor: "#F0F3F8",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  field: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E6EBF3",
    paddingHorizontal: 14,
  },
  placeholder: {
    fontSize: 14,
    color: "#94A3B8",
  },
  photo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6FF",
  },
});
