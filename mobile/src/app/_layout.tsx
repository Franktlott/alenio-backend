import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, View } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useSession } from '@/lib/auth/use-session';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { registerForPushNotificationsAsync, playNotificationTone } from '@/lib/notifications';
import { initRevenueCat } from '@/lib/revenue-cat';
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

  useEffect(() => {
    if (!session?.user) return;
    registerForPushNotificationsAsync();
    initRevenueCat(session.user.id);
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      // Play custom notification tone + haptic
      const data = notification.request.content.data as Record<string, string>;
      const toneType = data?.conversationId ? "dm" : "msg";
      playNotificationTone(toneType);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      notificationListener.current?.remove();
      responseListener.remove();
    };
  }, [session?.user?.id]);

  return (
    <View style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session?.user}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="create-task" />
            <Stack.Screen name="create-event" />
            <Stack.Screen name="task-detail" />
            <Stack.Screen name="team-chat" />
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
          </Stack.Protected>
          <Stack.Protected guard={!session?.user}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
          </Stack.Protected>
          <Stack.Screen name="verify-otp" />
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
        <KeyboardProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <RootLayoutNav />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

