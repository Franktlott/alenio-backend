import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KioskShell } from "./src/components/KioskShell";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <KioskShell />
    </SafeAreaProvider>
  );
}
