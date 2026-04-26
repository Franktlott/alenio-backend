import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";

export default function VerifyOtp() {
  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="items-center py-10 px-6">
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ width: 200, height: 72 }} resizeMode="contain" />
            <Text className="text-white/80 text-base mt-2">Connect. Execute. Celebrate.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48 }}>✅</Text>
        <Text className="text-2xl font-bold text-slate-900 mt-4 mb-2 text-center">Verification not required</Text>
        <Text className="text-slate-500 text-base text-center mb-8">
          Your account can now be created and used without verification codes.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: "#4361EE", borderRadius: 12, paddingVertical: 16, alignItems: "center", width: "100%" }}
          onPress={() => router.replace("/sign-in")}
          activeOpacity={0.8}
          testID="go-to-sign-in-button"
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Go to sign in</Text>
        </TouchableOpacity>
      </View>

      <View style={{ alignItems: "center", paddingBottom: 16 }}>
        <Image source={require("@/assets/lotttech-logo.png")} style={{ width: 185, height: 57 }} resizeMode="contain" />
      </View>
    </View>
  );
}
