import { Toaster } from 'burnt/web';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, View } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeKeyboardProvider } from '@/lib/safe-keyboard-controller';
import { useSession } from '@/lib/auth/use-session';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { initRevenueCat } from '@/lib/revenue-cat';
import { fetchMeUser, ME_QUERY_KEY } from '@/lib/auth/me-query';
import { ensureSessionFreshOnForeground } from '@/lib/auth/auth-client';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Fix React Query's AppState focus listener for React Native
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

const queryClient = new QueryClient();

function CustomSplash({ isReady, onDone }: { isReady: boolean; onDone: () => void }) {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);
  const containerOpacity = useSharedValue(1);
  const hasStartedFadeOut = useRef(false);

  // Fade logo in on mount
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 500 });
    logoScale.value = withTiming(1, { duration: 500 });
  }, []);

  // Fade entire splash out once app is ready
  useEffect(() => {
    if (!isReady || hasStartedFadeOut.current) return;
    hasStartedFadeOut.current = true;
    containerOpacity.value = withDelay(300, withTiming(0, { duration: 400 }, () => runOnJS(onDone)()));
  }, [isReady]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, containerStyle]}>
      <Animated.View style={[logoStyle, { alignItems: 'center' }]}>
        <Image
          source={require('@/assets/alenio-logo.png')}
          style={{ width: 230, height: 230 }}
          resizeMode="contain"
        />
      </Animated.View>
      <View style={{ position: 'absolute', bottom: 48, alignItems: 'center' }}>
        <Image
          source={require('@/assets/lotttech-logo.png')}
          style={{ width: 204, height: 66 }}
          resizeMode="contain"
        />
      </View>
    </Animated.View>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { data: session, isLoading } = useSession();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [animDone, setAnimDone] = useState(false);
  const [sessionSettled, setSessionSettled] = useState(false);

  // Fetch full user profile to check admin status
  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMeUser,
    enabled: !!session?.user,
    staleTime: 5 * 60 * 1000,
  });

  const hasBackendSession = !!session?.user && !!me?.id;
  const isAdmin = me?.isAdmin === true;

  useEffect(() => {
    SplashScreen.hideAsync();
    // Mark display time done after logo has faded in + shown (500ms + 1800ms)
    const timer = setTimeout(() => setAnimDone(true), 2300);
    return () => clearTimeout(timer);
  }, []);

  // Wait for session to load, then give the navigation stack a moment to render
  // before allowing the splash to fade. This prevents a white screen on Android
  // where the Stack.Protected redirect hasn't rendered yet.
  useEffect(() => {
    if (!isLoading && !sessionSettled) {
      const t = setTimeout(() => setSessionSettled(true), 300);
      return () => clearTimeout(t);
    }
  }, [isLoading, sessionSettled]);

  // Rotate JWT when returning from background if expiry is soon (consumer-app style persistence).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ensureSessionFreshOnForeground();
    });
    return () => sub.remove();
  }, []);

  // Redirect admin users to admin section once their profile loads
  useEffect(() => {
    if (hasBackendSession && isAdmin) {
      router.replace("/(admin)");
    }
  }, [hasBackendSession, isAdmin]);

  useEffect(() => {
    if (!hasBackendSession) return;
    // Delay push registration so auth cookies are fully set before the API call
    const pushTimer = setTimeout(() => registerForPushNotificationsAsync(), 1500);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        registerForPushNotificationsAsync();
      }
    });
    initRevenueCat(session.user.id);
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const data = notification.request.content.data as Record<string, string>;
      // Refresh the relevant data so the app updates automatically in the foreground
      if (data?.conversationId) {
        queryClient.invalidateQueries({ queryKey: ["dms"] });
      } else if (data?.taskId) {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      } else if (data?.type === "video_call" || data?.type === "meeting_reminder") {
        queryClient.invalidateQueries({ queryKey: ["video"] });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
      } else if (data?.type === "join_request" || data?.type === "join_approved" || data?.type === "join_rejected") {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        queryClient.invalidateQueries({ queryKey: ["join-requests"] });
      } else if (data?.teamId) {
        // team message, poll, etc.
        queryClient.invalidateQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
      }
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data?.taskId && data?.teamId) {
        router.push({ pathname: '/task-detail', params: { taskId: data.taskId, teamId: data.teamId } });
      } else if (data?.conversationId) {
        // DM notification — go to the conversation
        router.push({ pathname: '/dm-chat', params: { conversationId: data.conversationId } });
      } else if (data?.teamId && data?.teamName !== undefined) {
        // Message notification — go to team chat
        router.push({ pathname: '/team-chat', params: { teamId: data.teamId, teamName: data.teamName, ...(data.topicId ? { topicId: data.topicId } : {}) } });
      } else if (data?.teamId) {
        // Join request or team update — go to team tab
        router.push('/(app)/team');
      }
    });

    return () => {
      clearTimeout(pushTimer);
      appStateSubscription.remove();
      notificationListener.current?.remove();
      responseListener.remove();
    };
  }, [hasBackendSession, session?.user?.id]);

  return (
    <View style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={hasBackendSession}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="create-task" />
            <Stack.Screen name="create-event" />
            <Stack.Screen name="task-detail" />
            <Stack.Screen name="team-chat" />
            <Stack.Screen name="team-channels" />
            <Stack.Screen name="dm-chat" />
            <Stack.Screen
              name="video-call"
              options={{
                headerShown: false,
                presentation: "fullScreenModal",
              }}
            />
            <Stack.Screen
              name="create-group"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.9],
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="new-dm"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.9],
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
            <Stack.Screen name="subscription" />
            <Stack.Screen
              name="settings"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.9],
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="feedback"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75],
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
          </Stack.Protected>
          <Stack.Protected guard={!hasBackendSession}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="verify-reset-code" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="verify-otp" />
          </Stack.Protected>
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="terms-of-service" />
        </Stack>
      </ThemeProvider>
      {showSplash ? <CustomSplash isReady={animDone && sessionSettled ? true : false} onDone={() => setShowSplash(false)} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeKeyboardProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <RootLayoutNav />
          <Toaster />
        </SafeKeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

