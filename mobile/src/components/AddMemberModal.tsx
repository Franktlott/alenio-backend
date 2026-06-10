import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, UserPlus } from "lucide-react-native";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";

type Props = {
  visible: boolean;
  teamName: string;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (email: string) => void;
  onClearError?: () => void;
};

export function AddMemberModal({ visible, teamName, saving, error, onClose, onSubmit, onClearError }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!visible) setEmail("");
  }, [visible]);

  const handleClose = () => {
    setEmail("");
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <SafeKeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={handleClose}
        />
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <UserPlus size={20} color="#4361EE" />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Add member</Text>
                  <Text style={{ fontSize: 13, color: "#64748B" }}>{teamName}</Text>
                </View>
              </View>
              <Pressable onPress={handleClose} hitSlop={12} testID="add-member-close">
                <X size={22} color="#64748B" />
              </Pressable>
            </View>

            <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 16 }}>
              Enter their email. If they already use Alenio, they&apos;ll be added right away. Otherwise we&apos;ll email them an invite link.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>Email address</Text>
            {error ? (
              <View
                style={{
                  backgroundColor: "#FEF2F2",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#FECACA",
                }}
                testID="add-member-error"
              >
                <Text style={{ fontSize: 14, color: "#B91C1C", lineHeight: 20 }}>{error}</Text>
              </View>
            ) : null}

            <TextInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                onClearError?.();
              }}
              placeholder="name@company.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={{
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: "#0F172A",
                marginBottom: 16,
              }}
              testID="add-member-email"
            />

            <Pressable
              onPress={handleSubmit}
              disabled={saving || !email.trim()}
              style={{
                backgroundColor: "#4361EE",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                opacity: saving || !email.trim() ? 0.6 : 1,
              }}
              testID="add-member-submit"
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Add member</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </SafeKeyboardAvoidingView>
    </Modal>
  );
}
