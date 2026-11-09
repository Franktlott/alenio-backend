import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useMobileAuthReady } from "@/lib/auth/use-session";
import { useQuery } from "@tanstack/react-query";
import { ME_QUERY_KEY, fetchMeUser } from "@/lib/auth/me-query";
import { useScreenOrientation } from "@/lib/use-screen-orientation";

export default function AdminLayout() {
  const screenOrientation = useScreenOrientation();
  const { data: authReady } = useMobileAuthReady();
  const { isFetched } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMeUser(),
    enabled: !!authReady?.me?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!authReady?.me?.id || !isFetched) return;
    // Platform admin will be its own account and its own app. Member logins stay here.
    router.replace("/(app)/profile");
  }, [authReady?.me?.id, isFetched]);

  return (
    <Stack screenOptions={{ headerShown: false, orientation: screenOrientation }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="user-detail" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}
