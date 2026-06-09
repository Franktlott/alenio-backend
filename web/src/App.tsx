import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { DocumentTitle } from "./components/DocumentTitle";
import { SessionIdleGuard } from "./components/SessionIdleGuard";
import { ActivityPage } from "./routes/ActivityPage";
import { BillingPage } from "./routes/BillingPage";
import { ChatPage } from "./routes/ChatPage";
import { CreateTaskPage } from "./routes/CreateTaskPage";
import { DashboardPage } from "./routes/DashboardPage";
import { EnterpriseShellLayout } from "./routes/EnterpriseShellLayout";
import { TaskDetailPage } from "./routes/TaskDetailPage";
import { TeamPage } from "./routes/TeamPage";
import { ProfilePage } from "./routes/ProfilePage";
import { ForgotPasswordPage } from "./routes/ForgotPasswordPage";
import { LoginPage } from "./routes/LoginPage";
import { SignUpPage } from "./routes/SignUpPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { VerifyPage } from "./routes/VerifyPage";
import { VerifyResetCodePage } from "./routes/VerifyResetCodePage";
import { AccountDeletionPage } from "./routes/AccountDeletionPage";
import { PrivacyPolicyPage } from "./routes/PrivacyPolicyPage";
import { TermsOfServicePage } from "./routes/TermsOfServicePage";
import { WebsiteHomePage } from "./routes/WebsiteHomePage";
import { PricingPage } from "./routes/PricingPage";
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
            Under <strong>Development</strong>, set <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_DEV_NEON_AUTH_URL</code> and{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_DEV_BACKEND_URL</code>. Under <strong>Production</strong>, set{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_PROD_NEON_AUTH_URL</code> and{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_PROD_BACKEND_URL</code>. Use{" "}
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/verify" element={<VerifyResetCodePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/account-deletion" element={<AccountDeletionPage />} />
        <Route path="/" element={<WebsiteHomePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route
          element={
            <AuthGate>
              <EnterpriseShellLayout />
            </AuthGate>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/profile" element={<ProfilePage />} />
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
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
