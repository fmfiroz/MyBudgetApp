import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import ForceUpdateModal from '../components/ForceUpdateModal';
import { auth } from '../firebase';
import { startFirebaseSync, stopFirebaseSync } from '../utils/firebaseSync';

const LOCAL_DATA_OWNER_KEY = '@mybudget_local_data_owner_v1';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        stopFirebaseSync();
        return;
      }

      void AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY).then((owner) => {
        if (owner === user.uid && auth.currentUser?.uid === user.uid) {
          void startFirebaseSync(user.uid);
        }
      });
    });
    return () => {
      unsubscribe();
      stopFirebaseSync();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View
        style={styles.container}
        onLayout={() => {
          SplashScreen.hideAsync();
        }}
      >
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="explore" options={{ headerShown: false }} />
          <Stack.Screen name="budget" options={{ headerShown: false }} />
          <Stack.Screen name="shop-debt" options={{ headerShown: false }} />
          <Stack.Screen name="social-religious" options={{ headerShown: false }} />
          <Stack.Screen name="welfare" options={{ headerShown: false }} />
          <Stack.Screen name="savings" options={{ headerShown: false }} />
          <Stack.Screen name="income" options={{ headerShown: false }} />
          <Stack.Screen name="vehicle-expense" options={{ headerShown: false }} />
          <Stack.Screen name="reports" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
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