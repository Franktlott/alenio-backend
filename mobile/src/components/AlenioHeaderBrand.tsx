import { Image, StyleSheet, View } from "react-native";

export function AlenioHeaderBrand() {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="Alenio"
      style={styles.container}
    >
      <Image
        source={require("@/assets/alenio-icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: 30,
    height: 30,
  },
});
