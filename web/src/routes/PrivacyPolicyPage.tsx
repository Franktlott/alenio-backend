import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  LEGAL_APP_NAME,
  LEGAL_COMPANY_NAME,
  LEGAL_PARENT_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_WEBSITE_LABEL,
} from "../lib/legal-constants";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <WebsiteChrome
      hero={
        <>
          <p className="lp-badge">Legal</p>
          <h1>Privacy Policy</h1>
          <p>Last updated: {LEGAL_LAST_UPDATED}</p>
        </>
      }
    >
      <main className="legal-doc-main lp-legal">

        <p>
          {LEGAL_COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the {LEGAL_APP_NAME} mobile application (the
          &quot;App&quot;) and the {LEGAL_APP_NAME} website at {LEGAL_WEBSITE_LABEL} (the &quot;Website&quot;). {LEGAL_COMPANY_NAME} is a
          subsidiary of {LEGAL_PARENT_COMPANY_NAME}. This Privacy Policy explains how we collect, use, disclose, and safeguard your
          information when you use the App or the Website. Please read it carefully.
        </p>

        <Section title="1. Information We Collect">
          <p>We collect information you provide, information created through your use of the service, and limited technical information needed to operate and secure it:</p>
          <ul>
            <li><strong>Accounts and authentication:</strong> Name, email address, password authentication records, email one-time-passcode records, sign-in and session information, and identifiers used for Microsoft sign-in. Organizations may configure single sign-on, including Okta, and may provision, update, or deprovision managed accounts through SCIM.</li>
            <li><strong>Profiles and relationships:</strong> Profile photo, job title, department, location, biography, contact details, skills, interests, working preferences, and other profile fields you provide. Personal connections, connection requests, blocks, discoverability and message-privacy settings are tied to your account across workspaces. If enabled, optional active-status information may show that you are recently or currently active.</li>
            <li><strong>Communications:</strong> Direct and group messages, workspace channels, mentions, reactions, polls and votes, uploaded images, files and other media, and related delivery and participation records.</li>
            <li><strong>Workspace and coaching data:</strong> Organization and workspace membership, teams, roles and permissions; tasks, calendars and events; Outlook calendar-sync information; check-ins and one-on-one agendas, notes and history; development goals and notes; workplace standards; team-health responses and snapshots; and related activity records.</li>
            <li><strong>Seneca and AI data:</strong> Prompts, instructions, responses, feedback, relevant workspace context, and stored briefs or generated artifacts used to provide and improve Seneca features.</li>
            <li><strong>Video meetings:</strong> Meeting identifiers, room details, participants and display names. Daily.co processes video and audio streams when you join a call. {LEGAL_COMPANY_NAME} does not ordinarily record or store the call&apos;s video or audio on its servers.</li>
            <li><strong>Notifications:</strong> Push tokens, email delivery details, notification preferences and delivery status. Depending on your settings and device, notifications may include preview content such as a sender, message excerpt, task, reminder or event title.</li>
            <li><strong>Device, app and security data:</strong> Device and operating-system type, app version, browser and session information, IP address, request timestamps, server and security logs, errors, and feature interactions. We do not describe this as collection by a third-party analytics SDK.</li>
            <li><strong>Billing data:</strong> Subscription, plan, workspace owner, transaction and billing-status records. Stripe processes payment-card and checkout information for web billing.</li>
            <li><strong>Workplace operations:</strong> Where an organization uses Alenio workplace operations features, we may process schedules, walks, temperature-check or other checklist responses, manual entries, exceptions, notes, and photos submitted by users.</li>
            <li><strong>Calendar credentials:</strong> If you connect Outlook, we store the authorization credentials needed to maintain the connection in encrypted form, together with sync settings and calendar identifiers.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Information">
          <p>We use this information to authenticate users; provision and administer accounts; provide profiles, relationships, messaging, tasks, calendars, video, coaching, workplace operations and AI features; synchronize connected calendars; deliver push and email notifications; process subscriptions; provide support; maintain continuity when membership changes; enforce permissions and safety settings; diagnose errors; prevent abuse and security incidents; and improve the service.</p>
        </Section>

        <Section title="3. Visibility and Workplace Boundaries">
          <ul>
            <li><strong>Personal relationships:</strong> Connections, requests and blocks are account-level, not owned by a workspace. Your discoverability, messaging and presence settings affect who can find, contact or see activity information about you.</li>
            <li><strong>Messages and shared content:</strong> Content is visible to the recipients, channel or group you choose and to others authorized by the service&apos;s permissions. Blocking and privacy controls may limit new interactions but do not necessarily erase previously shared content.</li>
            <li><strong>Workplace data:</strong> Coaching, check-in, development, standards, team-health and operations data is workspace-specific and visible according to role, relationship and workspace permissions. Workspace owners and team leaders may have management capabilities; a legacy workspace Admin role may be read-only and should not be assumed to manage people.</li>
            <li><strong>Organization administration:</strong> Authorized organization or workspace administrators may provision or deprovision managed accounts and access, export, manage or remove organization and workspace data according to their permissions and the organization&apos;s agreement with us.</li>
            <li><strong>Presence:</strong> Active status is optional and can be disabled. When enabled, permitted users may see a status based on recent app activity.</li>
          </ul>
        </Section>

        <Section title="4. AI and Seneca">
          <p>Seneca may send your prompt and relevant workspace context to OpenAI to generate a response, summary, brief or recommendation. AI output can be incomplete, inaccurate or inappropriate and should be reviewed before use. Do not submit sensitive personal information that is unnecessary for your request. We do not state that OpenAI never trains on or always immediately deletes submitted data; its processing is governed by the arrangements and policies applicable to the service we use.</p>
        </Section>

        <Section title="5. How We Share Information">
          <p>We do not sell your personal information. We share information with recipients you select, authorized members and administrators as described above, and providers needed to operate the service:</p>
          <ul>
            <li><strong>AI:</strong> OpenAI for Seneca generation.</li>
            <li><strong>Identity and enterprise administration:</strong> Microsoft for Microsoft sign-in and Outlook calendar integration, and Okta for organization SSO and SCIM where configured.</li>
            <li><strong>Infrastructure and storage:</strong> Neon for database services; Railway and other cloud-hosting providers; Firebase Storage for uploaded media where used; and Firebase Hosting for applicable web content.</li>
            <li><strong>Communications and app delivery:</strong> Firebase Cloud Messaging, Apple Push Notification service, Google push services, Expo, and Resend for push, app and email delivery.</li>
            <li><strong>Other core providers:</strong> Stripe for web subscription billing and Daily.co for video meetings, plus security, monitoring, support and other providers reasonably necessary to operate the service.</li>
            <li><strong>Legal and business purposes:</strong> We may disclose information when required by law, to protect rights and safety, investigate abuse, or as part of a merger, financing, acquisition or sale of assets.</li>
          </ul>
        </Section>

        <Section title="6. Notifications and Integrations">
          <p>You can manage notification permissions through the App and your device. Disabling notifications does not stop essential service or security emails. Notification previews may be visible on a locked or shared device. Third-party integrations such as Microsoft, Okta and Daily.co process information under their own terms and privacy policies in addition to this Policy.</p>
        </Section>

        <Section title="7. Retention and Deletion">
          <p>You may delete your account through the App or Website, follow our <Link to="/account-deletion" className="legal-doc-inline-link">account deletion instructions</Link>, or request deletion by emailing {LEGAL_CONTACT_EMAIL}; verified email requests are processed within 30 days. We retain information while your account is active and as needed to provide the service. Deletion removes or de-identifies account data under our control, but workspace content you shared may remain where necessary for other users, record integrity or the organization&apos;s authorized use. Former-member development goals and check-in history may be archived and retained for authorized workplace continuity. Legal, billing, tax, fraud-prevention and security records, and residual backup copies, may remain as needed. Deletion does not require us to erase information another user or organization independently controls.</p>
        </Section>

        <Section title="8. Your Choices and Rights">
          <p>Depending on your location, you may have rights to access, correct, receive, delete or restrict certain personal information, or object to certain processing. You can edit many profile and privacy settings in the service, disable optional presence, manage push permissions on your device, and unsubscribe from eligible emails. Contact {LEGAL_CONTACT_EMAIL} to make a request. We may need to verify your identity and consider the rights of other users and organizations.</p>
        </Section>

        <Section title="9. Security and International Processing">
          <p>We use safeguards such as encrypted transmission, access controls, secure authentication and encrypted storage of Outlook authorization credentials. No system is completely secure, and we cannot guarantee absolute security. Our providers may process information in countries other than your own, subject to safeguards required by applicable law.</p>
        </Section>

        <Section title="10. Children&apos;s Privacy">
          <p>{LEGAL_APP_NAME} is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided information, contact {LEGAL_CONTACT_EMAIL}.</p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will post the revised policy in the App or on the Website, update the &quot;Last updated&quot; date, and provide additional notice when appropriate.</p>
        </Section>

        <Section title="12. Contact Us">
          <p>If you have questions about this Privacy Policy or our data practices:</p>
          <div className="legal-doc-contact">
            <strong>{LEGAL_COMPANY_NAME}</strong>
            <p className="legal-doc-parent">Parent company: {LEGAL_PARENT_COMPANY_NAME}</p>
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          </div>
        </Section>
      </main>
    </WebsiteChrome>
  );
}
