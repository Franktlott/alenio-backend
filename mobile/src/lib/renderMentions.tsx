import React from "react";
import { Text } from "react-native";

export function renderMentionText(
  content: string,
  _currentUserId?: string,
  messageStyle?: object
) {
  const segments = content.split(/(@\S+)/g);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith("@")) {
          return (
            <Text
              key={i}
              style={[messageStyle, { color: "#4361EE", fontWeight: "600" }]}
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
