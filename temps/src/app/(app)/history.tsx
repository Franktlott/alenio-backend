import { useNavigation } from "expo-router";
import { useLayoutEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../../components/AppTabHeader";
import { colors } from "../../lib/theme";

export default function HistoryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <AppTabHeader topInset={insets.top} testID="temps-history-header" />
      <View style={styles.body}>
        <Text style={styles.title}>History</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyGlyph}>◷</Text>
          <Text style={styles.emptyTitle}>Coming soon</Text>
          <Text style={styles.emptyBody}>
            Past temperature checks and compliance history will show up here.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.inkOnDark,
    letterSpacing: -0.3,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
    gap: 8,
  },
  emptyGlyph: {
    fontSize: 36,
    color: colors.mutedOnDark,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.inkOnDark,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.mutedOnDark,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
});
