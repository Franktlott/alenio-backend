import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { clearAccessToken, getAccessToken } from "../lib/auth-client";
import { isSessionTokenExpired, isSessionTokenUsable } from "../lib/token";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  const token = getAccessToken();
  if (!isSessionTokenUsable(token)) {
    if (token && isSessionTokenExpired(token)) {
      clearAccessToken();
      return <Navigate to="/login?reason=session" replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
