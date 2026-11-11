import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, UserPlus, X } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { polishedSuggestionReason } from "@/lib/people-directory";
import type { ConnectionRequestOutcome } from "@/lib/connection-request-outcome";
import type { ConnectionSuggestion } from "@/lib/types";
import { colors, typography } from "@/theme";

const BRAND = colors.brand;

/**
 * Wide enough for a real name, a job title and a labelled button, and no
 * wider — the rail carries several of these, so every point counts.
 */
export const SUGGESTION_CARD_WIDTH = 112;
/** Faces shown before the rest become a count. */
const MUTUAL_FACE_LIMIT = 3;

/**
 * Why this person is being suggested, with their job title left out — the card
 * now has the room to show the title on its own line.
 */
function evidenceFor(suggestion: ConnectionSuggestion) {
  if (suggestion.mutualConnections > 0) {
    return suggestion.mutualConnections === 1
      ? "1 mutual"
      : `${suggestion.mutualConnections} mutual`;
  }
  const workspaceIds = new Set(
    [suggestion.currentWorkspace, ...suggestion.sharedWorkspaces]
      .filter((workspace) => !!workspace)
      .map((workspace) => workspace.id),
  );
  if (workspaceIds.size > 1) return "Multiple workspaces";
  const workspace =
    suggestion.currentWorkspace ?? suggestion.sharedWorkspaces[0];
  if (workspace) return workspace.name;
  const firstReason = suggestion.reasons[0];
  return firstReason
    ? polishedSuggestionReason(firstReason, suggestion.mutualConnections)
    : "Suggested for you";
}

/**
 * The people you have in common, as faces. A row of portraits carries the same
 * fact as "3 mutual connections" and is the part that reads as considered.
 */
function MutualFaces({ suggestion }: { suggestion: ConnectionSuggestion }) {
  const faces = (suggestion.mutualPreview ?? []).slice(0, MUTUAL_FACE_LIMIT);
  if (faces.length === 0) return null;
  return (
    <View style={styles.mutualFaces}>
      {faces.map((mutual, index) => (
        <View
          key={mutual.id}
          style={[styles.mutualFace, index === 0 ? null : styles.mutualFaceLap]}
        >
          <UserAvatar
            user={{ name: mutual.name, image: mutual.image }}
            size={16}
            radius={8}
            backgroundColor="#E6EBFF"
            textColor={BRAND}
            fontSize={8}
          />
        </View>
      ))}
    </View>
  );
}

export function SuggestionPersonCard({
  suggestion,
  outcome,
  connecting,
  connectDisabled,
  dismissDisabled,
  onOpen,
  onConnect,
  onDismiss,
  fullWidth = false,
}: {
  suggestion: ConnectionSuggestion;
  outcome?: ConnectionRequestOutcome;
  connecting: boolean;
  connectDisabled: boolean;
  dismissDisabled: boolean;
  onOpen: () => void;
  onConnect: () => void;
  onDismiss: () => void;
  /** Stretch to the grid cell instead of the fixed rail width. */
  fullWidth?: boolean;
}) {
  const personName = suggestion.person.name?.trim() || "Alenio member";
  const title = suggestion.person.profileTitle?.trim();
  /**
   * Press feedback is tracked by hand because the callback form of `style`
   * is not being applied to these buttons — which left the connect button
   * with no background at all, white label on a white card.
   */
  const [pressedControl, setPressedControl] = useState<
    "dismiss" | "connect" | null
  >(null);

  return (
    <View
      style={[styles.card, fullWidth ? styles.cardFull : null]}
      testID={`suggestion-card-${suggestion.person.id}`}
    >
      {/**
       * A real row rather than an absolute corner: the row reserves its
       * height whether or not the button is there, so every card in the rail
       * still lines up once a suggestion has been acted on.
       */}
      <View style={styles.topRow}>
        {outcome ? null : (
          <Pressable
            onPress={onDismiss}
            disabled={dismissDisabled}
            onPressIn={() => setPressedControl("dismiss")}
            onPressOut={() => setPressedControl(null)}
            style={[
              styles.dismiss,
              pressedControl === "dismiss" ? styles.dismissPressed : null,
            ]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${personName} from suggestions`}
            accessibilityState={{ disabled: dismissDisabled }}
            testID={`suggestion-dismiss-${suggestion.person.id}`}
          >
            <X size={11} color="#98A2B3" strokeWidth={2.6} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={onOpen}
        style={styles.identity}
        accessibilityRole="button"
        accessibilityLabel={`Open ${personName}'s profile`}
        testID={`suggestion-profile-${suggestion.person.id}`}
      >
        {/** A pale ring lifts the portrait off the card without a border. */}
        <View style={styles.avatarRing}>
          <UserAvatar
            user={suggestion.person}
            size={32}
            radius={16}
            backgroundColor="#EFE9FF"
            textColor={BRAND}
            fontSize={13}
          />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {personName}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? " "}
        </Text>
        <View style={styles.evidenceRow}>
          <MutualFaces suggestion={suggestion} />
          <Text style={styles.evidence} numberOfLines={1}>
            {evidenceFor(suggestion)}
          </Text>
        </View>
      </Pressable>
      {outcome ? (
        <View
          style={[
            styles.connect,
            styles.connectSettled,
            outcome.isConnected ? styles.connectConnected : null,
          ]}
          accessibilityRole="text"
          accessibilityLabel={`${personName}: ${outcome.statusLabel}`}
          testID={`zero-workspace-connect-result-${suggestion.person.id}`}
        >
          <Check
            size={13}
            color={outcome.isConnected ? "#168A55" : BRAND}
            strokeWidth={2.8}
          />
          <Text
            style={[
              styles.connectLabel,
              styles.connectLabelSettled,
              outcome.isConnected ? styles.connectLabelConnected : null,
            ]}
            numberOfLines={1}
          >
            {outcome.statusLabel}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onConnect}
          disabled={connectDisabled}
          onPressIn={() => setPressedControl("connect")}
          onPressOut={() => setPressedControl(null)}
          style={[
            styles.connect,
            pressedControl === "connect" ? styles.connectPressed : null,
            connecting ? styles.connectDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Connect with ${personName}`}
          accessibilityState={{ disabled: connectDisabled, busy: connecting }}
          testID={`zero-workspace-connect-${suggestion.person.id}`}
        >
          {connecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <UserPlus size={14} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.connectLabel}>Connect</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    /** Fixed so the horizontal rail scrolls. */
    width: SUGGESTION_CARD_WIDTH,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E7EBF3",
    backgroundColor: "#FFFFFF",
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 7,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardFull: { width: "100%" },
  /** Pulled up under the dismiss row, which is mostly empty space. */
  identity: { width: "100%", marginTop: -4, alignItems: "center" },
  avatarRing: {
    padding: 2,
    borderRadius: 20,
    backgroundColor: "#F3F6FE",
  },
  topRow: {
    width: "100%",
    height: 16,
    alignItems: "flex-end",
  },
  dismiss: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6FA",
  },
  dismissPressed: { backgroundColor: "#E6EAF2" },
  name: {
    ...typography.sectionSubtitle,
    marginTop: 6,
    /** One line: a long name truncates rather than doubling the card's height. */
    height: 16,
    textAlign: "center",
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#101828",
  },
  title: {
    ...typography.metaTiny,
    marginTop: 1,
    /** Reserved whether or not there is a title, so buttons line up. */
    height: 14,
    textAlign: "center",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "500",
    color: "#67748A",
  },
  evidenceRow: {
    marginTop: 1,
    marginBottom: 5,
    /** Fixed, so a card with mutual faces lines up with one without. */
    height: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  mutualFaces: { flexDirection: "row", alignItems: "center" },
  mutualFace: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  /** Overlap reads as a group rather than as a list of separate people. */
  mutualFaceLap: { marginLeft: -7 },
  evidence: {
    ...typography.metaTiny,
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "600",
    color: "#8290A4",
  },
  connect: {
    alignSelf: "stretch",
    /**
     * No auto margin: the card is its own height, so pushing the button down
     * would only open a gap if an ancestor ever stretched the card taller.
     */
    height: 27,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: BRAND,
  },
  connectPressed: { backgroundColor: "#3348C9" },
  /** Once acted on the button steps back to a tint; it is a status now. */
  connectSettled: { backgroundColor: "#EFE9FF" },
  connectConnected: { backgroundColor: "#ECFDF5" },
  connectDisabled: { opacity: 0.55 },
  connectLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: -0.1,
    color: "#FFFFFF",
  },
  connectLabelSettled: { color: "#3A50D9" },
  connectLabelConnected: { color: "#168A55" },
});
