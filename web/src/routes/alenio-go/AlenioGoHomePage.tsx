import { AlenioGoBackendDashboard } from "../../components/alenio-go/AlenioGoBackendDashboard";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoHomePage() {
  const ctx = useAlenioGoShell();
  return <AlenioGoBackendDashboard {...ctx} />;
}
