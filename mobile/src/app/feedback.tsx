import React, { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import { Check, X } from "lucide-react-native";

const CATEGORIES = ["General", "Bug", "Feature Request"] as const;
type Category = typeof CATEGORIES[number];

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
      setTimeout(() => router.back(), 2000);
    },
    onError: () => {
      toast({ title: "Failed to send feedback", preset: "error" });
    },
  });

  if (submitted) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC", paddingBottom: insets.bottom + 32 }}
        testID="feedback-success"
      >
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Check size={28} color="#22C55E" />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#1E293B", marginBottom: 8 }}>Thanks for your feedback!</Text>
        <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", paddingHorizontal: 32 }}>We read every message and use it to improve the app.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#F8FAFC" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#1E293B" }}>Send Feedback</Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>Help us make the app better.</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          testID="close-feedback"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
        >
          <X size={18} color="#64748B" />
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Category */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Category</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: category === cat ? "#4361EE" : "#F1F5F9",
              }}
              testID={`category-${cat.toLowerCase().replace(/ /g, "-")}`}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: category === cat ? "white" : "#64748B" }}>{cat}</Text>
            </Pressable>
          ))}
        </View>

        {/* Message */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Message</Text>
        <TextInput
          testID="feedback-message-input"
          multiline
          numberOfLines={6}
          placeholder="What's on your mind? Bug, idea, or just a thought..."
          placeholderTextColor="#CBD5E1"
          value={message}
          onChangeText={setMessage}
          style={{
            backgroundColor: "white",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: 16,
            fontSize: 15,
            color: "#1E293B",
            minHeight: 140,
            textAlignVertical: "top",
            marginBottom: 32,
          }}
        />

        <Pressable
          testID="submit-feedback-button"
          onPress={() => submitMutation.mutate()}
          disabled={!message.trim() || submitMutation.isPending}
          style={{
            backgroundColor: !message.trim() || submitMutation.isPending ? "#CBD5E1" : "#4361EE",
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>
            {submitMutation.isPending ? "Sending..." : "Send Feedback"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
