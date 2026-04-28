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
import {
  LEGAL_APP_NAME as APP_NAME,
  LEGAL_COMPANY_NAME as COMPANY_NAME,
  LEGAL_CONTACT_EMAIL as CONTACT_EMAIL,
  LEGAL_LAST_UPDATED as LAST_UPDATED,
} from "@/lib/legal-constants";

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

export default function TermsOfService() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-100">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 mr-2" testID="back-button">
          <ArrowLeft size={22} color="#334155" />
        </Pressable>
        <Text className="text-lg font-bold text-slate-800">Terms of Service</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-xs text-slate-400 mb-6">Last updated: {LAST_UPDATED}</Text>

        <Body>
          Please read these Terms of Service ("Terms") carefully before using the {APP_NAME} mobile application operated by {COMPANY_NAME} ("we", "us", or "our"). By accessing or using {APP_NAME}, you agree to be bound by these Terms.
        </Body>

        <View className="h-4" />

        <Section title="1. Acceptance of Terms">
          <Body>
            By creating an account or using {APP_NAME}, you confirm that you are at least 13 years of age, have read and understood these Terms, and agree to comply with them. If you do not agree, you may not use the App.
          </Body>
        </Section>

        <Section title="2. Description of Service">
          <Body>
            {APP_NAME} is a team communication and task management platform that enables teams to collaborate through messaging, task assignments, shared calendars, video meetings, and real-time communication tools. Features may evolve over time and we reserve the right to modify, suspend, or discontinue any part of the service.
          </Body>
        </Section>

        <Section title="3. Account Registration">
          <Body>To use {APP_NAME}, you must:</Body>
          <View className="mt-2">
            <Bullet>Create an account with a valid email address and secure password.</Bullet>
            <Bullet>Provide accurate and complete registration information.</Bullet>
            <Bullet>Keep your account credentials confidential and not share them with others.</Bullet>
            <Bullet>Notify us immediately of any unauthorized access to your account.</Bullet>
            <Bullet>Be responsible for all activity that occurs under your account.</Bullet>
          </View>
        </Section>

        <Section title="4. Acceptable Use">
          <Body>You agree to use {APP_NAME} only for lawful purposes and in accordance with these Terms. You agree not to:</Body>
          <View className="mt-2">
            <Bullet>Post, share, or transmit content that is unlawful, harmful, defamatory, obscene, or offensive.</Bullet>
            <Bullet>Harass, bully, or threaten other users.</Bullet>
            <Bullet>Impersonate any person or entity or misrepresent your affiliation.</Bullet>
            <Bullet>Upload malware, viruses, or any code intended to disrupt or damage the service.</Bullet>
            <Bullet>Attempt to gain unauthorized access to any part of the service or other users' accounts.</Bullet>
            <Bullet>Use the service for spam, unsolicited advertising, or chain messages.</Bullet>
            <Bullet>Violate any applicable local, state, national, or international law or regulation.</Bullet>
            <Bullet>Scrape, crawl, or use automated means to access the App without our permission.</Bullet>
          </View>
        </Section>

        <Section title="5. User Content">
          <Body>
            You retain ownership of content you create and share within {APP_NAME}. By posting content, you grant {COMPANY_NAME} a non-exclusive, worldwide, royalty-free license to host, store, and display that content solely for the purpose of operating and providing the service. You are solely responsible for your content and represent that it does not violate any third-party rights.
          </Body>
        </Section>

        <Section title="6. Subscriptions and Payments">
          <Body>
            {APP_NAME} may offer premium subscription plans. Subscriptions are billed through the Apple App Store or Google Play Store according to their respective billing terms. By purchasing a subscription:
          </Body>
          <View className="mt-2">
            <Bullet>Payment will be charged to your App Store or Play Store account at confirmation of purchase.</Bullet>
            <Bullet>Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period.</Bullet>
            <Bullet>Manage or cancel subscriptions through your device's account settings.</Bullet>
            <Bullet>No refunds are provided for partial subscription periods, except as required by applicable law.</Bullet>
          </View>
          <View className="mt-2">
            <Body>
              Apple and Google are not parties to these Terms. Subscription billing and refunds for App Store purchases are governed by Apple's Terms of Sale; for Play Store purchases, by Google's Terms of Service.
            </Body>
          </View>
        </Section>

        <Section title="7. Intellectual Property">
          <Body>
            All intellectual property rights in {APP_NAME}, including but not limited to the software, design, logos, trademarks, and content created by {COMPANY_NAME}, are owned by or licensed to {COMPANY_NAME}. You may not copy, modify, distribute, sell, or lease any part of the App or its content without our prior written consent.
          </Body>
        </Section>

        <Section title="8. Privacy">
          <Body>
            Your use of {APP_NAME} is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the App, you consent to our data practices as described in the Privacy Policy.
          </Body>
        </Section>

        <Section title="9. Video Meetings">
          <Body>
            {APP_NAME} includes video meeting functionality powered by Daily.co. By using video meetings, you agree to the following:
          </Body>
          <View className="mt-2">
            <Bullet>Video meeting rooms are created on Daily.co's infrastructure and are subject to Daily.co's Terms of Service and Privacy Policy.</Bullet>
            <Bullet>Meeting rooms expire automatically — by default, one hour after the scheduled meeting end time, or within 24 hours if no end time is set. Expired rooms can no longer be joined.</Bullet>
            <Bullet>You may share a meeting link with external participants who can join via a web browser. You are responsible for ensuring that only authorised individuals receive the link.</Bullet>
            <Bullet>You must not use video meetings to transmit unlawful, harmful, or offensive content, or to record participants without their consent where required by applicable law.</Bullet>
            <Bullet>{COMPANY_NAME} does not record or store video or audio from meetings.</Bullet>
          </View>
        </Section>

        <Section title="10. Team Responsibilities">
          <Body>
            Team administrators are responsible for managing team membership and ensuring that team usage complies with these Terms. {COMPANY_NAME} is not responsible for content shared between team members or any disputes that arise within teams.
          </Body>
        </Section>

        <Section title="11. Disclaimers">
          <Body>
            {APP_NAME} is provided "as is" and "as available" without warranties of any kind, either express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the App will be uninterrupted, error-free, or free of viruses or other harmful components.
          </Body>
        </Section>

        <Section title="12. Limitation of Liability">
          <Body>
            To the fullest extent permitted by applicable law, {COMPANY_NAME} and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the App, even if advised of the possibility of such damages. Our total liability to you for any claims arising from these Terms or your use of the App shall not exceed the amount you paid us in the 12 months preceding the claim.
          </Body>
        </Section>

        <Section title="13. Indemnification">
          <Body>
            You agree to indemnify, defend, and hold harmless {COMPANY_NAME} and its affiliates from any claims, damages, losses, and expenses (including reasonable legal fees) arising out of your use of the App, your content, or your violation of these Terms.
          </Body>
        </Section>

        <Section title="14. Termination">
          <Body>
            We reserve the right to suspend or terminate your account at our discretion, without notice, if we believe you have violated these Terms or applicable law. You may delete your account at any time through the App settings. Upon termination, your right to use the App ceases immediately.
          </Body>
        </Section>

        <Section title="15. Changes to Terms">
          <Body>
            We may update these Terms from time to time. We will notify you of material changes within the App. Your continued use of {APP_NAME} after the effective date of revised Terms constitutes your acceptance of the changes.
          </Body>
        </Section>

        <Section title="16. Governing Law">
          <Body>
            These Terms shall be governed by and construed in accordance with the laws of the United States and the laws of the State where {COMPANY_NAME} is organized, without regard to conflict-of-law principles. Any disputes arising from these Terms or your use of {APP_NAME} shall be resolved through good-faith negotiation first; if unresolved, exclusively in the state and federal courts located in that jurisdiction (unless applicable law requires otherwise).
          </Body>
        </Section>

        <Section title="17. Contact Us">
          <Body>
            If you have questions about these Terms, please contact us at:
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
