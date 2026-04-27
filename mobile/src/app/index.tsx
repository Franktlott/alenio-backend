import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetch } from 'expo/fetch';
import { getAuthHeaders } from '@/lib/auth/auth-client';
import { readJsonSafe } from '@/lib/api/api';
import { useSession } from '@/lib/auth/use-session';

export default function Index() {
  const { data: session, isLoading } = useSession();
  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ["me", "index-gate"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/me`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) return null;
      const json = await readJsonSafe<{ data: { id: string } | null }>(res);
      return json?.data ?? null;
    },
    enabled: !!session?.user,
    staleTime: 30_000,
  });

  if (isLoading || (session?.user && isMeLoading)) return null;
  if (session?.user && me?.id) return <Redirect href="/(app)/team" />;
  return <Redirect href="/sign-in" />;
}
