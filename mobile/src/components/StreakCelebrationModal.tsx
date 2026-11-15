import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles, Star, Trophy } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  visible: boolean;
  count: number | null;
  userName: string;
  personalBest?: boolean;
  onClose: () => void;
};

export function StreakCelebrationModal({
  visible,
  count,
  userName,
  personalBest = false,
  onClose,
}: Props) {
  const Icon = personalBest ? Star : Trophy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID={
          personalBest
            ? "personal-best-modal-backdrop"
            : "milestone-modal-backdrop"
        }
      >
        <Pressable
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
          testID={personalBest ? "personal-best-modal" : "milestone-modal"}
        >
          <LinearGradient
            colors={["#F5F3FF", "#FFFBF2", "#FFFFFF"]}
            locations={[0, 0.56, 1]}
            style={styles.hero}
          >
            <View style={styles.brandRow}>
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={styles.logo}
              />
              <Text style={styles.brandText}>ALENIO STARS</Text>
            </View>

            <Sparkles
              size={20}
              color="#B9A8FF"
              strokeWidth={1.8}
              style={styles.sparkleLeft}
            />
            <Sparkles
              size={16}
              color="#F2B84B"
              strokeWidth={1.8}
              style={styles.sparkleRight}
            />

            <View style={styles.iconRing}>
              <Icon
                size={29}
                color={personalBest ? "#EF6C35" : "#C58A19"}
                strokeWidth={2}
              />
            </View>
            <Text style={styles.eyebrow}>
              {personalBest ? "NEW PERSONAL BEST" : "MILESTONE REACHED"}
            </Text>
            <Text style={styles.count}>{count}</Text>
            <Text style={styles.countLabel}>STARS</Text>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.title}>
              {personalBest ? "A new best." : "Milestone reached."}
            </Text>
            <Text style={styles.message}>
              {personalBest
                ? `${userName} reached a new personal best of ${count} stars.`
                : `${userName} filled ${count} stars by completing assigned tasks.`}
            </Text>
            <View style={styles.divider} />
            <View style={styles.supportRow}>
              <Star size={15} color="#C9A227" fill="#C9A227" />
              <Text style={styles.support}>Keep filling stars</Text>
            </View>
            <Pressable
              onPress={onClose}
              testID={
                personalBest
                  ? "personal-best-modal-close"
                  : "milestone-modal-close"
              }
            >
              {({ pressed }) => (
                <LinearGradient
                  colors={["#6D55E7", "#4F46D9"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.button, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.buttonText}>
                    {personalBest ? "Keep it going" : "Celebrate"}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  card: {
    width: "100%",
    maxWidth: 336,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 18,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
    alignItems: "center",
  },
  brandRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 18,
  },
  logo: { width: 25, height: 25, borderRadius: 7 },
  brandText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.35,
    color: "#716A86",
  },
  sparkleLeft: { position: "absolute", left: 34, top: 75 },
  sparkleRight: { position: "absolute", right: 38, top: 98 },
  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "#F0E7C9",
    shadowColor: "#B78620",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  eyebrow: {
    marginTop: 15,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.45,
    color: "#8A6A28",
  },
  count: {
    marginTop: 3,
    fontSize: 54,
    lineHeight: 60,
    fontWeight: "800",
    letterSpacing: -2,
    color: "#171B2E",
  },
  countLabel: {
    marginTop: -1,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.15,
    color: "#8A91A3",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 21,
    paddingBottom: 22,
    alignItems: "center",
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.35,
    color: "#171B2E",
    textAlign: "center",
  },
  message: {
    marginTop: 6,
    maxWidth: 270,
    fontSize: 13,
    lineHeight: 19,
    color: "#677287",
    textAlign: "center",
  },
  divider: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    backgroundColor: "#E8EAF0",
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 17,
  },
  support: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#5D6678",
  },
  button: {
    minWidth: 188,
    minHeight: 46,
    paddingHorizontal: 28,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5542C8",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 13,
    elevation: 5,
  },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
});
