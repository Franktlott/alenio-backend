import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import {
  CalendarDays,
  CheckSquare2,
  Folder,
  MessageCircle,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

const BRAND = "#4361EE";
const FEATURES: {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  backgroundColor: string;
}[] = [
  {
    title: "Shared tasks",
    description: "Assign, track, and complete work together.",
    icon: CheckSquare2,
    color: "#4361EE",
    backgroundColor: "#EEF2FF",
  },
  {
    title: "Team calendar",
    description: "See schedules, due dates, and important events.",
    icon: CalendarDays,
    color: "#F43F5E",
    backgroundColor: "#FFF1F2",
  },
  {
    title: "Team chat",
    description: "Keep workspace conversations organized.",
    icon: MessageCircle,
    color: "#10B981",
    backgroundColor: "#ECFDF5",
  },
  {
    title: "Files & documents",
    description: "Store and share important files securely.",
    icon: Folder,
    color: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  {
    title: "AI workflows",
    description: "Automate routines and help your team move faster.",
    icon: Sparkles,
    color: "#8B5CF6",
    backgroundColor: "#F5F3FF",
  },
];

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
  const { height } = useWindowDimensions();
  const compact = height < 900;

  return (
    <View
      style={[
        styles.scroll,
        styles.content,
        compact ? styles.contentCompact : null,
        { paddingBottom: bottomInset },
      ]}
      testID={testID}
    >
      <View style={[styles.hero, compact ? styles.heroCompact : null]}>
        <WorkspaceIllustration compact={compact} />
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>No workspace yet</Text>
        <Text style={styles.description}>
          Join your team&apos;s workspace to collaborate on tasks, schedules, and projects—or create
          one in minutes.
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.push({ pathname: "/onboarding", params: { mode: "join" } })}
        accessibilityRole="button"
        accessibilityLabel="Join a workspace"
        activeOpacity={0.82}
        style={styles.primaryButton}
        testID="no-workspace-join-button"
      >
        <UsersRound size={17} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={styles.primaryButtonText}>Join a workspace</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.divider} />
      </View>

      <TouchableOpacity
        onPress={() => router.push({ pathname: "/onboarding", params: { mode: "create" } })}
        accessibilityRole="button"
        accessibilityLabel="Create a workspace"
        activeOpacity={0.82}
        style={styles.secondaryButton}
        testID="no-workspace-create-button"
      >
        <PlusCircle size={17} color={BRAND} strokeWidth={2.2} />
        <Text style={styles.secondaryButtonText}>Create a workspace</Text>
      </TouchableOpacity>

      <View style={[styles.featuresSection, compact ? styles.featuresSectionCompact : null]}>
        <Text style={styles.sectionTitle}>Why join a workspace?</Text>
        <View style={styles.featuresCard}>
          {FEATURES.map((feature, index) => (
            <FeatureRow
              key={feature.title}
              {...feature}
              showDivider={index > 0}
              compact={compact}
            />
          ))}
        </View>
      </View>

      <View style={styles.reassurance}>
        <ShieldCheck size={18} color={BRAND} strokeWidth={2.2} />
        <Text style={styles.reassuranceText}>
          Your personal activity, chats, and connections are always available—even without a
          workspace.
        </Text>
      </View>
    </View>
  );
}

function WorkspaceIllustration({ compact }: { compact: boolean }) {
  return (
    <Image
      source={require("@/assets/alenio-empty-workspace.png")}
      style={[styles.illustration, compact ? styles.illustrationCompact : null]}
      contentFit="cover"
      accessibilityRole="image"
      accessibilityLabel="Alenio workspace and team"
      accessibilityIgnoresInvertColors
    />
  );
}

function FeatureRow({
  title,
  description,
  icon: Icon,
  color,
  backgroundColor,
  showDivider,
  compact,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  backgroundColor: string;
  showDivider: boolean;
  compact: boolean;
}) {
  return (
    <View style={[styles.featureRow, compact ? styles.featureRowCompact : null]}>
      {showDivider ? <View style={styles.featureDivider} /> : null}
      <View style={[styles.featureIcon, { backgroundColor }]}>
        <Icon size={15} color={color} strokeWidth={2.1} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription} numberOfLines={1}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  contentCompact: {
    paddingTop: 16,
  },
  hero: {
    alignItems: "center",
  },
  heroCompact: {
    marginTop: -2,
  },
  illustration: {
    width: 158,
    height: 112,
    alignSelf: "center",
  },
  illustrationCompact: {
    width: 146,
    height: 96,
    marginVertical: -3,
  },
  title: {
    marginTop: 12,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  titleCompact: {
    marginTop: 7,
    fontSize: 21,
    lineHeight: 25,
  },
  description: {
    marginTop: 6,
    maxWidth: 280,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#7A869A",
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    marginTop: 20,
    height: 46,
    borderRadius: 10,
    backgroundColor: BRAND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    shadowColor: BRAND,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 12,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
  },
  secondaryButton: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    borderWidth: 1.25,
    borderColor: "#8EA2FF",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND,
  },
  featuresSection: {
    marginTop: 20,
  },
  featuresSectionCompact: {
    marginTop: 16,
  },
  sectionTitle: {
    marginBottom: 9,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#334155",
  },
  featuresCard: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F8FAFF",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEF2F7",
  },
  featureRow: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    position: "relative",
  },
  featureRowCompact: {
    minHeight: 43,
  },
  featureDivider: {
    position: "absolute",
    top: 0,
    left: 42,
    right: 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEF2F7",
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#334155",
  },
  featureDescription: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    color: "#8A96A8",
  },
  reassurance: {
    marginTop: 17,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 9,
  },
  reassuranceText: {
    flexShrink: 1,
    maxWidth: 260,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "500",
    color: "#718096",
  },
});
