import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { DocumentTitle } from "./components/DocumentTitle";
import { SessionIdleGuard } from "./components/SessionIdleGuard";
import { AlenioGoLinkPage } from "./routes/AlenioGoLinkPage";
import { AlenioGoLayout } from "./routes/alenio-go/AlenioGoLayout";
import { AlenioGoHomePage } from "./routes/alenio-go/AlenioGoHomePage";
import { AlenioGoAlertsModulePage } from "./routes/alenio-go/AlenioGoAlertsModulePage";
import { AlenioGoLinkedDevicesRoutes } from "./routes/alenio-go/AlenioGoLinkedDevicesRoutes";
import { AlenioGoModuleSettingsPage } from "./routes/alenio-go/AlenioGoModuleSettingsPage";
import { WalkItemCreatePage } from "./routes/alenio-go/WalkItemCreatePage";
import { WalkItemLibraryPage } from "./routes/alenio-go/WalkItemLibraryPage";
import { WalkBuilderPage } from "./routes/alenio-go/WalkBuilderPage";
import { WalkDetailsPage } from "./routes/alenio-go/WalkDetailsPage";
import { WalksListPage } from "./routes/alenio-go/WalksListPage";
import { WalkSchedulesPage } from "./routes/alenio-go/WalkSchedulesPage";
import { TempsModuleLayout } from "./routes/alenio-go/TempsModuleLayout";
import { TempsDashboardPage } from "./routes/alenio-go/TempsDashboardPage";
import { TempsReportsPage } from "./routes/alenio-go/TempsReportsPage";
import { ActivityPage } from "./routes/ActivityPage";
import { AdminPage } from "./routes/AdminPage";
import { BillingPage } from "./routes/BillingPage";
import { ChatPage } from "./routes/ChatPage";
import { CreateTaskPage } from "./routes/CreateTaskPage";
import { DashboardPage } from "./routes/DashboardPage";
import { EnterpriseShellLayout } from "./routes/EnterpriseShellLayout";
import { OneOnOneFeedbackPage } from "./routes/OneOnOneFeedbackPage";
import { TaskDetailPage } from "./routes/TaskDetailPage";
import { TeamPage } from "./routes/TeamPage";
import { ProfilePage } from "./routes/ProfilePage";
import { SettingsAiHubPage } from "./routes/settings/SettingsAiHubPage";
import { SenecaWorkspaceContextPage } from "./routes/settings/SenecaWorkspaceContextPage";
import { SettingsOktaSsoPage } from "./routes/settings/SettingsOktaSsoPage";
import { ForgotPasswordPage } from "./routes/ForgotPasswordPage";
import { LoginPage } from "./routes/LoginPage";
import { SignUpPage } from "./routes/SignUpPage";
import { AuthCallbackPage } from "./routes/AuthCallbackPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { VerifyPage } from "./routes/VerifyPage";
import { VerifyResetCodePage } from "./routes/VerifyResetCodePage";
import { AccountDeletionPage } from "./routes/AccountDeletionPage";
import { PrivacyPolicyPage } from "./routes/PrivacyPolicyPage";
import { TermsOfServicePage } from "./routes/TermsOfServicePage";
import { WebsiteHomePage } from "./routes/WebsiteHomePage";
import { PricingPage } from "./routes/PricingPage";
import { EnterprisePage } from "./routes/EnterprisePage";
import { SecurityPage } from "./routes/SecurityPage";
import { InvitePage } from "./routes/InvitePage";
import { WorkspaceChecklistHubPage } from "./routes/WorkspaceChecklistHubPage";
import { GoKioskSessionLayout } from "./routes/GoKioskSessionLayout";
import { GetAppPage } from "./routes/GetAppPage";
import { getActiveApiTarget, getWebEnvConfigError } from "./lib/env-config";

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/verify" element={<VerifyResetCodePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/checklist/:hubToken" element={<GoKioskSessionLayout />}>
          <Route index element={<WorkspaceChecklistHubPage />} />
          <Route path=":checklistId" element={<Navigate to=".." replace />} />
        </Route>
        <Route path="/aleniogo" element={<AlenioGoLinkPage />} />
        <Route path="/get-app" element={<GetAppPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/account-deletion" element={<AccountDeletionPage />} />
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/go" element={<AlenioGoLayout />}>
            <Route index element={<AlenioGoHomePage />} />
            <Route path="alerts" element={<AlenioGoAlertsModulePage />} />
            <Route path="devices/*" element={<AlenioGoLinkedDevicesRoutes />} />
            <Route path="setup" element={<Navigate to="/go/devices" replace />} />
            <Route path="frontend" element={<Navigate to="/go/devices/display" replace />} />
            <Route path="checklists" element={<AlenioGoModuleSettingsPage moduleKey="checklists" />} />
            {/* Module lifecycle (Testing/Live) lives on Go Admin — not inside Temps product chrome */}
            <Route
              path="temp-checks/module"
              element={<AlenioGoModuleSettingsPage moduleKey="temp-checks" />}
            />
            <Route path="temp-checks/settings" element={<Navigate to="/go/temp-checks/module" replace />} />
            <Route path="temp-checks" element={<TempsModuleLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<TempsDashboardPage />} />
              <Route path="library" element={<WalkItemLibraryPage />} />
              <Route path="library/new" element={<WalkItemCreatePage />} />
              <Route path="library/:itemId/edit" element={<WalkItemCreatePage />} />
            {/* Builder routes must stay above walks/:templateId so "builder" is never treated as an id */}
            <Route path="walks/builder/:templateId" element={<WalkBuilderPage />} />
            <Route path="walks/builder" element={<WalkBuilderPage />} />
            <Route path="walks/:templateId" element={<WalkDetailsPage />} />
            <Route path="walks" element={<WalksListPage />} />
              <Route path="schedule" element={<WalkSchedulesPage />} />
              <Route path="reports" element={<TempsReportsPage />} />
            </Route>
            <Route path="briefings/*" element={<AlenioGoModuleSettingsPage moduleKey="briefings" />} />
            <Route path="walks" element={<AlenioGoModuleSettingsPage moduleKey="walks" />} />
          </Route>
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<ProfilePage />} />
          <Route path="/settings/ai" element={<SettingsAiHubPage />} />
          <Route path="/settings/ai/seneca-studio" element={<Navigate to="/admin?tab=seneca-studio" replace />} />
          <Route path="/settings/ai/workspace-context" element={<SenecaWorkspaceContextPage />} />
          <Route path="/settings/sso/okta" element={<SettingsOktaSsoPage />} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="/tasks/new" element={<CreateTaskPage />} />
        </Route>
        <Route
          path="/tasks/:taskId"
          element={
            <AuthGate>
              <TaskDetailPage />
            </AuthGate>
          }
        />
        <Route
          path="/one-on-one-feedback"
          element={
            <AuthGate>
              <OneOnOneFeedbackPage />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
