import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/ui/Feedback";
import { ErrorBoundary } from "./ErrorBoundary";
import { queryClient } from "./lib/query-client";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

function showBootError(err: unknown) {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
  rootEl.style.cssText =
    "min-height:100vh;padding:24px;font:14px/1.45 ui-sans-serif,system-ui;color:#991b1b;white-space:pre-wrap";
  rootEl.textContent = `Alenio failed to load.\n\n${message}`;
}

window.addEventListener("error", (event) => {
  if (!rootEl.childElementCount) showBootError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  if (!rootEl.childElementCount) showBootError(event.reason);
});

try {
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
} catch (err) {
  showBootError(err);
}
