import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  LockKeyhole,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";

const BRAND = "#6D5EF8";
const USERNAME_MAX_LENGTH = 15;
const AVAILABILITY_DEBOUNCE_MS = 400;
const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

type AvailabilityResponse = {
  available: boolean;
  username: string | null;
  reason: string | null;
  message: string | null;
};

type Status = {
  tone: "ok" | "error" | "muted";
  text: string;
  loading?: boolean;
};

/** Mirrors the backend rule so invalid input never costs a round trip. */
function localValidationMessage(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 3) return "Username must be at least 3 characters.";
  if (!/^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/.test(value)) {
    return "Use letters, numbers, and underscores only.";
  }
  return null;
}

export default function UsernameScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const initialized = useRef(false);

  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<MeUser>("/api/me"),
  });

  const currentUsername = me?.username ?? "";
  const changedAt = useMemo(
    () => parseDate(me?.usernameUpdatedAt),
    [me?.usernameUpdatedAt],
  );
  const nextChangeAt = useMemo(
    () => addDays(changedAt, USERNAME_CHANGE_COOLDOWN_DAYS),
    [changedAt],
  );
  const cooldownActive = !!nextChangeAt && nextChangeAt.getTime() > Date.now();

  useEffect(() => {
    if (initialized.current || !currentUsername) return;
    initialized.current = true;
    setValue(currentUsername);
    setDebounced(currentUsername);
  }, [currentUsername]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), AVAILABILITY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const isUnchanged = value === currentUsername;
  const localError = isUnchanged ? null : localValidationMessage(value);
  const shouldCheck =
    debounced.length >= 3 &&
    !localValidationMessage(debounced) &&
    debounced !== currentUsername;

  const {
    data: availability,
    isFetching: checking,
    isError: checkFailed,
  } = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () =>
      api.get<AvailabilityResponse>(
        `/api/users/username-available?username=${encodeURIComponent(debounced)}`,
      ),
    enabled: shouldCheck,
    staleTime: 30_000,
  });

  const settled = shouldCheck && !checking && debounced === value ? availability : undefined;

  const save = useMutation({
    mutationFn: () => api.patch<MeUser>("/api/profile", { username: value }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      toast({ title: "Username updated", preset: "done" });
      router.back();
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : "Could not save your username.");
    },
  });

  const canSave =
    !isUnchanged &&
    !cooldownActive &&
    !localError &&
    settled?.available === true &&
    !save.isPending;

  const status = useMemo<Status | null>(() => {
    if (saveError) return { tone: "error", text: saveError };
    if (isUnchanged && currentUsername) {
      return { tone: "ok", text: "This is your current username." };
    }
    if (cooldownActive && nextChangeAt) {
      return {
        tone: "muted",
        text: `You can change your username again on ${formatDate(nextChangeAt)}.`,
      };
    }
    if (localError) return { tone: "error", text: localError };
    if (checking || debounced !== value) {
      return { tone: "muted", text: "Checking availability...", loading: true };
    }
    if (settled?.available === true) return { tone: "ok", text: "Username available" };
    if (settled && !settled.available) {
      return { tone: "error", text: "Username already taken" };
    }
    if (checkFailed) {
      return { tone: "error", text: "Could not check availability. Please try again." };
    }
    return null;
  }, [
    saveError,
    isUnchanged,
    currentUsername,
    cooldownActive,
    nextChangeAt,
    localError,
    checking,
    debounced,
    value,
    settled,
    checkFailed,
  ]);

  const submit = () => {
    if (canSave) save.mutate();
  };

  const copyUsername = async () => {
    if (!value) return;
    await Clipboard.setStringAsync(`@${value}`);
    toast({ title: "Copied", preset: "done" });
  };

  return (
    <View style={styles.screen} testID="username-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backButton}
          testID="username-back-button"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <Text style={styles.headerTitle}>Username</Text>
        <Pressable
          onPress={submit}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.headerSaveButton,
            !canSave ? styles.headerSaveButtonDisabled : null,
            pressed && canSave ? styles.headerSaveButtonPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save username"
          testID="username-header-save-button"
        >
          {save.isPending ? (
            <ActivityIndicator size="small" color={BRAND} />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 52}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 22 },
          ]}
        >
          <View style={styles.hero}>
            <Image
              source={require("@/assets/alenio-welcome-mountain-ridge-v2.jpg")}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(246,243,255,0.97)", "rgba(246,243,255,0.78)", "rgba(246,243,255,0.12)"]}
              locations={[0, 0.46, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroIcon}>
              <Text style={styles.heroAt}>@</Text>
            </View>
            <Text style={styles.heroTitle}>Make it yours.</Text>
            <Text style={styles.heroBody}>
              Your username helps people find and connect with you across Alenio.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Your username</Text>
          <View
            style={[
              styles.inputShell,
              focused ? styles.inputFocused : null,
              status?.tone === "error" ? styles.inputError : null,
            ]}
          >
            <View style={styles.mark}>
              <Text style={styles.markText}>@</Text>
            </View>
            <TextInput
              value={value}
              onChangeText={(next) => {
                setSaveError(null);
                setValue(next.trim().toLowerCase().slice(0, USERNAME_MAX_LENGTH));
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={submit}
              returnKeyType="done"
              enablesReturnKeyAutomatically
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              placeholder="username"
              placeholderTextColor="#B8C1CE"
              maxLength={USERNAME_MAX_LENGTH}
              style={styles.input}
              testID="username-input"
            />
            <Pressable
              onPress={() => void copyUsername()}
              hitSlop={8}
              style={styles.copyButton}
              accessibilityRole="button"
              accessibilityLabel="Copy username"
              testID="username-copy-button"
            >
              <Copy size={16} color={BRAND} strokeWidth={2} />
            </Pressable>
          </View>

          {status ? (
            <Animated.View
              key={`${status.tone}-${status.text}`}
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(120)}
              style={styles.statusRow}
              testID="username-status"
            >
              {status.loading ? (
                <ActivityIndicator size="small" color="#7A869A" />
              ) : status.tone === "error" ? (
                <X size={14} color="#DC2626" strokeWidth={2.5} />
              ) : (
                <Check size={14} color="#16A34A" strokeWidth={2.6} />
              )}
              <Text
                style={[
                  styles.statusText,
                  status.tone === "error"
                    ? styles.statusTextError
                    : status.tone === "ok"
                      ? styles.statusTextOk
                      : null,
                ]}
              >
                {status.text}
              </Text>
            </Animated.View>
          ) : null}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Username requirements</Text>
          <View style={styles.rules}>
            <RuleRow label="3–15 characters" />
            <RuleRow label="Letters, numbers, and underscores only" />
            <RuleRow label="Must be unique across Alenio" />
          </View>

          <View style={styles.changesCard} testID="username-history-card">
            <View style={styles.changesHeading}>
              <View style={styles.changesIcon}>
                <CalendarDays size={16} color={BRAND} strokeWidth={2} />
              </View>
              <View style={styles.changesCopy}>
                <Text style={styles.changesTitle}>Username changes</Text>
                <Text style={styles.changesBody}>
                  You can change your username once every 30 days.
                </Text>
              </View>
            </View>
            {changedAt && nextChangeAt ? (
              <View style={styles.historyRow}>
                <View style={styles.historyColumn}>
                  <Text style={styles.historyLabel}>Last changed</Text>
                  <Text style={styles.historyDate}>{formatShortDate(changedAt)}</Text>
                </View>
                <View style={styles.historyDivider} />
                <View style={styles.historyColumn}>
                  <Text style={styles.historyLabel}>Next change available</Text>
                  <Text style={styles.historyDate}>{formatShortDate(nextChangeAt)}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            <LockKeyhole size={13} color="#8B95A5" strokeWidth={1.9} />
            <Text style={styles.footerText}>
              Your username is public and visible across Alenio.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function RuleRow({ label }: { label: string }) {
  return (
    <View style={styles.ruleRow}>
      <CheckCircle2 size={15} color={BRAND} strokeWidth={2} />
      <Text style={styles.ruleText}>{label}</Text>
    </View>
  );
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date | null, days: number): Date | null {
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F5FB" },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: "#F6F5FB",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 56,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  headerSaveButton: {
    width: 56,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 4,
  },
  headerSaveButtonDisabled: { opacity: 0.38 },
  headerSaveButtonPressed: { opacity: 0.65 },
  headerSaveText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: BRAND,
  },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 6 },
  hero: {
    height: 148,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#F3EEFF",
    paddingHorizontal: 16,
    paddingVertical: 16,
    justifyContent: "center",
  },
  heroImage: {
    position: "absolute",
    width: "150%",
    aspectRatio: 16 / 9,
    right: -12,
    bottom: -6,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAt: { fontSize: 18, fontWeight: "700", color: BRAND },
  heroTitle: {
    marginTop: 10,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.5,
  },
  heroBody: {
    marginTop: 4,
    maxWidth: 230,
    fontSize: 13,
    lineHeight: 18,
    color: "#5C6578",
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#98A2B3",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sectionLabelSpaced: { marginTop: 20 },
  inputShell: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6E4F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  inputFocused: { borderColor: BRAND },
  inputError: { borderColor: "#F3A6A6" },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F3F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { fontSize: 16, fontWeight: "700", color: BRAND },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    fontWeight: "700",
    color: "#111A2B",
    letterSpacing: -0.2,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F3F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#8B95A5" },
  statusTextOk: { color: "#16A34A" },
  statusTextError: { color: "#DC2626" },
  rules: { gap: 12, paddingLeft: 2 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ruleText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "500", color: "#1F2937" },
  changesCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#F3F0FF",
  },
  changesHeading: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  changesIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#E7E1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  changesCopy: { flex: 1, minWidth: 0 },
  changesTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.2,
  },
  changesBody: { marginTop: 2, fontSize: 13, lineHeight: 18, color: "#667085" },
  historyRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0D9F8",
    flexDirection: "row",
    alignItems: "stretch",
  },
  historyColumn: { flex: 1, minWidth: 0 },
  historyDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "#E0D9F8", marginHorizontal: 12 },
  historyLabel: { fontSize: 12, lineHeight: 16, color: "#98A2B3" },
  historyDate: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111A2B",
  },
  footer: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: { fontSize: 12, lineHeight: 16, color: "#98A2B3", textAlign: "center" },
});
