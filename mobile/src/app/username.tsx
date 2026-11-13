import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  AtSign,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  LockKeyhole,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import { colors } from "@/theme";

const BRAND = colors.brand;
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

  const settled =
    shouldCheck && !checking && debounced === value ? availability : undefined;

  const save = useMutation({
    mutationFn: () => api.patch<MeUser>("/api/profile", { username: value }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      toast({ title: "Username updated", preset: "done" });
      router.back();
    },
    onError: (err: unknown) => {
      setSaveError(
        err instanceof Error ? err.message : "Could not save your username.",
      );
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
    if (settled?.available === true) {
      return { tone: "ok", text: "Username available" };
    }
    if (settled && !settled.available) {
      return { tone: "error", text: "Username already taken" };
    }
    if (checkFailed) {
      return {
        tone: "error",
        text: "Could not check availability. Please try again.",
      };
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

  const handleClose = () => router.back();

  return (
    <AlenioBottomSheet
      asScreen
      title="Username"
      subtitle="How people find you on Alenio"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.62}
      testID="username-screen"
      footer={
        <>
          <TouchableOpacity
            testID="username-save-button"
            onPress={submit}
            disabled={!canSave}
            style={[
              alenioSheetStyles.primaryButton,
              { backgroundColor: BRAND },
              !canSave ? alenioSheetStyles.primaryButtonDisabled : null,
            ]}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Save username"
          >
            {save.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>Save username</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            style={alenioSheetStyles.cancelButton}
            testID="username-cancel-button"
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      }
    >
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={BRAND}>
            <AtSign size={22} color="#FFFFFF" strokeWidth={2.25} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>Make it yours</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Your username helps people find and connect with you.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      <View style={styles.block}>
        <Text style={alenioSheetStyles.fieldLabel}>Your username</Text>
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
            placeholderTextColor="#94A3B8"
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
            <Copy size={15} color={BRAND} strokeWidth={2.1} />
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
              <ActivityIndicator size="small" color="#64748B" />
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
      </View>

      <View style={styles.block}>
        <Text style={alenioSheetStyles.fieldLabel}>Username requirements</Text>
        <View style={styles.rules}>
          <RuleRow label="3–15 characters" />
          <RuleRow label="Letters, numbers, and underscores only" />
          <RuleRow label="Must be unique across Alenio" />
        </View>
      </View>

      <View testID="username-history-card">
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <View style={styles.changesIcon}>
            <CalendarDays size={16} color={BRAND} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>Username changes</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
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
              <Text style={styles.historyLabel}>Next available</Text>
              <Text style={styles.historyDate}>
                {formatShortDate(nextChangeAt)}
              </Text>
            </View>
          </View>
        ) : null}
      </AlenioSheetCard>
      </View>

      <View style={styles.footerNote}>
        <LockKeyhole size={13} color="#94A3B8" strokeWidth={1.9} />
        <Text style={styles.footerNoteText}>
          Your username is public and visible across Alenio.
        </Text>
      </View>
    </AlenioBottomSheet>
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
  block: {
    marginTop: 4,
  },
  inputShell: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  inputFocused: { borderColor: BRAND },
  inputError: { borderColor: "#FECACA" },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFE9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { fontSize: 15, fontWeight: "700", color: BRAND },
  input: {
    flex: 1,
    minWidth: 0,
    height: 46,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
    paddingVertical: 0,
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFE9FF",
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#64748B" },
  statusTextOk: { color: "#16A34A" },
  statusTextError: { color: "#DC2626" },
  rules: { gap: 10, paddingTop: 2 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#334155",
  },
  changesIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#E7E1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  historyRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0D9F8",
    flexDirection: "row",
    alignItems: "stretch",
  },
  historyColumn: { flex: 1, minWidth: 0 },
  historyDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#E0D9F8",
    marginHorizontal: 12,
  },
  historyLabel: { fontSize: 11, lineHeight: 14, color: "#94A3B8" },
  historyDate: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  footerNote: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerNoteText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#94A3B8",
    textAlign: "center",
  },
});
