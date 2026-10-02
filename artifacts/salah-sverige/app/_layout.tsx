import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PrayerProvider } from '@/context/PrayerContext';
import { ReminderProvider } from '@/context/ReminderContext';
import { installAndroidStartupDiagnostics, reportStartupDiagnostic } from '@/lib/startupDiagnostics';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

if (Platform.OS === 'android') {
  installAndroidStartupDiagnostics();
}

SplashScreen.preventAutoHideAsync();
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  useEffect(() => {
    if (Platform.OS === 'android') {
      reportStartupDiagnostic({ stage: 'root_mounted' });
    }
  }, []);
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (fontsLoaded) reportStartupDiagnostic({ stage: 'fonts_loaded' });
      if (fontError) {
        reportStartupDiagnostic({
          stage: 'font_error',
          name: fontError.name,
          message: fontError.message,
          stack: fontError.stack,
        });
      }
    }
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
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