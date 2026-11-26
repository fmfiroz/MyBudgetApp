import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../firebase';
import {
  fetchAllFirebaseData,
  saveSnapshotToFirebase,
} from '../utils/firebaseSync';
import {
  getGuestSnapshot,
  isGuestModeActive,
  syncUserAccountOnLogin,
} from '../utils/guestAuthSync';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isGuestSession, setIsGuestSession] = useState(false);
  const [guestItemCount, setGuestItemCount] = useState(0);

  useEffect(() => {
    let active = true;
    const checkGuestStatus = async () => {
      try {
        const [guestActive, savedGuest] = await Promise.all([
          isGuestModeActive(),
          getGuestSnapshot(),
        ]);
        if (!active) return;
        setIsGuestSession(guestActive);
        setGuestItemCount(Object.keys(savedGuest).length);
      } catch {
        if (!active) return;
        setIsGuestSession(false);
        setGuestItemCount(0);
      }
    };
    void checkGuestStatus();
    return () => {
      active = false;
    };
  }, []);

  const confirmLegacyDataImport = (dataGroupCount: number) => {
    if (isGuestSession) {
      return Promise.resolve(true);
    }

    const message =
      `${dataGroupCount} unassigned local data group(s) were found on this device. ` +
      'Their previous account cannot be determined. Import them into this account? ' +
      'Existing cloud values will be kept when a data group conflicts.';

    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(message));
    }

    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Unassigned local data',
        message,
        [
          { text: 'Keep separate', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Import to this account', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Required', 'Please complete all fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Invalid Password',
        'Password must be at least 6 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await updateProfile(credential.user, {
        displayName: name.trim(),
      });

      const result = await syncUserAccountOnLogin({
        userId: credential.user.uid,
        email: credential.user.email,
        displayName: name.trim(),
        confirmLegacyDataImport,
        fetchCloudDataFn: async (uid) => {
          return await fetchAllFirebaseData(uid);
        },
        saveCloudDataFn: async (uid, data) => {
          await saveSnapshotToFirebase(uid, data);
        },
      });

      await AsyncStorage.removeItem('@mybudget_pending_guest_migration_v1');
      setIsGuestSession(false);

      if (result.syncedGuestCount > 0) {
        Alert.alert(
          'Account Created & Data Transferred',
          'Your Guest data has been transferred to your new registered account.',
          [{ text: 'Continue', onPress: () => router.replace('/') }]
        );
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Please choose a stronger password.',
        'auth/network-request-failed': 'Network connection failed.',
      };

      Alert.alert(
        'Registration Failed',
        messages[error.code] || error.message || 'Unable to create account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.logo}>My Budget</Text>
          <Text style={styles.heading}>Create Account</Text>
          <Text style={styles.subtitle}>
            {isGuestSession
              ? 'Register a new account now to transfer your Guest entries safely.'
              : 'Start managing your finances today. Your local data will stay synced.'}
          </Text>

          {isGuestSession && (
            <View style={styles.guestBanner}>
              <Text style={styles.guestBannerTitle}>
                Guest Mode Active — Transfer to Registered Account
              </Text>
              <Text style={styles.guestBannerText}>
                {guestItemCount > 0
                  ? `${guestItemCount} saved Guest data group(s) are ready to transfer into your new account.`
                  : 'Any entries you made as a Guest will be transferred to your new account upon registration.'}
              </Text>
            </View>
          )}

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordBox}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.showText}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.disabledButton]}
            onPress={() => void handleRegister()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {isGuestSession
                  ? 'Register & Transfer Guest Data'
                  : 'Create Account & Sync Data'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.normalText}>Already have an account? </Text>
            <Link href="/login" style={styles.link}>
              Sign In
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22 },
  logo: {
    color: '#2563EB',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  heading: { fontSize: 25, fontWeight: 'bold', color: '#172554' },
  subtitle: {
    color: '#64748B',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 20,
  },
  guestBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  guestBannerTitle: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 13.5,
    marginBottom: 3,
  },
  guestBannerText: {
    color: '#1E40AF',
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    color: '#334155',
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    color: '#111827',
  },
  passwordBox: {
    height: 52,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  passwordInput: { flex: 1, color: '#111827' },
  showText: { color: '#2563EB', fontWeight: '600', padding: 5 },
  button: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  normalText: { color: '#64748B' },
  link: { color: '#2563EB', fontWeight: 'bold' },
});