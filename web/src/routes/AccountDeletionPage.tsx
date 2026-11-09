import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
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
    <WebsiteChrome
      hero={
        <>
          <p className="lp-badge">Legal</p>
          <h1>Delete your {LEGAL_APP_NAME} account</h1>
          <p>Last updated: {LEGAL_LAST_UPDATED}</p>
        </>
      }
    >
      <main className="legal-doc-main lp-legal" data-testid="account-deletion-page">

        <p>
          {LEGAL_COMPANY_NAME} operates the {LEGAL_APP_NAME} mobile app and website at {LEGAL_WEBSITE_LABEL}. This page
          explains how to request permanent deletion of your account and associated personal data. Deletion cannot be
          undone.
        </p>

        <Section title="Delete in the mobile app">
          <ol>
            <li>Open the {LEGAL_APP_NAME} app and sign in.</li>
            <li>Go to the <strong>Profile</strong> tab.</li>
            <li>Scroll to <strong>Security &amp; access</strong> and tap <strong>Security</strong>.</li>
            <li>Choose <strong>Account deletion</strong>, review the impact and any blockers, then follow the confirmation steps.</li>
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
              Open <strong>Profile</strong> from the sidebar.
            </li>
            <li>
              Scroll to <strong>Legal information</strong> and choose <strong>Account deletion</strong>.
            </li>
            <li>Review the impact and any workspace or billing blockers, enter your password, and confirm permanent deletion.</li>
          </ol>
        </Section>

        <Section title="Request account deletion by email">
          <p>If you cannot access the app or website, you can ask us to delete your account by email.</p>
          <ol>
            <li>
              From the email address on your Alenio account, email{" "}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Account%20deletion%20request`}>{LEGAL_CONTACT_EMAIL}</a>.
            </li>
            <li>
              Use the subject line <strong>Account deletion request</strong>.
            </li>
            <li>Include your full name and the email address you used to sign up.</li>
            <li>Reply to our verification email so we can confirm the request came from you.</li>
            <li>
              We will confirm by email once your account and associated personal data have been deleted, within{" "}
              <strong>30 days</strong> of verification.
            </li>
          </ol>
        </Section>

        <Section title="Delete some of your data without deleting your account">
          <p>
            You can keep your account and ask us to delete specific personal data, such as your profile photo, profile
            details, connections, uploaded files or notification tokens.
          </p>
          <ol>
            <li>
              From the email address on your Alenio account, email{" "}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Data%20deletion%20request`}>{LEGAL_CONTACT_EMAIL}</a>.
            </li>
            <li>
              Use the subject line <strong>Data deletion request</strong>.
            </li>
            <li>Include your full name and the email address you used to sign up.</li>
            <li>List the data you want deleted. Be as specific as you can, for example &ldquo;my profile photo and connections.&rdquo;</li>
            <li>Reply to our verification email so we can confirm the request came from you.</li>
            <li>
              We will delete the requested data within <strong>30 days</strong> of verification and confirm by email.
              If some data must be kept, we will tell you what and why.
            </li>
          </ol>
          <p>
            The same limits described below apply: content you shared in a workspace and records we must keep for
            billing, security or legal reasons may be retained.
          </p>
        </Section>

        <Section title="What we delete">
          <p>When deletion is completed, we delete or de-identify personal account data under our control, including:</p>
          <ul>
            <li>Your sign-in credentials, sessions and personal account profile</li>
            <li>Personal connection requests, accepted connections, blocks, privacy settings and optional presence record</li>
            <li>Your active workspace memberships and role assignments, subject to any ownership or billing blockers</li>
            <li>Personal notification tokens and account-level preferences</li>
            <li>Uploaded files and photos that are not retained as part of shared workspace content or another authorized record</li>
            <li>Authentication records under our control, subject to security and legal retention needs</li>
          </ul>
          <p>
            Workspaces and organization data do not disappear when one member deletes an account. Content you shared with
            others—including direct, group and channel messages, mentions, reactions, polls, tasks, events, check-ins,
            one-on-ones, development content, standards, team-health records, workplace-operation responses and related
            uploads—may remain where needed for recipients, record integrity, or an organization&apos;s authorized use.
            The service may remove your identifiers or show you as a former or deleted member where appropriate.
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
              <strong>Workplace continuity:</strong> Former-member development goals and check-in history may be archived
              and retained for access by authorized workplace users. Other shared workplace records may remain according
              to role, permissions and the organization&apos;s legitimate use.
            </li>
            <li>
              <strong>Legal and financial records:</strong> We may retain information required for tax, accounting,
              billing, fraud prevention, security, dispute resolution, or legal obligations as needed.
            </li>
            <li>
              <strong>Backups:</strong> Residual copies may remain in backups until they are overwritten or no longer
              needed for recovery and security.
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
    </WebsiteChrome>
  );
}
