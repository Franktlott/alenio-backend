import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth/use-session';

export default function Index() {
  const { data: session, isLoading } = useSession();
  if (isLoading) return null;
  if (session?.user) return <Redirect href="/(app)/team" />;
  return <Redirect href="/sign-in" />;
}
