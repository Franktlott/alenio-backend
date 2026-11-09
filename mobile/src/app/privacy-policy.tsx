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
  LEGAL_PARENT_COMPANY_NAME as PARENT_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL as CONTACT_EMAIL,
  LEGAL_LAST_UPDATED as LAST_UPDATED,
  LEGAL_WEBSITE_LABEL as WEBSITE_LABEL,
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
          {COMPANY_NAME} ("we", "us", or "our") operates the {APP_NAME} mobile application (the "App") and the {APP_NAME} website at {WEBSITE_LABEL} (the "Website"). {COMPANY_NAME} is a subsidiary of {PARENT_COMPANY_NAME}. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the App or the Website. Please read it carefully.
        </Body>

        <View className="h-4" />

        <Section title="1. Information We Collect">
          <Body>We collect information you provide, information created through your use of the service, and limited technical information needed to operate and secure it:</Body>
          <View className="mt-2">
            <Bullet><Text className="font-semibold">Accounts and authentication:</Text> Name, email address, password authentication records, email one-time-passcode records, sign-in and session information, and identifiers used for Microsoft sign-in. Organizations may configure single sign-on, including Okta, and may provision, update, or deprovision managed accounts through SCIM.</Bullet>
            <Bullet><Text className="font-semibold">Profiles and relationships:</Text> Profile photo, job title, department, location, biography, contact details, skills, interests, working preferences, and other profile fields you provide. Personal connections, connection requests, blocks, discoverability and message-privacy settings are tied to your account across workspaces. If enabled, optional active-status information may show that you are recently or currently active.</Bullet>
            <Bullet><Text className="font-semibold">Communications:</Text> Direct and group messages, workspace channels, mentions, reactions, polls and votes, uploaded images, files and other media, and related delivery and participation records.</Bullet>
            <Bullet><Text className="font-semibold">Workspace and coaching data:</Text> Organization and workspace membership, teams, roles and permissions; tasks, calendars and events; Outlook calendar-sync information; check-ins and one-on-one agendas, notes and history; development goals and notes; workplace standards; team-health responses and snapshots; and related activity records.</Bullet>
            <Bullet><Text className="font-semibold">Seneca and AI data:</Text> Prompts, instructions, responses, feedback, relevant workspace context, and stored briefs or generated artifacts used to provide and improve Seneca features.</Bullet>
            <Bullet><Text className="font-semibold">Video meetings:</Text> Meeting identifiers, room details, participants and display names. Daily.co processes video and audio streams when you join a call. {COMPANY_NAME} does not ordinarily record or store the call&apos;s video or audio on its servers.</Bullet>
            <Bullet><Text className="font-semibold">Notifications:</Text> Push tokens, email delivery details, notification preferences and delivery status. Depending on your settings and device, notifications may include preview content such as a sender, message excerpt, task, reminder or event title.</Bullet>
            <Bullet><Text className="font-semibold">Device, app and security data:</Text> Device and operating-system type, app version, browser and session information, IP address, request timestamps, server and security logs, errors, and feature interactions. We do not describe this as collection by a third-party analytics SDK.</Bullet>
            <Bullet><Text className="font-semibold">Billing data:</Text> Subscription, plan, workspace owner, transaction and billing-status records. Stripe processes payment-card and checkout information for web billing.</Bullet>
            <Bullet><Text className="font-semibold">Workplace operations:</Text> Where an organization uses Alenio workplace operations features, we may process schedules, walks, temperature-check or other checklist responses, manual entries, exceptions, notes, and photos submitted by users.</Bullet>
            <Bullet><Text className="font-semibold">Calendar credentials:</Text> If you connect Outlook, we store the authorization credentials needed to maintain the connection in encrypted form, together with sync settings and calendar identifiers.</Bullet>
          </View>
        </Section>

        <Section title="2. How We Use Information">
          <Body>We use this information to authenticate users; provision and administer accounts; provide profiles, relationships, messaging, tasks, calendars, video, coaching, workplace operations and AI features; synchronize connected calendars; deliver push and email notifications; process subscriptions; provide support; maintain continuity when membership changes; enforce permissions and safety settings; diagnose errors; prevent abuse and security incidents; and improve the service.</Body>
        </Section>

        <Section title="3. Visibility and Workplace Boundaries">
          <View className="mt-2">
            <Bullet><Text className="font-semibold">Personal relationships:</Text> Connections, requests and blocks are account-level, not owned by a workspace. Your discoverability, messaging and presence settings affect who can find, contact or see activity information about you.</Bullet>
            <Bullet><Text className="font-semibold">Messages and shared content:</Text> Content is visible to the recipients, channel or group you choose and to others authorized by the service&apos;s permissions. Blocking and privacy controls may limit new interactions but do not necessarily erase previously shared content.</Bullet>
            <Bullet><Text className="font-semibold">Workplace data:</Text> Coaching, check-in, development, standards, team-health and operations data is workspace-specific and visible according to role, relationship and workspace permissions. Workspace owners and team leaders may have management capabilities; a legacy workspace Admin role may be read-only and should not be assumed to manage people.</Bullet>
            <Bullet><Text className="font-semibold">Organization administration:</Text> Authorized organization or workspace administrators may provision or deprovision managed accounts and access, export, manage or remove organization and workspace data according to their permissions and the organization&apos;s agreement with us.</Bullet>
            <Bullet><Text className="font-semibold">Presence:</Text> Active status is optional and can be disabled. When enabled, permitted users may see a status based on recent app activity.</Bullet>
          </View>
        </Section>

        <Section title="4. AI and Seneca">
          <Body>Seneca may send your prompt and relevant workspace context to OpenAI to generate a response, summary, brief or recommendation. AI output can be incomplete, inaccurate or inappropriate and should be reviewed before use. Do not submit sensitive personal information that is unnecessary for your request. We do not state that OpenAI never trains on or always immediately deletes submitted data; its processing is governed by the arrangements and policies applicable to the service we use.</Body>
        </Section>

        <Section title="5. How We Share Information">
          <Body>We do not sell your personal information. We share information with recipients you select, authorized members and administrators as described above, and providers needed to operate the service:</Body>
          <View className="mt-2">
            <Bullet><Text className="font-semibold">AI:</Text> OpenAI for Seneca generation.</Bullet>
            <Bullet><Text className="font-semibold">Identity and enterprise administration:</Text> Microsoft for Microsoft sign-in and Outlook calendar integration, and Okta for organization SSO and SCIM where configured.</Bullet>
            <Bullet><Text className="font-semibold">Infrastructure and storage:</Text> Neon for database services; Railway and other cloud-hosting providers; Firebase Storage for uploaded media where used; and Firebase Hosting for applicable web content.</Bullet>
            <Bullet><Text className="font-semibold">Communications and app delivery:</Text> Firebase Cloud Messaging, Apple Push Notification service, Google push services, Expo, and Resend for push, app and email delivery.</Bullet>
            <Bullet><Text className="font-semibold">Other core providers:</Text> Stripe for web subscription billing and Daily.co for video meetings, plus security, monitoring, support and other providers reasonably necessary to operate the service.</Bullet>
            <Bullet><Text className="font-semibold">Legal and business purposes:</Text> We may disclose information when required by law, to protect rights and safety, investigate abuse, or as part of a merger, financing, acquisition or sale of assets.</Bullet>
          </View>
        </Section>

        <Section title="6. Notifications and Integrations">
          <Body>You can manage notification permissions through the App and your device. Disabling notifications does not stop essential service or security emails. Notification previews may be visible on a locked or shared device. Third-party integrations such as Microsoft, Okta and Daily.co process information under their own terms and privacy policies in addition to this Policy.</Body>
        </Section>

        <Section title="7. Retention and Deletion">
          <Body>You may delete your account through the App or Website, or request deletion by emailing {CONTACT_EMAIL}; verified email requests are processed within 30 days. We retain information while your account is active and as needed to provide the service. Deletion removes or de-identifies account data under our control, but workspace content you shared may remain where necessary for other users, record integrity or the organization&apos;s authorized use. Former-member development goals and check-in history may be archived and retained for authorized workplace continuity. Legal, billing, tax, fraud-prevention and security records, and residual backup copies, may remain as needed. Deletion does not require us to erase information another user or organization independently controls.</Body>
        </Section>

        <Section title="8. Your Choices and Rights">
          <Body>Depending on your location, you may have rights to access, correct, receive, delete or restrict certain personal information, or object to certain processing. You can edit many profile and privacy settings in the service, disable optional presence, manage push permissions on your device, and unsubscribe from eligible emails. Contact {CONTACT_EMAIL} to make a request. We may need to verify your identity and consider the rights of other users and organizations.</Body>
        </Section>

        <Section title="9. Security and International Processing">
          <Body>We use safeguards such as encrypted transmission, access controls, secure authentication and encrypted storage of Outlook authorization credentials. No system is completely secure, and we cannot guarantee absolute security. Our providers may process information in countries other than your own, subject to safeguards required by applicable law.</Body>
        </Section>

        <Section title="10. Children&apos;s Privacy">
          <Body>{APP_NAME} is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided information, contact {CONTACT_EMAIL}.</Body>
        </Section>

        <Section title="11. Changes to This Policy">
          <Body>We may update this Privacy Policy from time to time. We will post the revised policy in the App or on the Website, update the &quot;Last updated&quot; date, and provide additional notice when appropriate.</Body>
        </Section>

        <Section title="12. Contact Us">
          <Body>
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
          </Body>
          <View className="mt-3 bg-slate-50 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-700">{COMPANY_NAME}</Text>
            <Text className="text-xs text-slate-500 mt-1">Parent company: {PARENT_COMPANY_NAME}</Text>
            <Text className="text-sm text-indigo-600 mt-2">{CONTACT_EMAIL}</Text>
          </View>
        </Section>

        <Text className="text-[10px] text-slate-400 text-center mt-10 mb-2">John 3:16</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
