import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  BarChart3,
  ChevronRight,
  Play,
  PlusCircle,
  SquareCheckBig,
  UsersRound,
} from "lucide-react-native";

const BRAND = "#5B45FF";
const INK = "#111A2B";

/**
 * Account-first empty state for the Workspace tab. Personal chat, activity, and
 * connections remain available; this screen explains what joining adds.
 */
export function NoWorkspaceTabState({
  bottomInset = 24,
  testID,
}: {
  bottomInset?: number;
  testID?: string;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 600;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        wide ? styles.contentWide : null,
        { paddingBottom: bottomInset },
      ]}
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrow}>INTRODUCING WORKSPACE</Text>
        <View style={styles.eyebrowLine} />
      </View>
      <Text style={styles.title}>Better things happen together.</Text>
      <Text style={styles.description}>
        Bring your people, plans, and progress into one shared place.
      </Text>

      <VideoPlaceholder />

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/onboarding",
              params: { mode: "create" },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Create a workspace"
          activeOpacity={0.85}
          testID="no-workspace-create-button"
        >
          <LinearGradient
            colors={["#3D6BFF", "#6D5EF8"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.primaryButton}
          >
            <PlusCircle size={17} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.primaryButtonText}>Create a workspace</Text>
            <ChevronRight size={15} color="#FFFFFF" strokeWidth={2.4} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: "/onboarding", params: { mode: "join" } })
          }
          accessibilityRole="button"
          accessibilityLabel="Join a workspace"
          activeOpacity={0.85}
          style={styles.secondaryButton}
          testID="no-workspace-join-button"
        >
          <UsersRound size={16} color={BRAND} strokeWidth={2.2} />
          <Text style={styles.secondaryButtonText}>Join a workspace</Text>
          <ChevronRight size={15} color={BRAND} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <View style={styles.tiles}>
        <FeatureTile
          icon={<UsersRound size={19} color={BRAND} strokeWidth={2.1} />}
          title="Collaborate"
          subtitle="Bring your team together"
        />
        <FeatureTile
          icon={<SquareCheckBig size={19} color={BRAND} strokeWidth={2.1} />}
          title="Organize"
          subtitle="Turn ideas into action"
        />
        <FeatureTile
          icon={<BarChart3 size={19} color={BRAND} strokeWidth={2.1} />}
          title="Track Progress"
          subtitle="See development and impact"
        />
      </View>
    </ScrollView>
  );
}

/**
 * Reserved spot for the 60-second overview video. The real player will
 * replace this placeholder; nothing plays yet.
 */
function VideoPlaceholder() {
  return (
    <View
      style={styles.videoCard}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Workspace overview video coming soon"
      testID="no-workspace-video-placeholder"
    >
      <LinearGradient
        colors={["#4E7CF5", "#7B61F2", "#5B8DEF"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.videoGradient}
      >
        <View style={styles.videoCopy}>
          <Text style={styles.videoTitle}>See how{"\n"}Workspace{"\n"}works</Text>
          <Text style={styles.videoSubtitle}>A quick 60-second overview</Text>
        </View>

        <View style={styles.videoPanel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelTitleBar} />
            <View style={styles.panelAvatars}>
              <View style={[styles.panelAvatar, { backgroundColor: "#B7C6FF" }]} />
              <View style={[styles.panelAvatar, { backgroundColor: "#D9CBFF" }]} />
              <View style={[styles.panelAvatar, { backgroundColor: "#FFE1B8" }]} />
            </View>
          </View>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.panelRow}>
              <View style={styles.panelCheck}>
                <Text style={styles.panelCheckMark}>✓</Text>
              </View>
              <View style={styles.panelLine} />
            </View>
          ))}
        </View>

        <View style={styles.playButton}>
          <Play size={19} color={BRAND} fill={BRAND} strokeWidth={2.2} />
        </View>
        <View style={styles.durationChip}>
          <Text style={styles.durationText}>1:00</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function FeatureTile({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 18,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  contentWide: {
    maxWidth: 640,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  eyebrowLine: {
    width: 26,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#B9AEF5",
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#7567ED",
  },
  title: {
    marginTop: 10,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: INK,
    textAlign: "center",
  },
  description: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
    textAlign: "center",
    maxWidth: 330,
    alignSelf: "center",
  },
  videoCard: {
    marginTop: 18,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#3D3590",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  videoGradient: {
    height: 148,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  videoCopy: {
    flex: 1,
    minWidth: 0,
  },
  videoTitle: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  videoSubtitle: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: "rgba(255,255,255,0.82)",
  },
  videoPanel: {
    width: 128,
    marginLeft: 10,
    padding: 9,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.96)",
    transform: [{ rotate: "1.5deg" }],
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  panelTitleBar: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C9CFEA",
  },
  panelAvatars: {
    flexDirection: "row",
    gap: 2,
  },
  panelAvatar: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  panelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  panelCheck: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6D5EF8",
  },
  panelCheckMark: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  panelLine: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E6F2",
  },
  playButton: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 46,
    height: 46,
    marginLeft: -23,
    marginTop: -23,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  durationChip: {
    position: "absolute",
    right: 9,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(10,12,28,0.62)",
  },
  durationText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actions: {
    marginTop: 16,
    gap: 9,
  },
  primaryButton: {
    height: 47,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryButton: {
    height: 47,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CFC7FF",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: BRAND,
  },
  tiles: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 13,
    paddingBottom: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3DEFF",
    backgroundColor: "#F8F6FF",
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9E4FF",
  },
  tileTitle: {
    marginTop: 8,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
  },
  tileSubtitle: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 12.5,
    color: "#7C8799",
    textAlign: "center",
  },
});
