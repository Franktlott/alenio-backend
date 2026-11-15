import { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { DocumentTitle } from "./components/DocumentTitle";
import { SessionIdleGuard } from "./components/SessionIdleGuard";
import { lazyPage } from "./lib/lazy-page";
import { getActiveApiTarget, getWebEnvConfigError } from "./lib/env-config";

const AlenioGoLinkPage = lazyPage(() => import("./routes/AlenioGoLinkPage"), "AlenioGoLinkPage");
const WebHomePage = lazyPage(() => import("./routes/WebHomePage"), "WebHomePage");
const WebWorkspacePage = lazyPage(() => import("./routes/WebWorkspacePage"), "WebWorkspacePage");
const WebWorkspaceMemberPage = lazyPage(() => import("./routes/WebWorkspaceMemberPage"), "WebWorkspaceMemberPage");
const WebNetworkPage = lazyPage(() => import("./routes/WebNetworkPage"), "WebNetworkPage");
const PersonProfilePage = lazyPage(() => import("./routes/PersonProfilePage"), "PersonProfilePage");
const SenecaPage = lazyPage(() => import("./routes/seneca/SenecaPage"), "SenecaPage");
const DiscoverIndexPage = lazyPage(() => import("./routes/discover/DiscoverIndexPage"), "DiscoverIndexPage");
const DiscoverReaderPage = lazyPage(() => import("./routes/discover/DiscoverReaderPage"), "DiscoverReaderPage");
const DiscoverListPage = lazyPage(() => import("./routes/discover/DiscoverListPage"), "DiscoverListPage");
const DiscoverEditorPage = lazyPage(() => import("./routes/discover/DiscoverEditorPage"), "DiscoverEditorPage");
const HomeInsightsListPage = lazyPage(
  () => import("./routes/admin/HomeInsightsListPage"),
  "HomeInsightsListPage",
);
const HomeInsightEditorPage = lazyPage(
  () => import("./routes/admin/HomeInsightEditorPage"),
  "HomeInsightEditorPage",
);
const HelpCenterPage = lazyPage(() => import("./routes/HelpCenterPage"), "HelpCenterPage");
const HelpArticlePage = lazyPage(() => import("./routes/HelpArticlePage"), "HelpArticlePage");
const AdminPage = lazyPage(() => import("./routes/AdminPage"), "AdminPage");
const AdminUsersPage = lazyPage(() => import("./routes/admin/AdminUsersPage"), "AdminUsersPage");
const AdminActivityPage = lazyPage(() => import("./routes/admin/AdminActivityPage"), "AdminActivityPage");
const AdminPricingPage = lazyPage(() => import("./routes/admin/AdminPricingPage"), "AdminPricingPage");
const AdminNotificationsPage = lazyPage(
  () => import("./routes/admin/AdminNotificationsPage"),
  "AdminNotificationsPage",
);
const BillingPage = lazyPage(() => import("./routes/BillingPage"), "BillingPage");
const OwnershipTransferReturnPage = lazyPage(
  () => import("./routes/OwnershipTransferReturnPage"),
  "OwnershipTransferReturnPage",
);
const CreateTaskPage = lazyPage(() => import("./routes/CreateTaskPage"), "CreateTaskPage");
const EnterpriseShellLayout = lazyPage(() => import("./routes/EnterpriseShellLayout"), "EnterpriseShellLayout");
const OneOnOneFeedbackPage = lazyPage(() => import("./routes/OneOnOneFeedbackPage"), "OneOnOneFeedbackPage");
const TaskDetailPage = lazyPage(() => import("./routes/TaskDetailPage"), "TaskDetailPage");
const ProfilePage = lazyPage(() => import("./routes/ProfilePage"), "ProfilePage");
const SettingsAiHubPage = lazyPage(() => import("./routes/settings/SettingsAiHubPage"), "SettingsAiHubPage");
const SenecaWorkspaceContextPage = lazyPage(
  () => import("./routes/settings/SenecaWorkspaceContextPage"),
  "SenecaWorkspaceContextPage",
);
const SettingsOktaSsoPage = lazyPage(() => import("./routes/settings/SettingsOktaSsoPage"), "SettingsOktaSsoPage");
const ForgotPasswordPage = lazyPage(() => import("./routes/ForgotPasswordPage"), "ForgotPasswordPage");
const LoginPage = lazyPage(() => import("./routes/LoginPage"), "LoginPage");
const SignUpPage = lazyPage(() => import("./routes/SignUpPage"), "SignUpPage");
const AuthCallbackPage = lazyPage(() => import("./routes/AuthCallbackPage"), "AuthCallbackPage");
const ResetPasswordPage = lazyPage(() => import("./routes/ResetPasswordPage"), "ResetPasswordPage");
const VerifyPage = lazyPage(() => import("./routes/VerifyPage"), "VerifyPage");
const VerifyResetCodePage = lazyPage(() => import("./routes/VerifyResetCodePage"), "VerifyResetCodePage");
const AccountDeletionPage = lazyPage(() => import("./routes/AccountDeletionPage"), "AccountDeletionPage");
const PrivacyPolicyPage = lazyPage(() => import("./routes/PrivacyPolicyPage"), "PrivacyPolicyPage");
const TermsOfServicePage = lazyPage(() => import("./routes/TermsOfServicePage"), "TermsOfServicePage");
const WebsiteHomePage = lazyPage(() => import("./routes/WebsiteHomePage"), "WebsiteHomePage");
const PricingPage = lazyPage(() => import("./routes/PricingPage"), "PricingPage");
const EnterprisePage = lazyPage(() => import("./routes/EnterprisePage"), "EnterprisePage");
const SecurityPage = lazyPage(() => import("./routes/SecurityPage"), "SecurityPage");
const InvitePage = lazyPage(() => import("./routes/InvitePage"), "InvitePage");
const WorkspaceChecklistHubPage = lazyPage(
  () => import("./routes/WorkspaceChecklistHubPage"),
  "WorkspaceChecklistHubPage",
);
const GoKioskSessionLayout = lazyPage(() => import("./routes/GoKioskSessionLayout"), "GoKioskSessionLayout");
const GetAppPage = lazyPage(() => import("./routes/GetAppPage"), "GetAppPage");

function PageLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#334155",
        fontFamily: "system-ui, sans-serif",
        fontWeight: 600,
      }}
    >
      Opening Alenio…
    </div>
  );
}

function missingWebEnvMessage(): string | null {
  return getWebEnvConfigError();
}

function SetupEnvScreen({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--surface-muted)",
        color: "var(--text)",
        fontFamily: "inherit",
      }}
      data-testid="setup-env-screen"
    >
      <div
        style={{
          maxWidth: 480,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "28px 24px",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>Configure environment</h1>
        <p style={{ margin: "0 0 8px", color: "var(--muted)", lineHeight: 1.5 }}>{message}</p>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", lineHeight: 1.5, fontSize: 13 }}>
          Active local target: <strong style={{ color: "var(--text)" }}>{getActiveApiTarget()}</strong> (set{" "}
          <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_API_TARGET=development</code> or{" "}
          <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>production</code> in <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>web/.env</code>).
        </p>
        <ol style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.6 }}>
          <li>
            In the <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>web</code> folder, run:{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>cp .env.example .env</code>
          </li>
          <li>
            Under <strong>Development</strong>, set{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_DEV_BACKEND_URL</code>. Under <strong>Production</strong>, set{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_PROD_BACKEND_URL</code>. Auth uses the same backend URL (Better Auth at{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>/api/auth</code>). Use{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_API_TARGET</code> to switch locally.
          </li>
          <li>
            Stop the dev server and start again: <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>bun run dev</code> — Vite only
            reads <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>.env</code> on startup.
          </li>
        </ol>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          After this, reload the page. Check the browser console (F12) if anything still fails.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const envMsg = missingWebEnvMessage();
  if (envMsg) {
    return <SetupEnvScreen message={envMsg} />;
  }

  return (
    <BrowserRouter>
      <DocumentTitle />
      <SessionIdleGuard />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/verify" element={<VerifyResetCodePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/enterprise-invite/:token" element={<Navigate to="/login" replace />} />
        <Route path="/checklist/:hubToken" element={<GoKioskSessionLayout />}>
          <Route index element={<WorkspaceChecklistHubPage />} />
          <Route path=":checklistId" element={<Navigate to=".." replace />} />
        </Route>
        <Route path="/aleniogo" element={<AlenioGoLinkPage />} />
        <Route path="/get-app" element={<GetAppPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/account-deletion" element={<AccountDeletionPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/help/:slug" element={<HelpArticlePage />} />
        <Route path="/" element={<WebsiteHomePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/enterprise" element={<EnterprisePage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route
          element={
            <AuthGate>
              <EnterpriseShellLayout />
            </AuthGate>
          }
        >
          <Route path="/home" element={<WebHomePage />} />
          <Route path="/workspace" element={<WebWorkspacePage />} />
          <Route path="/workspace/tasks" element={<WebWorkspacePage section="tasks" />} />
          <Route path="/workspace/calendar" element={<WebWorkspacePage section="calendar" />} />
          <Route path="/workspace/members" element={<WebWorkspacePage section="members" />} />
          <Route path="/workspace/stars" element={<WebWorkspacePage section="momentum" />} />
          <Route path="/workspace/momentum" element={<Navigate to="/workspace/stars" replace />} />
          <Route path="/workspace/members/:userId" element={<WebWorkspaceMemberPage />} />
          <Route path="/network" element={<WebNetworkPage />} />
          <Route path="/people/:userId" element={<PersonProfilePage />} />
          <Route path="/seneca" element={<SenecaPage />} />
          <Route path="/discover" element={<DiscoverIndexPage />} />
          <Route path="/discover/:slug" element={<DiscoverReaderPage />} />
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/chat" element={<Navigate to="/home" replace />} />
          <Route path="/activity" element={<Navigate to="/workspace" replace />} />
          <Route path="/team" element={<Navigate to="/network" replace />} />
          {/* Alenio Go is hidden on the web for now; its pages stay in routes/alenio-go. */}
          <Route path="/go/*" element={<Navigate to="/home" replace />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/ownership-transfer" element={<OwnershipTransferReturnPage />} />
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/activity" element={<AdminActivityPage />} />
          <Route path="/admin/workspaces" element={<AdminPage section="workspaces" />} />
          <Route path="/admin/seneca" element={<AdminPage section="seneca-studio" />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/pricing" element={<AdminPricingPage />} />
          <Route path="/admin/discover" element={<DiscoverListPage />} />
          <Route path="/admin/discover/categories" element={<Navigate to="/admin/discover?categories=1" replace />} />
          <Route path="/admin/discover/new" element={<DiscoverEditorPage />} />
          <Route path="/admin/discover/:articleId" element={<DiscoverEditorPage />} />
          <Route path="/admin/home-insights" element={<HomeInsightsListPage />} />
          <Route path="/admin/home-insights/new" element={<HomeInsightEditorPage />} />
          <Route path="/admin/home-insights/:insightId" element={<HomeInsightEditorPage />} />
          <Route path="/settings" element={<ProfilePage />} />
          <Route path="/settings/ai" element={<SettingsAiHubPage />} />
          <Route path="/settings/ai/seneca-studio" element={<Navigate to="/admin/seneca" replace />} />
          <Route path="/settings/ai/workspace-context" element={<SenecaWorkspaceContextPage />} />
          <Route path="/settings/sso/okta" element={<SettingsOktaSsoPage />} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="/tasks/new" element={<CreateTaskPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
        </Route>
        <Route
          path="/one-on-one-feedback"
          element={
            <AuthGate>
              <OneOnOneFeedbackPage />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
