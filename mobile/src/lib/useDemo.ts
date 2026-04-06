import { useSession } from "@/lib/auth/use-session";
import { Alert } from "react-native";

const DEMO_EMAIL = "demo@alenio.app";

export function useDemoMode(): boolean {
  const { data: session } = useSession();
  return session?.user?.email === DEMO_EMAIL;
}

export function showDemoAlert() {
  Alert.alert(
    "Demo Account",
    "This is a read-only demo account. Sign up to make changes.",
    [{ text: "OK" }]
  );
}
