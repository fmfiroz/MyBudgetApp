import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import ForceUpdateModal from '../components/ForceUpdateModal';
import { auth } from '../firebase';
import { startFirebaseSync, stopFirebaseSync } from '../utils/firebaseSync';

const LOCAL_DATA_OWNER_KEY = '@mybudget_local_data_owner_v1';
const AUTH_SESSION_KEY = '@mybudget_auth_session_v1';
export const ONBOARDING_COMPLETED_KEY = '@mybudget_onboarding_completed_v1';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  const lastRedirectRef = useRef<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasGuestSession, setHasGuestSession] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const refreshFlags = useCallback(async (isActive?: () => boolean) => {
    try {
      const [done, rawSession] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
        AsyncStorage.getItem(AUTH_SESSION_KEY),
      ]);
      if (isActive && !isActive()) return;

      let guestActive = false;
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession) as { mode?: string };
          guestActive = parsed?.mode === 'guest';
        } catch {
          guestActive = false;
        }
      }

      setHasCompletedOnboarding(done === 'true');
      setHasGuestSession(guestActive);
      setOnboardingChecked(true);
    } catch {
      if (isActive && !isActive()) return;
      setHasCompletedOnboarding(false);
      setHasGuestSession(false);
      setOnboardingChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshFlags(() => active);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setCurrentUser(user);
      setAuthInitialized(true);

      if (!user) {
        stopFirebaseSync();
        return;
      }

      try {
        const owner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
        if (
          active &&
          owner === user.uid &&
          auth.currentUser?.uid === user.uid
        ) {
          void startFirebaseSync(user.uid);
        } else {
          stopFirebaseSync();
        }
      } catch {
        if (active) {
          stopFirebaseSync();
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
      stopFirebaseSync();
    };
  }, [refreshFlags]);

  useEffect(() => {
    let active = true;
    void refreshFlags(() => active);
    return () => {
      active = false;
    };
  }, [segments, refreshFlags]);

  useEffect(() => {
    if (!layoutReady || !authInitialized || !onboardingChecked) return;

    const currentRoute: string = segments[0] ?? '';
    const isAuthScreen =
      currentRoute === 'login' ||
      currentRoute === 'register' ||
      currentRoute === 'forgot-password';
    const isOnboardingScreen = currentRoute === 'onboarding';
    const hasActiveSession = Boolean(currentUser) || hasGuestSession;

    let targetRoute: string | null = null;

    if (currentUser) {
      if (isOnboardingScreen || isAuthScreen) {
        targetRoute = '/';
      }
    } else if (!hasCompletedOnboarding) {
      if (!isOnboardingScreen && !isAuthScreen && !hasGuestSession) {
        targetRoute = '/onboarding';
      }
    } else if (isOnboardingScreen || (currentRoute === '' && !hasActiveSession)) {
      targetRoute = '/login';
    }

    const targetSegment = targetRoute ? targetRoute.replace(/^\//, '') : null;

    if (targetRoute && currentRoute !== targetSegment) {
      const redirectKey = `${currentRoute}->${targetRoute}`;
      if (lastRedirectRef.current !== redirectKey) {
        lastRedirectRef.current = redirectKey;
        router.replace(targetRoute as never);
      }
    } else {
      lastRedirectRef.current = null;
    }

    void SplashScreen.hideAsync();
  }, [
    layoutReady,
    authInitialized,
    onboardingChecked,
    currentUser,
    hasGuestSession,
    hasCompletedOnboarding,
    segments,
    router,
  ]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={styles.container} onLayout={() => setLayoutReady(true)}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="explore" />
          <Stack.Screen name="budget" />
          <Stack.Screen name="shop-debt" />
          <Stack.Screen name="social-religious" />
          <Stack.Screen name="welfare" />
          <Stack.Screen name="savings" />
          <Stack.Screen name="income" />
          <Stack.Screen name="vehicle-expense" />
          <Stack.Screen name="reports" />
          <Stack.Screen name="settings" />
        </Stack>

        {/* Force Update চেকার */}
        <ForceUpdateModal />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});