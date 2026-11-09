import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mail, ShieldCheck, UsersRound } from "lucide-react-native";
import { useSession } from "@/lib/auth/use-session";
import { fetchTeamInviteByToken, type TeamInviteLinkPreview } from "@/lib/team-invites-api";
import { setPendingTeamInviteToken } from "@/lib/auth/pending-team-invite";
import { finishMobilePostAuth } from "@/lib/auth/finish-post-auth";

export default function TeamInviteScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenRaw = params.token;
  const token = typeof tokenRaw === "string" ? tokenRaw : tokenRaw?.[0] ?? "";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TeamInviteLinkPreview | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This invite link is invalid.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTeamInviteByToken(token);
        if (cancelled) return;
        setPreview(data);
        setPendingTeamInviteToken(token);

        if (session?.user) {
          const sessionEmail =
            typeof (session.user as { email?: unknown }).email === "string"
              ? (session.user as { email: string }).email.trim().toLowerCase()
              : "";
          const inviteEmail = data.email.trim().toLowerCase();
          if (sessionEmail && inviteEmail && sessionEmail !== inviteEmail) {
            setError(
              `This invite is for ${data.email}. You're signed in as ${sessionEmail}. Sign out and continue with the invited email.`,
            );
            return;
          }
          await finishMobilePostAuth(queryClient);
          router.replace("/(app)/home");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Invite not found or expired.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, session?.user, queryClient]);

  const startSignUp = () => {
    if (!token || !preview) return;
    setPendingTeamInviteToken(token);
    router.replace({
      pathname: "/sign-up",
      params: { email: preview.email, inviteToken: token },
    });
  };

  const startSignIn = () => {
    if (!token) return;
    setPendingTeamInviteToken(token);
    router.replace({
      pathname: "/sign-in",
      params: preview?.email ? { email: preview.email, inviteToken: token } : { inviteToken: token },
    });
  };

  if (loading) {
    return (
      <View style={styles.centerState} testID="invite-loading">
        <View style={styles.stateIcon}>
          <ActivityIndicator color="#5B45FF" />
        </View>
        <Text style={styles.stateTitle}>Opening your invitation</Text>
        <Text style={styles.stateBody}>This will only take a moment.</Text>
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={styles.centerState} testID="invite-error">
        <View style={styles.stateIcon}>
          <Mail size={22} color="#5B45FF" strokeWidth={1.9} />
        </View>
        <Text style={styles.stateTitle}>Invite unavailable</Text>
        <Text style={styles.stateBody}>{error ?? "This invitation is no longer valid."}</Text>
        <TouchableOpacity style={styles.stateButton} onPress={() => router.replace("/sign-in")}>
          <Text style={styles.stateButtonText}>Continue to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.header}>
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={styles.brandIcon}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brandName}>Alenio</Text>
            <Text style={styles.brandSubtitle}>Workspace invitation</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIcon}>
          <UsersRound size={25} color="#5B45FF" strokeWidth={1.9} />
        </View>
        <Text style={styles.eyebrow}>YOU’RE INVITED</Text>
        <Text style={styles.title}>Join {preview.teamName}</Text>
        <Text style={styles.description}>
          {preview.inviterName ? preview.inviterName : "A team leader"} invited you to collaborate with the team on Alenio.
        </Text>

        <View style={styles.workspaceCard}>
          <View style={styles.workspaceTopRow}>
            {preview.teamImage ? (
              <Image source={{ uri: preview.teamImage }} style={styles.workspaceImage} />
            ) : (
              <View style={styles.workspaceFallback}>
                <Text style={styles.workspaceInitial}>{(preview.teamName[0] ?? "?").toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.workspaceCopy}>
              <Text style={styles.workspaceName}>{preview.teamName}</Text>
              <Text style={styles.workspaceMeta}>Your workspace is ready</Text>
            </View>
          </View>

          <View style={styles.emailDivider} />
          <View style={styles.emailRow}>
            <View style={styles.emailIcon}>
              <Mail size={14} color="#5B45FF" strokeWidth={2} />
            </View>
            <View style={styles.emailCopy}>
              <Text style={styles.emailLabel}>INVITED EMAIL</Text>
              <Text style={styles.emailValue} numberOfLines={1}>{preview.email}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.accountHint}>
          Create your account with this email and you’ll join automatically.
        </Text>

        <LinearGradient
          colors={["#6D4AFF", "#4361EE"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primaryButton}
        >
          <TouchableOpacity
            style={styles.buttonContent}
            onPress={startSignUp}
            activeOpacity={0.84}
            testID="invite-create-account"
          >
            <Text style={styles.primaryButtonText}>Create account</Text>
            <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </LinearGradient>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={startSignIn}
          activeOpacity={0.74}
          testID="invite-sign-in"
        >
          <Text style={styles.secondaryButtonText}>I already have an account</Text>
        </TouchableOpacity>

        <View style={styles.secureRow}>
          <ShieldCheck size={13} color="#8490A5" strokeWidth={2} />
          <Text style={styles.secureText}>Secure invitation powered by Alenio</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  safeArea: { backgroundColor: "#FFFFFF" },
  header: {
    minHeight: 66,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF3",
  },
  brandIcon: { width: 34, height: 34, borderRadius: 10 },
  brandName: { fontSize: 17, lineHeight: 20, fontWeight: "800", color: "#172033" },
  brandSubtitle: { marginTop: 1, fontSize: 10.5, color: "#7A8699", fontWeight: "500" },
  scroll: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 38,
    paddingBottom: 42,
    alignItems: "center",
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEDFF",
    marginBottom: 15,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#6D4AFF",
  },
  title: {
    marginTop: 7,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#111827",
    textAlign: "center",
  },
  description: {
    maxWidth: 350,
    marginTop: 9,
    fontSize: 14,
    lineHeight: 20,
    color: "#687386",
    textAlign: "center",
  },
  workspaceCard: {
    width: "100%",
    marginTop: 28,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EAF1",
    shadowColor: "#29304F",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  workspaceTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  workspaceImage: { width: 48, height: 48, borderRadius: 14 },
  workspaceFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#EFEDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceInitial: { fontSize: 19, fontWeight: "800", color: "#5B45FF" },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: 16, lineHeight: 21, fontWeight: "800", color: "#172033" },
  workspaceMeta: { marginTop: 2, fontSize: 11, color: "#7A8699" },
  emailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E9EDF3", marginVertical: 14 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emailIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F0EEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emailCopy: { flex: 1, minWidth: 0 },
  emailLabel: { fontSize: 9, lineHeight: 12, letterSpacing: 0.7, fontWeight: "800", color: "#8A95A7" },
  emailValue: { marginTop: 2, fontSize: 12.5, lineHeight: 17, fontWeight: "600", color: "#3B4658" },
  accountHint: {
    maxWidth: 330,
    marginTop: 18,
    marginBottom: 20,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#7A8699",
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    shadowColor: "#5145D9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonContent: {
    flex: 1,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  secondaryButton: {
    width: "100%",
    height: 48,
    marginTop: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE2EA",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700", color: "#4F35D9" },
  secureRow: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 5 },
  secureText: { fontSize: 10, color: "#8A95A7", fontWeight: "500" },
  centerState: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F8FC",
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEDFF",
    marginBottom: 16,
  },
  stateTitle: { fontSize: 19, lineHeight: 24, fontWeight: "800", color: "#172033", textAlign: "center" },
  stateBody: { maxWidth: 340, marginTop: 6, fontSize: 13, lineHeight: 19, color: "#687386", textAlign: "center" },
  stateButton: { marginTop: 22, borderRadius: 13, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: "#5B45FF" },
  stateButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
