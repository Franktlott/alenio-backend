import { Pressable, Text } from "react-native";
import { Plus } from "lucide-react-native";
import { AppTabHeader } from "@/components/AppTabHeader";

type Props = {
  topInset: number;
  onAddPress?: () => void;
  showAdd?: boolean;
  addLabel?: string;
  addTestID?: string;
};

export function WorkspaceHeader({
  topInset,
  onAddPress,
  showAdd = true,
  addLabel = "Add",
  addTestID = "header-add-button",
}: Props) {
  return (
    <AppTabHeader
      topInset={topInset}
      testID="workspace-header"
      rightAction={
        showAdd && onAddPress ? (
          <Pressable
            onPress={onAddPress}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "rgba(255,255,255,0.22)",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
            }}
            testID={addTestID}
          >
            <Plus size={13} color="white" />
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>{addLabel}</Text>
          </Pressable>
        ) : null
      }
    />
  );
}
