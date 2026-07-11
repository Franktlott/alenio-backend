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

export function TermsOfServicePage() {
  return (
    <div className="legal-doc-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-back">
          ← Back
        </Link>
        <span className="legal-doc-brand">Alenio</span>
      </header>
      <main className="legal-doc-main">
        <h1 className="legal-doc-title">Terms of Service</h1>
        <p className="legal-doc-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

        <p>
          Please read these Terms of Service (&quot;Terms&quot;) carefully before using the {LEGAL_APP_NAME} mobile application or the{" "}
          {LEGAL_APP_NAME} website at {LEGAL_WEBSITE_LABEL}, operated by {LEGAL_COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;). {LEGAL_COMPANY_NAME} is a subsidiary of {LEGAL_PARENT_COMPANY_NAME}. By accessing or using {LEGAL_APP_NAME},
          you agree to be bound by these Terms.
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or using {LEGAL_APP_NAME}, you confirm that you are at least 13 years of age, have read and understood
            these Terms, and agree to comply. If you do not agree, you may not use the App or the Website.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            {LEGAL_APP_NAME} is a team communication and task management platform (mobile and web). Features may change over time; we may
            modify, suspend, or discontinue any part of the service.
          </p>
        </Section>

        <Section title="3. Account Registration">
          <p>To use {LEGAL_APP_NAME}, you must:</p>
          <ul>
            <li>Create an account with a valid email address and secure password.</li>
            <li>Provide accurate registration information.</li>
            <li>Keep your credentials confidential.</li>
            <li>Notify us promptly of unauthorized access.</li>
            <li>Be responsible for activity under your account.</li>
          </ul>
        </Section>

        <Section title="4. Acceptable Use">
          <p>You agree to use {LEGAL_APP_NAME} only for lawful purposes. You agree not to:</p>
          <ul>
            <li>Post unlawful, harmful, defamatory, obscene, or offensive content.</li>
            <li>Harass, bully, or threaten others.</li>
            <li>Impersonate any person or entity.</li>
            <li>Upload malware or disrupt the service.</li>
            <li>Attempt unauthorized access to the service or other accounts.</li>
            <li>Use the service for spam or unsolicited advertising.</li>
            <li>Violate applicable laws.</li>
            <li>Scrape or use automated access to the App or Website without permission.</li>
          </ul>
        </Section>

        <Section title="5. User Content">
          <p>
            You retain ownership of content you create. By posting content, you grant {LEGAL_COMPANY_NAME} a non-exclusive, worldwide,
            royalty-free license to host, store, and display that content solely to operate the service. You are responsible for your
            content.
          </p>
        </Section>

        <Section title="6. Subscriptions and Payments">
          <p>
            {LEGAL_APP_NAME} may offer premium plans. Payment and billing for team plans are processed on the web by
            Stripe. You authorize charges according to the plan you select. Manage billing on {LEGAL_WEBSITE_LABEL} or in
            Plan &amp; Access. Stripe&apos;s terms and privacy policy apply to their processing. The mobile app does not
            process subscription purchases.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All rights in {LEGAL_APP_NAME}, including software, design, logos, and {LEGAL_COMPANY_NAME} content, are owned by or licensed to{" "}
            {LEGAL_COMPANY_NAME}. You may not copy, modify, distribute, sell, or lease any part of the App, Website, or their content
            without our written consent.
          </p>
        </Section>

        <Section title="8. Privacy">
          <p>
            Your use is also governed by our Privacy Policy, incorporated by reference. By using the App or Website, you consent to our
            data practices described there.
          </p>
        </Section>

        <Section title="9. Video Meetings">
          <p>
            Video meetings use Daily.co. Rooms are subject to Daily.co&apos;s terms. Meeting rooms expire automatically (typically within
            about an hour after the scheduled end, or within 24 hours if no end time). You may share links with participants; you are
            responsible for who receives them. {LEGAL_COMPANY_NAME} does not record or store meeting video or audio.
          </p>
        </Section>

        <Section title="10. Team Responsibilities">
          <p>
            Team administrators are responsible for membership and compliance. {LEGAL_COMPANY_NAME} is not responsible for disputes between
            team members.
          </p>
        </Section>

        <Section title="11. Disclaimers">
          <p>
            {LEGAL_APP_NAME} is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. We do not warrant
            uninterrupted or error-free service.
          </p>
        </Section>

        <Section title="12. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, {LEGAL_COMPANY_NAME} and its officers, directors, employees, and agents shall not be
            liable for indirect, incidental, special, consequential, or punitive damages arising from your use of {LEGAL_APP_NAME}. Our
            total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
          </p>
        </Section>

        <Section title="13. Indemnification">
          <p>You agree to indemnify {LEGAL_COMPANY_NAME} from claims arising from your use of {LEGAL_APP_NAME}, your content, or violation of these Terms.</p>
        </Section>

        <Section title="14. Termination">
          <p>
            We may suspend or terminate your account for violations. You may delete your account in the App or through your account on the
            Website. Upon termination, your right to use {LEGAL_APP_NAME} ends.
          </p>
        </Section>

        <Section title="15. Changes to Terms">
          <p>
            We may update these Terms. Material changes will be communicated in the App or on the Website. Continued use after the effective
            date constitutes acceptance.
          </p>
        </Section>

        <Section title="16. Governing Law">
          <p>
            These Terms are governed by the laws of the United States and the state where {LEGAL_COMPANY_NAME} is organized, without regard
            to conflict-of-law principles. Disputes shall first be addressed in good faith negotiation, then in the courts of that
            jurisdiction where permitted.
          </p>
        </Section>

        <Section title="17. Contact Us">
          <p>Questions about these Terms:</p>
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
