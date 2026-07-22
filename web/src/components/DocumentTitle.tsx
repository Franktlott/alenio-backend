import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setDocumentTitle } from "../lib/document-title";
import { enterpriseNavTitle } from "../lib/enterprise-nav";

function pageTitleForPath(pathname: string): string | null {
  if (pathname === "/") return null;
  if (pathname.startsWith("/pricing")) return "Pricing";
  if (pathname.startsWith("/enterprise")) return "Enterprise";
  if (pathname.startsWith("/security")) return "Security";
  if (pathname.startsWith("/login")) return "Log in";
  if (pathname.startsWith("/sign-up")) return "Sign up";
  if (pathname.startsWith("/auth/callback")) return "Signing in";
  if (pathname.startsWith("/forgot-password")) return "Forgot password";
  if (pathname.startsWith("/reset-password/verify")) return "Verify code";
  if (pathname.startsWith("/reset-password")) return "Reset password";
  if (pathname.startsWith("/verify")) return "Verify email";
  if (pathname.startsWith("/privacy")) return "Privacy Policy";
  if (pathname.startsWith("/terms")) return "Terms of Service";
  if (pathname.startsWith("/account-deletion")) return "Account Deletion";
  if (pathname.startsWith("/chat")) return enterpriseNavTitle("chat");
  if (pathname.startsWith("/dashboard")) return enterpriseNavTitle("execute");
  if (pathname.startsWith("/aleniogo")) return "Alenio Go";
  if (pathname.startsWith("/checklist/")) return "Alenio Go";
  if (pathname.startsWith("/go")) return enterpriseNavTitle("go");
  if (pathname.startsWith("/tasks/new")) return "New task";
  if (pathname.startsWith("/tasks/")) return "Task";
  if (pathname.startsWith("/billing")) return enterpriseNavTitle("plan");
  if (pathname.startsWith("/team")) return enterpriseNavTitle("team");
  if (pathname.startsWith("/admin")) return enterpriseNavTitle("admin");
  if (pathname.startsWith("/settings/ai/seneca-studio")) return "Seneca Studio";
  if (pathname.startsWith("/settings/ai/workspace-context")) return "Workspace Context";
  if (pathname.startsWith("/settings/ai")) return "AI Settings";
  if (pathname.startsWith("/settings/sso")) return "Okta SSO";
  if (pathname.startsWith("/settings") || pathname.startsWith("/profile")) return enterpriseNavTitle("settings");
  return null;
}

export function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    setDocumentTitle(pageTitleForPath(pathname));
  }, [pathname]);

  return null;
}
