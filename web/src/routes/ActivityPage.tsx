import { Navigate } from "react-router-dom";

/** Activity lives on the Chat page (right rail). */
export function ActivityPage() {
  return <Navigate to="/chat" replace />;
}
