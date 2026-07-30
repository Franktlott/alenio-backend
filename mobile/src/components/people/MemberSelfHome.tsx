import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { ChevronRight, Copy, MessageCircle } from "lucide-react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { Team } from "@/lib/types";
import type { MemberStandardsCompliance } from "@/lib/workplace-standards";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import { brandGradient, colors, radii, space } from "@/theme";

type Props = {
  team: Team | undefined;
  myId: string;
  myName: string;
  myImage?: string | null;
  myRole?: string;
  isPaid: boolean;
  checkInRequired: boolean;
  goalsRequired: boolean;
  daysSinceLastOneOnOne?: number | null;
  compliance?: MemberStandardsCompliance | null;
  contentBottomPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onCopyCode: () => void;
  onShareCode: () => void;
};

export function MemberSelfHome({
  team,
  myId,
  myName,
  myImage,
  myRole,
  isPaid,
  checkInRequired,
  goalsRequired,
  daysSinceLastOneOnOne,
  compliance,
  contentBottomPad,
  refreshing,
  onRefresh,
  onCopyCode,
  onShareCode,
}: Props) {
  const openMyProfile = () => {
    router.push({
      pathname: "/member-profile",
      params: { teamId: team?.id ?? "", memberUserId: myId },
    });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: space.pagePad,
        paddingTop: 10,
        paddingBottom: contentBottomPad,
        gap: 12,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
      }
      testID="member-self-home"
    >
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={[...brandGradient.colors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <WorkspaceTeamAvatar
              team={{ name: team?.name ?? "Workspace", image: team?.image ?? null }}
              size={44}
              radius={22}
              backgroundColor="rgba(255,255,255,0.20)"
              textColor="#FFFFFF"
              borderColor="transparent"
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {team?.name ?? "Team"}
              </Text>
              <Pressable onPress={onCopyCode} style={styles.codeRow} hitSlop={8} testID="copy-invite-code">
                <Text style={styles.codeText}>{team?.inviteCode}</Text>
                <Copy size={12} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          </View>
          <Text style={styles.heroHint}>Your workplace · share the code to invite others</Text>
          <Pressable onPress={onShareCode} style={styles.shareBtn} testID="share-invite-code">
            <Text style={styles.shareBtnText}>Share invite code</Text>
          </Pressable>
        </LinearGradient>
      </View>

      <Text style={styles.sectionLabel}>Your profile</Text>
      <ProfileCard>
        <Pressable
          onPress={openMyProfile}
          style={({ pressed }) => [styles.profileRow, pressed ? { opacity: 0.75 } : null]}
          testID="open-my-member-profile"
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
        >
          <UserAvatar
            user={{ name: myName, image: myImage }}
            size={48}
            radius={24}
            backgroundColor="#EEF2FF"
            textColor="#4361EE"
            fontSize={17}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {myName}
              <Text style={{ fontWeight: "500", color: "#64748B" }}> (you)</Text>
            </Text>
            <Text style={styles.profileRole}>{formatTeamRole(myRole)}</Text>
            {isPaid ? (
              <Text style={styles.profileMeta} numberOfLines={1}>
                {[
                  checkInRequired
                    ? `Check-in ${formatDaysSinceCheckIn(daysSinceLastOneOnOne)}`
                    : null,
                  goalsRequired ? `Goals ${compliance?.goalsDisplay ?? "—"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color="#CBD5E1" />
        </Pressable>
      </ProfileCard>

      <ProfileCard>
        <Pressable
          onPress={() => router.push("/(app)/chat")}
          style={({ pressed }) => [styles.profileRow, pressed ? { opacity: 0.75 } : null]}
          testID="member-go-to-chat"
        >
          <View style={styles.iconBox}>
            <MessageCircle size={16} color={colors.brand} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Message your team</Text>
            <Text style={styles.linkSub}>Open Chat to reach teammates</Text>
          </View>
          <ChevronRight size={16} color="#CBD5E1" />
        </Pressable>
      </ProfileCard>

      <Text style={styles.footnote}>
        Your team leader manages check-ins and goals. Open your profile to see your progress.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(67, 97, 238, 0.14)",
  },
  hero: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    letterSpacing: -0.2,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    alignSelf: "flex-start",
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.94)",
    letterSpacing: 1.4,
  },
  heroHint: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
  },
  shareBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  profileRole: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  profileMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  linkSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  footnote: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
    lineHeight: 17,
    paddingHorizontal: 4,
  },
});
