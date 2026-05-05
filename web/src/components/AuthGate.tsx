import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getAccessToken } from "../lib/auth-client";
import { looksLikeJwt } from "../lib/token";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  const token = getAccessToken();
  if (!token || !looksLikeJwt(token)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
