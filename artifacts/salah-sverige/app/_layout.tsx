import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PrayerProvider } from '@/context/PrayerContext';
import { ReminderProvider } from '@/context/ReminderContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
const queryClient = new QueryClient();
const FONT_LOAD_TIMEOUT_MS = 10_000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setFontLoadTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (fontsLoaded || fontError || fontLoadTimedOut) {
      if (fontLoadTimedOut && !fontsLoaded && !fontError) {
        console.warn('Font loading timed out; continuing with platform fallback fonts.');
      }
      void SplashScreen.hideAsync().catch((error) => {
        console.warn('Could not hide the splash screen:', error);
      });
    }
  }, [fontsLoaded, fontError, fontLoadTimedOut]);
  if (!fontsLoaded && !fontError && !fontLoadTimedOut) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <PrayerProvider>
            <ReminderProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </GestureHandlerRootView>
            </ReminderProvider>
          </PrayerProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}