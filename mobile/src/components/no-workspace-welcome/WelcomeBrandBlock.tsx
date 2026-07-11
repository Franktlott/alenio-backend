import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { WELCOME_UI } from "./welcome-ui";

type Props = {
  compact?: boolean;
  pendingTeamName?: string;
};

export function WelcomeBrandBlock({ compact, pendingTeamName }: Props) {
  const { width } = useWindowDimensions();
  const logoWidth = Math.min(Math.max(width * 0.42, 148), 176);
  const headingSize = width < 360 ? 24 : compact ? 25 : 26;

  return (
    <View style={styles.wrap}>
      <Image
        source={require("@/assets/alenio-logo.png")}
        style={{
          width: logoWidth,
          height: logoWidth * 0.38,
          marginBottom: compact ? 8 : 10,
        }}
        resizeMode="contain"
        accessibilityLabel="Alenio"
      />
      <Text style={[styles.heading, { fontSize: headingSize }]}>
        {pendingTeamName ? "Request submitted" : "Welcome to Alenio"}
      </Text>
      <Text style={styles.body}>
        {pendingTeamName
          ? "Your request is under review. You'll enter the workspace automatically once approved."
          : "Join your workplace for tasks, team chat, growth, and daily execution."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: WELCOME_UI.marginH,
    flexShrink: 0,
  },
  heading: {
    fontWeight: "700",
    color: WELCOME_UI.heading,
    textAlign: "center",
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: WELCOME_UI.bodyMuted,
    textAlign: "center",
    maxWidth: 300,
  },
});
