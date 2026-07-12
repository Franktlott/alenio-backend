import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Check, MessageSquare } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";

const CATEGORIES = ["General", "Bug", "Feature Request"] as const;
type Category = (typeof CATEGORIES)[number];

export default function FeedbackScreen() {
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
      setTimeout(() => router.back(), 2200);
    },
    onError: () => {
      toast({ title: "Failed to send feedback", preset: "error" });
    },
  });

  const handleClose = () => router.back();
  const canSend = message.trim().length > 0 && !submitMutation.isPending;

  if (submitted) {
    return (
      <AlenioBottomSheet
        asScreen
        title="Feedback sent"
        subtitle="Thanks for helping us improve Alenio"
        onClose={handleClose}
        showCloseButton
        testID="feedback-success"
        footer={
          <TouchableOpacity onPress={handleClose} style={alenioSheetStyles.primaryButton} activeOpacity={0.92}>
            <Text style={alenioSheetStyles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        }
      >
        <AlenioSheetCard tint="slate">
          <View style={[alenioSheetStyles.optionRow, { justifyContent: "center" }]}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#ECFDF5",
                borderWidth: 1,
                borderColor: "#A7F3D0",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={26} color="#059669" strokeWidth={2.5} />
            </View>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#334155", textAlign: "center", lineHeight: 22 }}>
            We read every message and use it to make the app better.
          </Text>
        </AlenioSheetCard>
      </AlenioBottomSheet>
    );
  }

  return (
    <AlenioBottomSheet
      asScreen
      title="Send feedback"
      subtitle="Help us improve the app"
      onClose={handleClose}
      showCloseButton
      testID="feedback-screen"
      footer={
        <>
          <TouchableOpacity
            testID="submit-feedback-button"
            onPress={() => submitMutation.mutate()}
            disabled={!canSend}
            style={[alenioSheetStyles.primaryButton, !canSend ? alenioSheetStyles.primaryButtonDisabled : null]}
            activeOpacity={0.92}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>Send feedback</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            style={alenioSheetStyles.cancelButton}
            testID="close-feedback"
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      }
    >
      <AlenioSheetCard>
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon>
            <MessageSquare size={22} color="white" strokeWidth={2.25} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>Tell us what’s on your mind</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Bugs, ideas, and anything that would make Alenio better.
            </Text>
          </View>
        </View>

        <View>
          <Text style={alenioSheetStyles.fieldLabel}>Category</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? "#4361EE" : "#E2E8F0",
                    backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
                  }}
                  testID={`category-${cat.toLowerCase().replace(/ /g, "-")}`}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: selected ? "#4361EE" : "#64748B",
                    }}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={alenioSheetStyles.fieldLabel}>Message</Text>
          <TextInput
            testID="feedback-message-input"
            multiline
            numberOfLines={6}
            placeholder="Share a bug, idea, or suggestion..."
            placeholderTextColor="#94A3B8"
            value={message}
            onChangeText={setMessage}
            style={[alenioSheetStyles.fieldInput, { minHeight: 100, textAlignVertical: "top" }]}
          />
        </View>
      </AlenioSheetCard>
    </AlenioBottomSheet>
  );
}
