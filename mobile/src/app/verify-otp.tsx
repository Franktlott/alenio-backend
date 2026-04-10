import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function VerifyOtp() {
  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="items-center py-10 px-6">
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={{ width: 200, height: 72 }}
              resizeMode="contain"
            />
            <Text className="text-white/80 text-base mt-2">Connect. Execute. Celebrate.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View className="flex-1 px-6 pt-10 items-center">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
          Page not available
        </Text>
        <Text className="text-slate-500 dark:text-slate-400 text-base mb-8 text-center">
          Please sign in with your email and password.
        </Text>
        <TouchableOpacity
          className="bg-indigo-600 rounded-xl py-4 px-8 items-center"
          onPress={() => router.replace("/sign-in")}
          activeOpacity={0.8}
          testID="back-to-sign-in-button"
        >
          <Text className="text-white font-semibold text-base">Go to Sign In</Text>
        </TouchableOpacity>
      </View>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
