import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, Text, View } from 'react-native';
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
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';

export const unstable_settings = {
  initialRouteName: '(app)',
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

function CustomSplash({ onDone }: { onDone: () => void }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 500 }),
      withDelay(1800, withTiming(0, { duration: 500 }))
    );
    scale.value = withSequence(
      withTiming(1, { duration: 500 }),
      withDelay(1800, withTiming(1.08, { duration: 500 }, () => runOnJS(onDone)()))
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[animStyle, { alignItems: 'center' }]}>
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
    </View>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { data: session, isLoading } = useSession();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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

  if (showSplash || isLoading) {
    return <CustomSplash onDone={() => setShowSplash(false)} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session?.user}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="create-task" />
          <Stack.Screen name="create-event" />
          <Stack.Screen name="task-detail" />
<Stack.Screen name="team-channels" />
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
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="terms-of-service" />
      </Stack>
    </ThemeProvider>
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

