import { Text, View } from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { ACTIVITY_COLORS } from "./activity-ui";

export type AvatarStackPerson = {
  id: string;
  name: string;
  image: string | null;
};

type Props = {
  people: AvatarStackPerson[];
  size?: number;
  maxVisible?: number;
  overlap?: number;
  borderColor?: string;
  testID?: string;
};

export function AvatarStack({
  people,
  size = 20,
  maxVisible = 3,
  overlap = 5,
  borderColor = "#FFFFFF",
  testID,
}: Props) {
  if (people.length === 0) return null;

  const visible = people.slice(0, maxVisible);
  const overflow = people.length - visible.length;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} testID={testID}>
      {visible.map((person, index) => (
        <View
          key={person.id}
          style={{
            marginLeft: index === 0 ? 0 : -overlap,
            borderWidth: 1.5,
            borderColor,
            borderRadius: size / 2,
            overflow: "hidden",
          }}
        >
          <UserAvatar
            user={person}
            size={size}
            radius={size / 2}
            backgroundColor={ACTIVITY_COLORS.primary}
            textColor="#FFFFFF"
            fontSize={Math.max(8, Math.round(size * 0.42))}
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: ACTIVITY_COLORS.slate400,
            borderWidth: 1.5,
            borderColor,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -overlap,
          }}
        >
          <Text style={{ fontSize: Math.max(7, Math.round(size * 0.35)), fontWeight: "700", color: "#FFFFFF" }}>
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function formatAvatarStackNames(people: AvatarStackPerson[]): string {
  if (people.length === 0) return "";
  if (people.length === 1) return people[0]!.name;
  if (people.length === 2) return `${people[0]!.name} & ${people[1]!.name}`;
  if (people.length === 3) {
    return `${people[0]!.name}, ${people[1]!.name} & ${people[2]!.name}`;
  }
  return `${people[0]!.name}, ${people[1]!.name} & ${people.length - 2} others`;
}
