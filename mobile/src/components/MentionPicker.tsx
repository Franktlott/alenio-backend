import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";

const AVATAR_COLORS = [
  "#4361EE", "#7C3AED", "#059669", "#DC2626", "#D97706",
  "#0891B2", "#BE185D", "#65A30D",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface MentionUser {
  id: string;
  name: string;
  image: string | null;
}

interface MentionPickerProps {
  users: MentionUser[];
  query: string;
  onSelect: (user: { id: string; name: string }) => void;
}

export function MentionPicker({ users, query, onSelect }: MentionPickerProps) {
  const filtered = users
    .filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4);

  if (filtered.length === 0) return null;

  return (
    <BlurView
      intensity={60}
      tint="light"
      style={{
        marginHorizontal: 8,
        marginBottom: 4,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.6)",
      }}
    >
      <View style={{ backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 14 }}>
        {filtered.map((user, index) => {
          const avatarColor = getAvatarColor(user.name);
          const initial = user.name[0]?.toUpperCase() ?? "?";
          const isLast = index === filtered.length - 1;
          return (
            <TouchableOpacity
              key={user.id}
              testID={`mention-picker-user-${user.id}`}
              onPress={() => onSelect({ id: user.id, name: user.name })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: isLast ? 0 : 0.5,
                borderBottomColor: "rgba(203,213,225,0.5)",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: avatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>
                  {initial}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "500", color: "#1E293B", flex: 1 }}>
                {user.name}
              </Text>
              <Text style={{ fontSize: 12, color: "#94A3B8" }}>@{user.name.split(" ")[0]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </BlurView>
  );
}
