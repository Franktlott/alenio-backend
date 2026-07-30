import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

export const AUTH_INPUT_CLASS =
  "h-[54px] rounded-[10px] border border-[#CED2DB] bg-white pl-[50px] pr-4 text-[15px] text-[#172033]";
export const AUTH_CODE_INPUT_CLASS =
  "h-[54px] rounded-[10px] border border-[#CED2DB] bg-white px-4 text-center text-[18px] tracking-widest text-[#172033]";

type AuthScreenProps = {
  children: ReactNode;
  testID: string;
  scrollTestID?: string;
  tagline?: string;
};

export function AuthScreen({
  children,
  testID,
  scrollTestID,
  tagline = "Your frontline\noperations platform.",
}: AuthScreenProps) {
  return (
    <View className="flex-1 bg-white" testID={testID}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1769F5", "#7138EF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.65 }}
        style={{ height: 330 }}
      >
        <SafeAreaView edges={["top"]}>
          <View className="items-center px-6 pt-7">
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={{ width: 210, height: 76 }}
              resizeMode="contain"
            />
            <Text className="mt-1 text-center text-[17px] leading-[23px] text-white">
              {tagline}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 310,
          left: -28,
          right: -28,
          height: 100,
          borderTopLeftRadius: 70,
          borderTopRightRadius: 70,
          backgroundColor: "#FFFFFF",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        style={{ marginTop: -82 }}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 23, paddingBottom: 44 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID={scrollTestID}
        >
          <View
            className="rounded-[15px] bg-white px-9 pb-10 pt-11"
            style={{
              shadowColor: "#30315F",
              shadowOffset: { width: 0, height: 7 },
              shadowOpacity: 0.14,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <>
      <Text className="mb-1 text-[27px] font-bold leading-[34px] text-[#172033]">{title}</Text>
      <Text className="mb-8 text-[15px] leading-[22px] text-[#687386]">{subtitle}</Text>
    </>
  );
}

export function AuthField({
  label,
  icon,
  children,
  className = "mb-5",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={className}>
      <Text className="mb-2 text-[13px] font-semibold text-[#344054]">{label}</Text>
      <View className="relative justify-center">
        {icon ? (
          <View style={{ position: "absolute", left: 16, zIndex: 1 }}>{icon}</View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function AuthPrimaryButton({
  label,
  loading,
  disabled,
  onPress,
  testID,
  className = "",
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
  className?: string;
}) {
  return (
    <View className={className}>
      <LinearGradient
        colors={["#7137EA", "#4333E6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 54,
          borderRadius: 10,
          shadowColor: "#5337E4",
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <TouchableOpacity
          className="flex-1 items-center justify-center rounded-[10px]"
          onPress={onPress}
          disabled={disabled || loading}
          activeOpacity={0.82}
          testID={testID}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-[16px] font-semibold text-white">{label}</Text>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

export function AuthTextLink({
  label,
  onPress,
  testID,
  className = "mt-5",
}: {
  label: string;
  onPress: () => void;
  testID: string;
  className?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`items-center py-2 ${className}`}
      testID={testID}
    >
      <Text className="text-[14px] font-medium text-[#4F35D9]">{label}</Text>
    </TouchableOpacity>
  );
}

export function AuthMessage({
  children,
  tone,
  testID,
}: {
  children: ReactNode;
  tone: "error" | "success";
  testID: string;
}) {
  if (tone === "error") {
    return (
      <Text className="mb-4 text-sm text-red-500" testID={testID}>
        {children}
      </Text>
    );
  }

  return (
    <View className="mb-5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4" testID={testID}>
      <Text className="text-sm font-medium text-emerald-700">{children}</Text>
    </View>
  );
}
