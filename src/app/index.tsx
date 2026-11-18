
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth } from '../firebase';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const checkAppState = async () => {
      try {
        const completed = await AsyncStorage.getItem('@onboarding_completed');

        if (!active) return;

        if (completed !== 'true') {
          router.replace('/onboarding');
          return;
        }

        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!active) return;
          router.replace(user ? '/dashboard' : '/login');
        });
      } catch (error) {
        console.log('App state check error:', error);
        if (active) router.replace('/onboarding');
      }
    };

    checkAppState();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
