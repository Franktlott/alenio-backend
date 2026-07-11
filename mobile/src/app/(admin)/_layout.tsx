import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useMobileAuthReady } from "@/lib/auth/use-session";
import { useQuery } from "@tanstack/react-query";
import { ME_QUERY_KEY, fetchMeUser } from "@/lib/auth/me-query";

export default function AdminLayout() {
  const { data: authReady } = useMobileAuthReady();
  const { data: me, isFetched } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMeUser(),
    enabled: !!authReady?.me?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isAdmin = me?.isAdmin === true || authReady?.me?.isAdmin === true;

  useEffect(() => {
    if (!authReady?.me?.id || !isFetched) return;
    if (!isAdmin) {
      router.replace("/(app)/profile");
    }
  }, [authReady?.me?.id, isFetched, isAdmin]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="user-detail" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}
