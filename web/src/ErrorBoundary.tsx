import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[enterprise-web]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            background: "var(--surface-muted)",
            color: "var(--text)",
            fontFamily: "inherit",
          }}
          data-testid="error-boundary"
        >
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</h1>
          <pre
            style={{
              marginTop: 16,
              padding: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
              color: "var(--danger)",
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ color: "var(--muted)", marginTop: 16 }}>
            Open the browser console (F12 → Console) for the full stack trace.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
