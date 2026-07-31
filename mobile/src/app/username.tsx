import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";

const USERNAME_MAX_LENGTH = 30;
const AVAILABILITY_DEBOUNCE_MS = 400;

type AvailabilityResponse = {
  available: boolean;
  username: string | null;
  reason: string | null;
  message: string | null;
};

/** Mirrors the backend rule so obviously-bad input never costs a round trip. */
function localValidationMessage(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 3) return "Usernames must be at least 3 characters.";
  if (!/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/.test(value)) {
    return "Use letters, numbers, periods and underscores. Start and end with a letter or number.";
  }
  if (value.includes("..")) return "Usernames cannot contain two periods in a row.";
  return null;
}

export default function UsernameScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<MeUser>("/api/me"),
  });

  const currentUsername = me?.username ?? "";
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialized = useRef(false);

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

  const localError = localValidationMessage(value);
  const isUnchanged = value === currentUsername;
  const shouldCheck = debounced.length >= 3 && !localValidationMessage(debounced) && debounced !== currentUsername;

  const { data: availability, isFetching: checking, isError: checkFailed } = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () =>
      api.get<AvailabilityResponse>(`/api/users/username-available?username=${encodeURIComponent(debounced)}`),
    enabled: shouldCheck,
    staleTime: 30_000,
  });

  // Only trust the result once it describes what is currently typed.
  const settled = shouldCheck && !checking && debounced === value ? availability : undefined;

  const save = useMutation({
    mutationFn: () => api.patch<MeUser>("/api/profile", { username: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.back();
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : "Could not save your username.");
    },
  });

  const canSave = !isUnchanged && !localError && settled?.available === true && !save.isPending;

  const status = useMemo(() => {
    if (saveError) return { tone: "error" as const, text: saveError };
    if (localError) return { tone: "error" as const, text: localError };
    if (isUnchanged) return { tone: "muted" as const, text: "This is your current username." };
    if (checking || debounced !== value) return { tone: "muted" as const, text: "Checking availability…" };
    if (settled?.available === true) return { tone: "ok" as const, text: `@${value} is available.` };
    if (settled && !settled.available) {
      return { tone: "error" as const, text: settled.message ?? "That username is taken." };
    }
    if (checkFailed) {
      return { tone: "error" as const, text: "Could not check that username. Please try again." };
    }
    return null;
  }, [saveError, localError, isUnchanged, checking, debounced, value, settled, checkFailed]);

  return (
    <View style={{ flex: 1, backgroundColor: "#F6F7FB" }} testID="username-screen">
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -6,
              marginRight: 4,
            }}
            testID="username-back-button"
          >
            <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", letterSpacing: -0.2 }}>
            Username
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 52}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: insets.bottom + 24 }}
        >
          <Text style={{ fontSize: 12, lineHeight: 17, color: "#69758C" }}>
            Your username is how people find and mention you across Alenio. You can change it once every 30 days.
          </Text>

          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: status?.tone === "error" ? "#FCA5A5" : "#E2E8F0",
              paddingHorizontal: 14,
              height: 52,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#94A3B8" }}>@</Text>
            <TextInput
              value={value}
              onChangeText={(next) => {
                setSaveError(null);
                setValue(next.trim().toLowerCase().slice(0, USERNAME_MAX_LENGTH));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              placeholder="username"
              placeholderTextColor="#B8C1CE"
              maxLength={USERNAME_MAX_LENGTH}
              style={{ flex: 1, marginLeft: 2, fontSize: 16, color: "#0F172A" }}
              testID="username-input"
            />
            {checking && shouldCheck ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
            {settled?.available === true ? <Check size={18} color="#16A34A" strokeWidth={2.5} /> : null}
            {settled && !settled.available ? <X size={18} color="#DC2626" strokeWidth={2.5} /> : null}
          </View>

          {status ? (
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                lineHeight: 16,
                color: status.tone === "error" ? "#DC2626" : status.tone === "ok" ? "#16A34A" : "#7A869A",
              }}
              testID="username-status"
            >
              {status.text}
            </Text>
          ) : null}

          <Pressable
            onPress={() => canSave && save.mutate()}
            disabled={!canSave}
            style={{
              marginTop: 20,
              height: 50,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: canSave ? "#4361EE" : "#C7CEDB",
            }}
            testID="username-save-button"
          >
            {save.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Save username</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
