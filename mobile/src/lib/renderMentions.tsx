import React from "react";
import { Text } from "react-native";

export function renderMentionText(
  content: string,
  _currentUserId?: string,
  messageStyle?: object,
  isOwn?: boolean
) {
  const segments = content.split(/(@\S+)/g);
  const mentionColor = isOwn ? "#4361EE" : "#2563EB";
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith("@")) {
          return (
            <Text
              key={i}
              style={[messageStyle, { color: mentionColor, fontWeight: "700" }]}
            >
              {seg}
            </Text>
          );
        }
        return (
          <Text key={i} style={messageStyle}>
            {seg}
          </Text>
        );
      })}
    </>
  );
}
