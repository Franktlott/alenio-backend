import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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
    <div className="legal-doc-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-back">
          ← Back
        </Link>
        <span className="legal-doc-brand">Alenio</span>
      </header>
      <main className="legal-doc-main">
        <h1 className="legal-doc-title">Privacy Policy</h1>
        <p className="legal-doc-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

        <p>
          {LEGAL_COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the {LEGAL_APP_NAME} mobile application (the
          &quot;App&quot;) and the {LEGAL_APP_NAME} website at {LEGAL_WEBSITE_LABEL} (the &quot;Website&quot;). {LEGAL_COMPANY_NAME} is a
          subsidiary of {LEGAL_PARENT_COMPANY_NAME}. This Privacy Policy explains how we collect, use, disclose, and safeguard your
          information when you use the App or the Website. Please read it carefully.
        </p>

        <Section title="1. Information We Collect">
          <p>We collect the following types of information:</p>
          <ul>
            <li>
              <strong>Account Information:</strong> Name, email address, and credentials when you create an account (including email
              verification through our authentication provider).
            </li>
            <li>
              <strong>Profile Information:</strong> Profile photo and any optional details you choose to add.
            </li>
            <li>
              <strong>Content You Create:</strong> Messages, tasks, events, comments, and reactions you post within the App or Website.
            </li>
            <li>
              <strong>Team &amp; collaboration data:</strong> Team names, membership information, channels, and associated content.
            </li>
            <li>
              <strong>Video call data:</strong> When you use video meetings, your display name is shared with the video call provider
              (Daily.co) to identify you during the call. We do not record or store video or audio content from meetings on our servers.
            </li>
            <li>
              <strong>Device information:</strong> Device type, operating system, push notification tokens, and app version (when you use
              the App).
            </li>
            <li>
              <strong>Usage data:</strong> Features used, actions taken, and timestamps of interactions.
            </li>
            <li>
              <strong>Website &amp; session data:</strong> When you use the Website, our authentication provider uses cookies and similar
              technologies as needed for sign-in sessions, security, and preferences in your browser.
            </li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, operate, and maintain the App, the Website, and their features.</li>
            <li>Create and manage your account and authenticate your identity.</li>
            <li>Enable team communication, task management, collaboration, and video meetings.</li>
            <li>Send push notifications for messages, tasks, and reminders (you may opt out in Settings).</li>
            <li>
              Process payments: in-app purchases via the applicable app store; on the web, via Stripe when you subscribe or manage billing
              at {LEGAL_WEBSITE_LABEL}.
            </li>
            <li>Respond to your support requests and communicate important updates.</li>
            <li>Monitor and analyse usage to improve performance and features.</li>
            <li>Detect, prevent, and address technical issues and security threats.</li>
          </ul>
        </Section>

        <Section title="3. How We Share Your Information">
          <p>We do not sell your personal information. We may share your data in the following circumstances:</p>
          <ul>
            <li>
              <strong>Within your team:</strong> Content you share is visible to members of your team as part of core functionality.
            </li>
            <li>
              <strong>Service providers:</strong> We use third-party services including Neon (database and authentication), RevenueCat
              (in-app subscriptions), Google Firebase (FCM for Android push and storage for uploads), Expo and Apple/Google (distribution
              and push), Daily.co (video meetings), Resend (email), Stripe (payments on the Website), and other infrastructure providers.
              They process data under their respective terms and privacy policies.
            </li>
            <li>
              <strong>Legal requirements:</strong> We may disclose your information if required by law or to protect our rights, users,
              or the public.
            </li>
            <li>
              <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be
              transferred as part of that transaction.
            </li>
          </ul>
        </Section>

        <Section title="4. Data Retention">
          <p>
            We retain your personal information for as long as your account is active or as needed to provide services. You may request
            deletion of your account and associated data by emailing {LEGAL_CONTACT_EMAIL}. We will process deletion requests within 30
            days, subject to any legal obligations to retain certain data.
          </p>
        </Section>

        <Section title="5. Your Rights">
          <p>Depending on your location, you may have rights regarding your personal data, including access, correction, deletion, and opt-out.</p>
          <p>To exercise these rights, contact us at {LEGAL_CONTACT_EMAIL}.</p>
        </Section>

        <Section title="6. Data Security">
          <p>
            We implement industry-standard security measures including encrypted data transmission (TLS/HTTPS), secure authentication, and
            access controls. No method of transmission over the internet is 100% secure.
          </p>
        </Section>

        <Section title="7. Children’s Privacy">
          <p>
            {LEGAL_APP_NAME} is not directed to children under 13. We do not knowingly collect personal information from children under 13.
            If you believe we have inadvertently collected such information, contact us at {LEGAL_CONTACT_EMAIL} and we will promptly
            delete it.
          </p>
        </Section>

        <Section title="8. Third-Party Services">
          <p>The App and Website integrate with services including Neon, Apple (APNs), Google Firebase, RevenueCat, Resend, Expo, Daily.co, and Stripe (web billing). Each is governed by its own policies.</p>
        </Section>

        <Section title="9. International Data Transfers">
          <p>Your information may be transferred to and processed in countries other than your own, with appropriate safeguards where required.</p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Material changes will be posted in the App or on the Website with an updated
            &quot;Last updated&quot; date. Continued use after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>If you have questions about this Privacy Policy or our data practices:</p>
          <div className="legal-doc-contact">
            <strong>{LEGAL_COMPANY_NAME}</strong>
            <p className="legal-doc-parent">Parent company: {LEGAL_PARENT_COMPANY_NAME}</p>
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          </div>
        </Section>
      </main>
    </div>
  );
}
