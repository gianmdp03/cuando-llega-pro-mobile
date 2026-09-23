import '@/global.css';

import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setUnauthorizedHandler } from '@/src/lib/api-client';
import { queryClient } from '@/src/lib/query-client';
import { AuthProvider, useAuth } from '@/src/providers/auth-provider';
import { ReactQueryAppState } from '@/src/providers/react-query-app-state';
import { NAV_THEME } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ ...MaterialCommunityIcons.font });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ReactQueryAppState>
            <SafeAreaProvider>
              <AuthProvider>
                <NavigationThemeProvider value={NAV_THEME.dark}>
                  <StatusBar style="light" />
                  <RouteProtection>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(app)" />
                    </Stack>
                  </RouteProtection>
                </NavigationThemeProvider>
              </AuthProvider>
            </SafeAreaProvider>
          </ReactQueryAppState>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function RouteProtection({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { isRestoring, session, signOut } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await signOut();
      router.replace('/login');
    });

    return () => setUnauthorizedHandler(undefined);
  }, [router, signOut]);

  useEffect(() => {
    if (isRestoring) {
      return;
    }

    const isPublicRoute = segments[0] === '(auth)';
    const isPrivateRoute = segments[0] === '(app)';

    if (!session && !isPublicRoute) {
      router.replace('/login');
    } else if (session && !isPrivateRoute) {
      router.replace('/lines');
    }
  }, [isRestoring, router, segments, session]);

  if (isRestoring) {
    return <SessionRestoreScreen />;
  }

  return children;
}

function SessionRestoreScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-[#121212]">
      <MaterialCommunityIcons color="#80D4FF" name="bus-clock" size={36} />
      <Text className="mt-4 text-base text-[#E1E1E6]">Restaurando sesión</Text>
    </View>
  );
}
