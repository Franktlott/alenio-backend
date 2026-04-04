import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useSession } from '@/lib/auth/use-session';

export const unstable_settings = {
  initialRouteName: '(app)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Fix React Query's AppState focus listener for React Native
// The default implementation uses the old addListener API which is no longer a function
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { data: session, isLoading } = useSession();

  if (isLoading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session?.user}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen
            name="create-task"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.9],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen name="task-detail" />
          <Stack.Screen
            name="select-team"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.6],
              sheetGrabberVisible: true,
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!session?.user}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="verify-otp" />
        </Stack.Protected>
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

