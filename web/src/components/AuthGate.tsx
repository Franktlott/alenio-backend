import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { clearAccessToken, getAccessToken } from "../lib/auth-client";
import { isJwtExpiredSkew, looksLikeJwt } from "../lib/token";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  const token = getAccessToken();
  if (!token || !looksLikeJwt(token)) {
    return <Navigate to="/login" replace />;
  }
  if (isJwtExpiredSkew(token)) {
    clearAccessToken();
    return <Navigate to="/login?reason=session" replace />;
  }
  return <>{children}</>;
}
