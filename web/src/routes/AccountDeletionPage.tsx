import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  LEGAL_APP_NAME,
  LEGAL_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_PARENT_COMPANY_NAME,
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

export function AccountDeletionPage() {
  return (
    <div className="legal-doc-page" data-testid="account-deletion-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-back">
          ← Back
        </Link>
        <span className="legal-doc-brand">{LEGAL_APP_NAME}</span>
      </header>
      <main className="legal-doc-main">
        <h1 className="legal-doc-title">Delete your {LEGAL_APP_NAME} account</h1>
        <p className="legal-doc-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

        <p>
          {LEGAL_COMPANY_NAME} operates the {LEGAL_APP_NAME} mobile app and website at {LEGAL_WEBSITE_LABEL}. This page
          explains how to request permanent deletion of your account and associated personal data. Deletion cannot be
          undone.
        </p>

        <Section title="Delete in the mobile app">
          <ol>
            <li>Open the {LEGAL_APP_NAME} app and sign in.</li>
            <li>Go to the <strong>Profile</strong> tab.</li>
            <li>Under <strong>Legal</strong>, tap <strong>Account deletion</strong>.</li>
            <li>Review what will be removed, enter your password, and confirm.</li>
          </ol>
        </Section>

        <Section title="Delete on the website">
          <ol>
            <li>
              Sign in at{" "}
              <Link to="/login" className="legal-doc-inline-link">
                {LEGAL_WEBSITE_LABEL}/login
              </Link>
              .
            </li>
            <li>
              Open <strong>Profile</strong> from the sidebar (or go to{" "}
              <Link to="/profile" className="legal-doc-inline-link">
                {LEGAL_WEBSITE_LABEL}/profile
              </Link>
              ).
            </li>
            <li>
              In the <strong>Legal</strong> section, choose <strong>Account deletion</strong>.
            </li>
            <li>Enter your password and confirm permanent deletion.</li>
          </ol>
        </Section>

        <Section title="Request by email">
          <p>
            If you cannot access the app or website, email{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Account%20deletion%20request`}>{LEGAL_CONTACT_EMAIL}</a> from
            the address on your account. Include the email you used to sign up. We will verify your identity and process
            the request within <strong>30 days</strong>.
          </p>
        </Section>

        <Section title="What we delete">
          <p>When your account is deleted, we permanently remove, including:</p>
          <ul>
            <li>Your account credentials and profile (name, email, photo)</li>
            <li>Messages and direct messages you sent</li>
            <li>Tasks, subtasks, and templates you created</li>
            <li>Polls you created and your poll votes</li>
            <li>Topics you created</li>
            <li>Files and photos you uploaded to our storage</li>
            <li>Your authentication record with our identity provider</li>
          </ul>
          <p>
            Team workspaces you belong to may remain for other members. Content you shared inside a team (for example,
            messages in a channel) may remain visible to the team unless we remove it as part of deleting your account;
            your membership and personal account data are removed.
          </p>
        </Section>

        <Section title="What we may keep">
          <ul>
            <li>
              <strong>Billing:</strong> If your workspace has an active Pro plan, cancel or transfer billing in Plan
              &amp; Access (or the web billing dashboard) before deleting your account if you are the workspace owner.
              Account deletion does not automatically refund past charges.
            </li>
            <li>
              <strong>Legal and financial records:</strong> We may retain information required for tax, accounting,
              fraud prevention, or legal obligations for the period required by law.
            </li>
            <li>
              <strong>Backups:</strong> Residual copies in encrypted backups may persist for a limited time before they
              are overwritten.
            </li>
          </ul>
        </Section>

        <Section title="Questions">
          <p>
            For privacy questions, see our{" "}
            <Link to="/privacy" className="legal-doc-inline-link">
              Privacy Policy
            </Link>
            .
          </p>
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
