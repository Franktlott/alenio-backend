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
          Please read these Terms of Service ("Terms") carefully before using the {APP_NAME} mobile application or the {APP_NAME} website at {WEBSITE_LABEL}, operated by {COMPANY_NAME} ("we", "us", or "our"). {COMPANY_NAME} is a subsidiary of {PARENT_COMPANY_NAME}. By accessing or using {APP_NAME}, you agree to be bound by these Terms.
        </Body>

        <View className="h-4" />

        <Section title="1. Acceptance and Eligibility">
          <Body>By creating an account or using {APP_NAME}, you confirm that you are at least 13 years old, have authority to accept these Terms for yourself or the organization you represent, and agree to comply with them. If you do not agree, do not use the service.</Body>
        </Section>

        <Section title="2. Service Features">
          <Body>{APP_NAME} provides account profiles and personal connections; direct, group and channel messaging; tasks, calendars and Outlook sync; check-ins, one-on-ones, development planning, workplace standards and team health; Seneca AI features; Daily.co video meetings; notifications; subscriptions; and, where enabled, workplace operations such as walks and temperature checks. Features may change, be limited by plan or permissions, or be modified, suspended or discontinued.</Body>
        </Section>

        <Section title="3. Accounts and Enterprise Management">
          <View className="mt-2">
            <Bullet>You must provide accurate information, protect your password and sign-in methods, and promptly report unauthorized access.</Bullet>
            <Bullet>You may sign in using supported password, email OTP, Microsoft or organization SSO methods.</Bullet>
            <Bullet>If an organization provides or manages your account, its authorized administrators may provision, update, suspend or deprovision it through SSO or SCIM and may manage organization or workspace data according to their permissions and agreement with us.</Bullet>
            <Bullet>Your relationship with your employer or organization is separate from these Terms. Contact that organization about its internal policies, employment decisions and use of workplace data.</Bullet>
          </View>
        </Section>

        <Section title="4. Roles and Workplace Responsibilities">
          <Body>Workspace owners and authorized team leaders are responsible for membership, role assignments, permissions, notices and lawful workplace use. A legacy workspace Admin role may be read-only and is not necessarily a manager or team leader. Customers are responsible for configuring access appropriately, obtaining any notices or consents they require, protecting confidential workplace information, and making their own employment, safety and operational decisions.</Body>
        </Section>

        <Section title="5. Personal Connections and Messaging">
          <Body>Personal connections, requests and blocks are account-level and may apply across workspaces. Discoverability, messaging privacy and optional presence settings help control interactions, but they do not guarantee that previously shared content is deleted or unseen. You are responsible for selecting the correct recipients, channels and privacy settings and for content you send, upload, mention, react to or include in a poll.</Body>
        </Section>

        <Section title="6. Acceptable Use">
          <Body>You may use {APP_NAME} only lawfully. You may not harass or threaten others; impersonate a person or organization; violate privacy, intellectual-property or other rights; upload unlawful content or malware; bypass access controls; interfere with the service; access another account without authorization; spam users; scrape or automate access without permission; or use the service in a way that creates unreasonable security, legal or operational risk.</Body>
        </Section>

        <Section title="7. User and Workplace Content">
          <Body>You retain ownership of content you provide. You grant {COMPANY_NAME} a non-exclusive, worldwide, royalty-free license to host, store, reproduce, process, transmit and display that content as needed to operate, secure and improve the service and provide requested integrations and AI features. You represent that you have the rights and authority to provide the content. Organization and workspace content may be controlled by the applicable customer and remain available to authorized users after a member leaves.</Body>
        </Section>

        <Section title="8. Seneca and AI">
          <Body>Seneca uses OpenAI and may process prompts, outputs and relevant workspace context. AI output can be incomplete, inaccurate, biased or inappropriate. It is not professional human-resources, legal, medical, financial or safety advice. Review and verify output before relying on it, do not submit unnecessary sensitive data, and use qualified professionals when appropriate. The customer and its authorized decision-makers remain solely responsible for workplace, personnel, safety and operational decisions.</Body>
        </Section>

        <Section title="9. Third-Party Services and Integrations">
          <Body>The service may connect to Microsoft, Okta, OpenAI, Daily.co, Stripe, app stores, push providers and other third-party services. Their terms and privacy policies govern their services. We are not responsible for third-party systems, availability or content. You authorize us to exchange the information needed to provide an integration you enable and are responsible for your third-party accounts and permissions.</Body>
        </Section>

        <Section title="10. Video Meetings">
          <Body>Video meetings are provided through Daily.co. Meeting streams and room use are subject to Daily.co&apos;s terms. You are responsible for who receives a room link, participant conduct, and obtaining consent before recording where required. {COMPANY_NAME} does not ordinarily record or store meeting video or audio on its servers.</Body>
        </Section>

        <Section title="11. Subscriptions and Payments">
          <Body>Paid workspace plans may be purchased and managed on {WEBSITE_LABEL}, with web payments processed by Stripe, and renew according to the plan terms shown at purchase until canceled. Legacy subscriptions may instead be managed and billed through the applicable Apple or Google platform or app store; that platform&apos;s billing, cancellation and refund rules apply. Current mobile app purchases may not be available. Workspace owners should cancel or transfer billing before deleting an owner account. Except where required by law or stated in the applicable purchase terms, charges already paid are not automatically refundable.</Body>
        </Section>

        <Section title="12. Intellectual Property and Feedback">
          <Body>All rights in {APP_NAME}, including its software, design, logos, trademarks and company-created content, are owned by or licensed to {COMPANY_NAME}. These Terms grant only a limited right to use the service. If you provide feedback, you authorize us to use it without restriction or compensation, without identifying you publicly unless you permit it.</Body>
        </Section>

        <Section title="13. Privacy">
          <Body>Our Privacy Policy explains our data practices and is incorporated into these Terms. Workplace customers and users must respect applicable privacy requirements and only access information permitted by their role and legitimate workplace purpose.</Body>
        </Section>

        <Section title="14. Disclaimers">
          <Body>{APP_NAME} is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied, including warranties of merchantability, fitness for a particular purpose or non-infringement. We do not warrant that the service, integrations, AI output or notifications will be uninterrupted, accurate, secure, error-free or free of harmful components.</Body>
        </Section>

        <Section title="15. Limitation of Liability">
          <Body>
            To the fullest extent permitted by applicable law, {COMPANY_NAME} and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use {APP_NAME}, even if advised of the possibility of such damages. Our total liability to you for any claims arising from these Terms or your use of {APP_NAME} shall not exceed the amount you paid us in the 12 months preceding the claim.
          </Body>
        </Section>

        <Section title="16. Indemnification">
          <Body>
            You agree to indemnify, defend, and hold harmless {COMPANY_NAME} and its affiliates from any claims, damages, losses, and expenses (including reasonable legal fees) arising out of your use of {APP_NAME}, your content, or your violation of these Terms.
          </Body>
        </Section>

        <Section title="17. Suspension, Termination and Deletion">
          <Body>We may suspend or terminate access if we reasonably believe these Terms or law have been violated, the service or others are at risk, payment is overdue, or an organization deprovisions a managed account. You may delete your account through the App or Website or request deletion by email. Deletion and termination are subject to the Privacy Policy: shared workspace content and archived former-member development goals or check-in history may remain for authorized workplace continuity, and required legal, billing, security and backup records may remain as needed. Upon termination, your right to use the service ends.</Body>
        </Section>

        <Section title="18. Changes to Terms">
          <Body>
            We may update these Terms from time to time. We will notify you of material changes within the App or on the Website. Your continued use of {APP_NAME} after the effective date of revised Terms constitutes your acceptance of the changes.
          </Body>
        </Section>

        <Section title="19. Governing Law">
          <Body>
            These Terms shall be governed by and construed in accordance with the laws of the United States and the laws of the State where {COMPANY_NAME} is organized, without regard to conflict-of-law principles. Any disputes arising from these Terms or your use of {APP_NAME} shall be resolved through good-faith negotiation first; if unresolved, exclusively in the state and federal courts located in that jurisdiction (unless applicable law requires otherwise).
          </Body>
        </Section>

        <Section title="20. Contact Us">
          <Body>
            If you have questions about these Terms, please contact us at:
          </Body>
          <View className="mt-3 bg-slate-50 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-700">{COMPANY_NAME}</Text>
            <Text className="text-xs text-slate-500 mt-1">Parent company: {PARENT_COMPANY_NAME}</Text>
            <Text className="text-sm text-indigo-600 mt-2">{CONTACT_EMAIL}</Text>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
