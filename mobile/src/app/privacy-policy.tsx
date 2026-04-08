import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

const LAST_UPDATED = "April 7, 2026";
const APP_NAME = "Alenio";
const COMPANY_NAME = "Lott Technologies Group, LLC";
const CONTACT_EMAIL = "Info@lotttechnologies.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-base font-bold text-slate-800 mb-2">{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-sm text-slate-600 leading-relaxed">{children}</Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row mb-1.5">
      <Text className="text-slate-400 mr-2 mt-0.5">•</Text>
      <Text className="flex-1 text-sm text-slate-600 leading-relaxed">{children}</Text>
    </View>
  );
}

export default function PrivacyPolicy() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-100">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 mr-2" testID="back-button">
          <ArrowLeft size={22} color="#334155" />
        </Pressable>
        <Text className="text-lg font-bold text-slate-800">Privacy Policy</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-xs text-slate-400 mb-6">Last updated: {LAST_UPDATED}</Text>

        <Body>
          {COMPANY_NAME} ("we", "us", or "our") operates the {APP_NAME} mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App. Please read it carefully.
        </Body>

        <View className="h-4" />

        <Section title="1. Information We Collect">
          <Body>We collect the following types of information:</Body>
          <View className="mt-2">
            <Bullet>
              <Text className="font-semibold">Account Information:</Text> Name, email address, and password when you create an account.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Profile Information:</Text> Profile photo and any optional details you choose to add.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Content You Create:</Text> Messages, tasks, events, comments, and reactions you post within the App.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Team &amp; Collaboration Data:</Text> Team names, membership information, channels, and associated content.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Device Information:</Text> Device type, operating system, push notification tokens, and app version.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Usage Data:</Text> Features used, actions taken, and timestamps of interactions.
            </Bullet>
          </View>
        </Section>

        <Section title="2. How We Use Your Information">
          <Body>We use the information we collect to:</Body>
          <View className="mt-2">
            <Bullet>Provide, operate, and maintain the App and its features.</Bullet>
            <Bullet>Create and manage your account and authenticate your identity.</Bullet>
            <Bullet>Enable team communication, task management, and collaboration.</Bullet>
            <Bullet>Send push notifications for messages, tasks, and reminders (you may opt out in Settings).</Bullet>
            <Bullet>Process subscription payments via our payment provider.</Bullet>
            <Bullet>Respond to your support requests and communicate important updates.</Bullet>
            <Bullet>Monitor and analyse usage to improve the App's performance and features.</Bullet>
            <Bullet>Detect, prevent, and address technical issues and security threats.</Bullet>
          </View>
        </Section>

        <Section title="3. How We Share Your Information">
          <Body>We do not sell your personal information. We may share your data in the following circumstances:</Body>
          <View className="mt-2">
            <Bullet>
              <Text className="font-semibold">Within Your Team:</Text> Content you share (messages, tasks, reactions) is visible to members of your team as part of the App's core functionality.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Service Providers:</Text> We use third-party services including RevenueCat (subscription management), Expo/Apple/Google (push notifications), and cloud infrastructure providers. These providers are contractually bound to protect your data.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Legal Requirements:</Text> We may disclose your information if required by law or to protect our rights, users, or the public.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Business Transfers:</Text> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.
            </Bullet>
          </View>
        </Section>

        <Section title="4. Data Retention">
          <Body>
            We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by emailing {CONTACT_EMAIL}. We will process deletion requests within 30 days, subject to any legal obligations to retain certain data.
          </Body>
        </Section>

        <Section title="5. Your Rights">
          <Body>Depending on your location, you may have the following rights regarding your personal data:</Body>
          <View className="mt-2">
            <Bullet>
              <Text className="font-semibold">Access &amp; Portability:</Text> Request a copy of the personal data we hold about you.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Correction:</Text> Request correction of inaccurate or incomplete data.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Deletion:</Text> Request deletion of your personal data ("right to be forgotten").
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Opt-Out:</Text> Opt out of marketing communications and push notifications at any time.
            </Bullet>
            <Bullet>
              <Text className="font-semibold">Restriction:</Text> Request that we restrict processing of your data in certain circumstances.
            </Bullet>
          </View>
          <View className="mt-2">
            <Body>To exercise these rights, contact us at {CONTACT_EMAIL}.</Body>
          </View>
        </Section>

        <Section title="6. Data Security">
          <Body>
            We implement industry-standard security measures including encrypted data transmission (TLS/HTTPS), secure authentication, and access controls to protect your information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </Body>
        </Section>

        <Section title="7. Children's Privacy">
          <Body>
            {APP_NAME} is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us at {CONTACT_EMAIL} and we will promptly delete it.
          </Body>
        </Section>

        <Section title="8. Third-Party Services">
          <Body>The App integrates with the following third-party services, each governed by their own privacy policies:</Body>
          <View className="mt-2">
            <Bullet>Apple Push Notification Service (APNs) — iOS push notifications</Bullet>
            <Bullet>Firebase Cloud Messaging (FCM) — Android push notifications</Bullet>
            <Bullet>RevenueCat — Subscription and in-app purchase management</Bullet>
            <Bullet>Expo — App infrastructure and over-the-air updates</Bullet>
          </View>
        </Section>

        <Section title="9. International Data Transfers">
          <Body>
            Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for such transfers in compliance with applicable data protection laws.
          </Body>
        </Section>

        <Section title="10. Changes to This Policy">
          <Body>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy in the App and updating the "Last updated" date above. Your continued use of the App after changes constitutes acceptance of the updated policy.
          </Body>
        </Section>

        <Section title="11. Contact Us">
          <Body>
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
          </Body>
          <View className="mt-3 bg-slate-50 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-700">{COMPANY_NAME}</Text>
            <Text className="text-sm text-indigo-600 mt-1">{CONTACT_EMAIL}</Text>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
