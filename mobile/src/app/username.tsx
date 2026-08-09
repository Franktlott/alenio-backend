import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
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
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";

const BRAND = "#4361EE";
const USERNAME_MAX_LENGTH = 30;
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
  const saveOpacity = useRef(new RNAnimated.Value(0.42)).current;

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

  useEffect(() => {
    RNAnimated.timing(saveOpacity, {
      toValue: canSave ? 1 : 0.42,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [canSave, saveOpacity]);

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
        <View style={styles.headerSpacer} />
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
          <View style={styles.descriptionCard}>
            <View style={styles.leadingIcon}>
              <UserRound size={22} color={BRAND} strokeWidth={1.9} />
            </View>
            <View style={styles.descriptionCopy}>
              <Text style={styles.descriptionTitle}>Your unique username</Text>
              <Text style={styles.descriptionBody}>
                People can use your username to find you, mention you, message you, and invite you
                to workspaces across Alenio.
              </Text>
              <View style={styles.mutedLine}>
                <CalendarDays size={12} color="#8A96A8" strokeWidth={1.9} />
                <Text style={styles.mutedText}>Usernames can be changed once every 30 days.</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Username</Text>
            <View
              style={[
                styles.inputShell,
                focused ? styles.inputFocused : null,
                status?.tone === "error" ? styles.inputError : null,
              ]}
            >
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>@</Text>
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
                <Copy size={18} color="#778399" strokeWidth={1.9} />
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
                  <View style={[styles.statusIcon, styles.statusIconError]}>
                    <X size={12} color="#DC2626" strokeWidth={2.5} />
                  </View>
                ) : (
                  <View style={[styles.statusIcon, styles.statusIconOk]}>
                    <Check size={12} color="#059669" strokeWidth={2.5} />
                  </View>
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
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.leadingIconSmall}>
                <ShieldCheck size={18} color={BRAND} strokeWidth={1.9} />
              </View>
              <Text style={styles.cardTitle}>Username rules</Text>
            </View>
            <View style={styles.rules}>
              <RuleRow label="3–30 characters" />
              <RuleRow label="Letters, numbers, and underscores only" />
              <RuleRow label="Must be unique across Alenio" />
            </View>
          </View>

          {changedAt && nextChangeAt ? (
            <View style={[styles.card, styles.historyCard]} testID="username-history-card">
              <View style={styles.historyColumn}>
                <Text style={styles.historyLabel}>Last changed</Text>
                <Text style={styles.historyDate}>{formatDate(changedAt)}</Text>
              </View>
              <View style={styles.historyDivider} />
              <View style={styles.historyColumn}>
                <Text style={styles.historyLabel}>Next change available</Text>
                <Text style={styles.historyDate}>{formatDate(nextChangeAt)}</Text>
              </View>
            </View>
          ) : null}

          <RNAnimated.View style={{ opacity: saveOpacity }}>
            <Pressable
              onPress={submit}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && canSave ? styles.saveButtonPressed : null,
              ]}
              testID="username-save-button"
            >
              {save.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save changes</Text>
              )}
            </Pressable>
          </RNAnimated.View>

          <View style={styles.footer}>
            <LockKeyhole size={12} color="#8A96A8" strokeWidth={1.9} />
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
      <CheckCircle2 size={15} color="#4F7CF7" strokeWidth={2} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F7FB" },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  headerSpacer: { width: 40 },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  descriptionCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5EAF1",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  leadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  descriptionCopy: { flex: 1, minWidth: 0 },
  descriptionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.2,
  },
  descriptionBody: { marginTop: 5, fontSize: 12, lineHeight: 18, color: "#5F6D82" },
  mutedLine: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  mutedText: { flex: 1, fontSize: 10, lineHeight: 14, color: "#8A96A8" },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5EAF1",
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fieldLabel: { marginBottom: 9, fontSize: 11, fontWeight: "700", color: "#64748B" },
  inputShell: {
    height: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#DDE3EC",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  inputFocused: {
    borderColor: BRAND,
    shadowColor: BRAND,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  inputError: { borderColor: "#F3A6A6" },
  prefix: {
    alignSelf: "stretch",
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFBFD",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#E3E8EF",
  },
  prefixText: { fontSize: 16, fontWeight: "600", color: "#778399" },
  input: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#172033",
  },
  copyButton: { width: 46, height: 48, alignItems: "center", justifyContent: "center" },
  statusRow: { marginTop: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  statusIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statusIconOk: { backgroundColor: "#EAF8F3" },
  statusIconError: { backgroundColor: "#FEF0F0" },
  statusText: { flex: 1, fontSize: 11, lineHeight: 15, color: "#7A869A" },
  statusTextOk: { color: "#16836A" },
  statusTextError: { color: "#C24141" },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  leadingIconSmall: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#172033" },
  rules: { marginTop: 14, marginLeft: 44, gap: 10 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  ruleText: { flex: 1, fontSize: 12, lineHeight: 16, color: "#334155" },
  historyCard: { flexDirection: "row", alignItems: "stretch", paddingVertical: 14 },
  historyColumn: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  historyDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "#E2E8F0", marginHorizontal: 14 },
  historyLabel: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: "#8A96A8", textTransform: "uppercase", letterSpacing: 0.35 },
  historyDate: { marginTop: 6, fontSize: 12, lineHeight: 16, fontWeight: "600", color: "#334155" },
  saveButton: { height: 52, borderRadius: 15, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
  saveButtonPressed: { transform: [{ scale: 0.995 }] },
  saveText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF", letterSpacing: -0.1 },
  footer: { paddingTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { fontSize: 10, lineHeight: 14, color: "#8A96A8", textAlign: "center" },
});
