import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { ActivityPage } from "./routes/ActivityPage";
import { ChatPage } from "./routes/ChatPage";
import { CreateTaskPage } from "./routes/CreateTaskPage";
import { DashboardPage } from "./routes/DashboardPage";
import { TaskDetailPage } from "./routes/TaskDetailPage";
import { LoginPage } from "./routes/LoginPage";
import { VerifyPage } from "./routes/VerifyPage";
import { WebsiteHomePage } from "./routes/WebsiteHomePage";

function missingWebEnvMessage(): string | null {
  if (!import.meta.env.VITE_NEON_AUTH_URL?.trim()) {
    return "VITE_NEON_AUTH_URL is not set.";
  }
  if (!import.meta.env.VITE_BACKEND_URL?.trim()) {
    return "VITE_BACKEND_URL is not set.";
  }
  return null;
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
        <p style={{ margin: "0 0 16px", color: "var(--muted)", lineHeight: 1.5 }}>{message}</p>
        <ol style={{ margin: "0 0 16px", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.6 }}>
          <li>
            In the <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>web</code> folder, run:{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>cp .env.example .env</code>
          </li>
          <li>
            Set <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_NEON_AUTH_URL</code> (same as mobile{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>EXPO_PUBLIC_NEON_AUTH_URL</code>) and{" "}
            <code style={{ color: "var(--accent)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>VITE_BACKEND_URL</code> (same as{" "}
            <code style={{ color: "var(--text)", background: "var(--surface-muted)", padding: "2px 6px", borderRadius: 4 }}>EXPO_PUBLIC_BACKEND_URL</code>).
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/" element={<WebsiteHomePage />} />
        <Route
          path="/dashboard"
          element={
            <AuthGate>
              <DashboardPage />
            </AuthGate>
          }
        />
        <Route
          path="/activity"
          element={
            <AuthGate>
              <ActivityPage />
            </AuthGate>
          }
        />
        <Route
          path="/chat"
          element={
            <AuthGate>
              <ChatPage />
            </AuthGate>
          }
        />
        <Route
          path="/tasks/new"
          element={
            <AuthGate>
              <CreateTaskPage />
            </AuthGate>
          }
        />
        <Route
          path="/tasks/:taskId"
          element={
            <AuthGate>
              <TaskDetailPage />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
