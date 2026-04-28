import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/auth/use-session';
import { fetchMeUser, ME_QUERY_KEY } from '@/lib/auth/me-query';

/** Gate: session + `/api/me` must succeed before entering `(app)` (matches root `Stack.Protected`). */
export default function Index() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: me, isPending: mePending, isFetching: meFetching } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMeUser,
    enabled: !!session?.user,
    staleTime: 5 * 60 * 1000,
  });

  const waitingForSession = sessionLoading;
  /** Until `/api/me` returns a user id, root guard stays false — keep spinner (RQ v5-safe). */
  const waitingForProfile = !!session?.user && !me?.id && (mePending || meFetching);

  if (waitingForSession || waitingForProfile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  if (session?.user && me?.id) return <Redirect href="/(app)/team" />;
  return <Redirect href="/sign-in" />;
}
