import { Toaster } from 'burnt/web';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, View } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeKeyboardProvider } from '@/lib/safe-keyboard-controller';
import { useSession, AUTH_READY_QUERY_KEY, bootstrapMobileAuth, useMobileAuthReady } from '@/lib/auth/use-session';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { ensureSessionFreshOnForeground, agentDebugLog } from '@/lib/auth/auth-client';
import { navigateToMobileHomeWithRetry } from '@/lib/auth/auth-entry';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';

export const unstable_settings = {
  /** Run `index` first so session + `/api/me` gate to Chat or Sign-in stays consistent. */
  initialRouteName: 'index',
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data warm briefly so tab/page switches feel instant.
      staleTime: 30 * 1000,
      gcTime: 30 * 60 * 1000,
      // Avoid automatic refetch every time a screen remounts.
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

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
  const { isLoading: sessionLoading } = useSession();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [animDone, setAnimDone] = useState(false);
  const [sessionSettled, setSessionSettled] = useState(false);
  const coldStartBootstrapped = useRef(false);

  const { data: authReady } = useMobileAuthReady();

  const me = authReady?.me;
  const session = authReady?.session;
  const hasBackendSession = !!authReady?.me?.id;
  const isAdmin = me?.isAdmin === true;

  // Cold start: populate auth-ready once (sign-in/logout write directly via setQueryData).
  useEffect(() => {
    if (coldStartBootstrapped.current) return;
    coldStartBootstrapped.current = true;
    if (queryClient.getQueryState(AUTH_READY_QUERY_KEY)?.dataUpdatedAt) return;
    let active = true;
    void bootstrapMobileAuth().then((data) => {
      if (!active) return;
      queryClient.setQueryData(AUTH_READY_QUERY_KEY, data, { updatedAt: Date.now() });
      agentDebugLog("cold start bootstrap", {
        runId: "auth-simplify-v4",
        hypothesisId: "H15",
        hasUser: !!data?.me?.id,
      });
    });
    return () => {
      active = false;
    };
  }, []);

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
    if (!sessionLoading && !sessionSettled) {
      const t = setTimeout(() => setSessionSettled(true), 300);
      return () => clearTimeout(t);
    }
  }, [sessionLoading, sessionSettled]);

  // Rotate JWT when returning from background if expiry is soon (consumer-app style persistence).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ensureSessionFreshOnForeground();
    });
    return () => sub.remove();
  }, []);

  // Enter the app once atomic auth-ready is set (cold start, sign-in, or account switch).
  useEffect(() => {
    const userId = authReady?.me?.id ?? null;
    if (!hasBackendSession || !userId) return;
    agentDebugLog("layout navigating on session ready", {
      runId: "auth-simplify-v4",
      hypothesisId: "H4",
      isAdmin,
      userIdPrefix: userId.slice(0, 8),
    });
    return navigateToMobileHomeWithRetry(isAdmin);
  }, [hasBackendSession, isAdmin, authReady?.me?.id]);

  useEffect(() => {
    if (!hasBackendSession) return;
    // Delay push registration so auth cookies are fully set before the API call
    const pushTimer = setTimeout(() => registerForPushNotificationsAsync(), 1500);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        registerForPushNotificationsAsync();
      }
    });
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
        queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
      } else if (data?.type === "go_login_request") {
        queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] });
        queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
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
          <Stack.Screen name="index" />
          <Stack.Protected guard={hasBackendSession}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen
              name="onboarding"
              options={{
                presentation: "transparentModal",
                animation: "fade",
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="create-task"
              options={{
                presentation: "transparentModal",
                animation: "slide_from_bottom",
                headerShown: false,
              }}
            />
            <Stack.Screen name="create-event" />
            <Stack.Screen name="task-detail" />
            <Stack.Screen name="member-profile" />
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
            <Stack.Screen name="account-hub" />
            <Stack.Screen name="billing" />
            <Stack.Screen name="subscription" />
            <Stack.Screen
              name="switch-workspace"
              options={{
                presentation: "fullScreenModal",
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="feedback"
              options={{
                presentation: "transparentModal",
                animation: "fade",
                headerShown: false,
              }}
            />
            <Stack.Screen name="notifications" />
          </Stack.Protected>
          <Stack.Protected guard={!hasBackendSession}>
            <Stack.Screen name="welcome" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="verify-reset-code" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="verify-otp" />
          </Stack.Protected>
          <Stack.Screen name="invite/[token]" />
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

