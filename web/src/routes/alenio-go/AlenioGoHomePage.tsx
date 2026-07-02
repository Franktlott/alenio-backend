import { AlenioGoBackendDashboard } from "../../components/alenio-go/AlenioGoBackendDashboard";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoHomePage() {
  const ctx = useAlenioGoShell();
  if (!ctx) return null;
  return <AlenioGoBackendDashboard {...ctx} />;
}
