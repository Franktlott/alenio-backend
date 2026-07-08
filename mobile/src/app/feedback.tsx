import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import { Check, X } from "lucide-react-native";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";

const CATEGORIES = ["General", "Bug", "Feature Request"] as const;
type Category = (typeof CATEGORIES)[number];

const UI = {
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#0F172A",
  accent: "#4338CA",
  errorBg: "#FEF2F2",
  errorBorder: "#FECACA",
  errorText: "#B91C1C",
};

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 }}>{children}</Text>
  );
}

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const user = session?.user;

  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean }>("/api/feedback", {
        message,
        category,
        userName: user?.name,
        userEmail: user?.email,
      }),
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => router.back(), 5000);
    },
    onError: () => {
      toast({ title: "Failed to send feedback", preset: "error" });
    },
  });

  const handleClose = () => router.back();

  const modalBody = submitted ? (
    <View style={{ padding: 20, alignItems: "center" }} testID="feedback-success">
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          backgroundColor: "#ECFDF5",
          borderWidth: 1,
          borderColor: "#A7F3D0",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Check size={22} color="#059669" />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: UI.text, textAlign: "center" }}>Thanks for your feedback</Text>
      <Text style={{ fontSize: 13, color: UI.muted, textAlign: "center", marginTop: 8, lineHeight: 19 }}>
        We read every message and use it to improve the app.
      </Text>
    </View>
  ) : (
    <>
      <View style={{ padding: 16 }}>
        <FieldLabel>Category</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: selected ? UI.accent : UI.border,
                  backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
                }}
                testID={`category-${cat.toLowerCase().replace(/ /g, "-")}`}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? UI.accent : "#64748B" }}>{cat}</Text>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel>Message</FieldLabel>
        <TextInput
          testID="feedback-message-input"
          multiline
          numberOfLines={6}
          placeholder="Share a bug, idea, or suggestion..."
          placeholderTextColor="#94A3B8"
          value={message}
          onChangeText={setMessage}
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#DCE3EB",
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontSize: 15,
            color: UI.text,
            minHeight: 120,
            textAlignVertical: "top",
          }}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "#EEF2F6",
        }}
      >
        <Pressable
          onPress={handleClose}
          style={{
            minWidth: 72,
            borderWidth: 1,
            borderColor: "#CBD5E1",
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            alignItems: "center",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Cancel</Text>
        </Pressable>
        <Pressable
          testID="submit-feedback-button"
          onPress={() => submitMutation.mutate()}
          disabled={!message.trim() || submitMutation.isPending}
          style={{
            minWidth: 96,
            backgroundColor: !message.trim() || submitMutation.isPending ? "#94A3B8" : UI.accent,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
            alignItems: "center",
          }}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>Send</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
        onPress={handleClose}
      >
        <SafeKeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: UI.border,
                overflow: "hidden",
                width: "100%",
                maxWidth: 420,
                alignSelf: "center",
                shadowColor: "#0F172A",
                shadowOpacity: 0.16,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: UI.border,
                  backgroundColor: "#F8FAFC",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: UI.text }}>Send feedback</Text>
                    <Text style={{ fontSize: 13, color: UI.muted, marginTop: 2 }}>Help us improve the app</Text>
                  </View>
                  <Pressable onPress={handleClose} hitSlop={12} testID="close-feedback">
                    <X size={20} color={UI.muted} />
                  </Pressable>
                </View>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
                {modalBody}
              </ScrollView>
            </View>
          </Pressable>
        </SafeKeyboardAvoidingView>
      </Pressable>
    </View>
  );
}
