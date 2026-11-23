import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Link, useRouter } from 'expo-router';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import React, { useEffect, useState } from 'react';
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
  startGuestSession,
  syncGuestLocalDataOnRegistration,
} from '../utils/guestAuthSync';

const GOOGLE_WEB_CLIENT_ID =
  '659773105401-2pb5ef8c61qem8gqg4k5dvkh0sfeltcq.apps.googleusercontent.com';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      try {
        GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
        });
      } catch (e) {
        console.log('GoogleSignin configure warning:', e);
      }
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await syncGuestLocalDataOnRegistration({
        userId: userCred.user.uid,
        email: userCred.user.email,
        displayName: userCred.user.displayName,
      });
      router.replace('/dashboard');
    } catch (error: any) {
      const messages: Record<string, string> = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/network-request-failed': 'Network connection failed.',
      };

      Alert.alert(
        'Login Failed',
        messages[error.code] || error.message || 'Unable to login.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        const webCred = await signInWithPopup(auth, provider);
        await syncGuestLocalDataOnRegistration({
          userId: webCred.user.uid,
          email: webCred.user.email,
          displayName: webCred.user.displayName,
        });
        router.replace('/dashboard');
        return;
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();

      if ((signInResult as any)?.type === 'cancelled') {
        setLoading(false);
        return;
      }

      const idToken =
        signInResult?.data?.idToken ?? (signInResult as any)?.idToken ?? null;

      if (!idToken) {
        throw new Error(
          'Google ID Token পাওয়া যায়নি। Firebase Console-এ Web Client ID এবং Android SHA-1 ফিঙ্গারপ্রিন্ট যুক্ত আছে কি না যাচাই করুন।'
        );
      }

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const userCred = await signInWithCredential(auth, googleCredential);

      await syncGuestLocalDataOnRegistration({
        userId: userCred.user.uid,
        email: userCred.user.email,
        displayName: userCred.user.displayName,
      });

      router.replace('/dashboard');
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }

      let friendlyMsg = error?.message || 'Unable to sign in with Google.';
      if (error?.code === statusCodes.DEVELOPER_ERROR || String(error?.code) === '10') {
        friendlyMsg =
          'Google Sign-In Configuration Error (SHA-1): EAS/Android বিল্ডের SHA-1 ফিঙ্গারপ্রিন্ট Firebase Console -> Project Settings -> Android App-এ যুক্ত করুন।';
      } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        friendlyMsg = 'এই ডিভাইসে Google Play Services পাওয়া যায়নি বা আপডেট প্রয়োজন।';
      }

      Alert.alert('Google Login Failed', friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await startGuestSession();
      router.replace('/dashboard');
    } catch (error: any) {
      Alert.alert('Guest Login Failed', error?.message || 'Unable to start guest session.');
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
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>💰</Text>
        </View>

        <Text style={styles.logo}>MyBudgetApp</Text>
        <Text style={styles.tagline}>Manage your money, your way.</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
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
              placeholderTextColor="#9CA3AF"
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

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => router.push('/forgot-password')}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, loading && styles.disabledButton]}
            onPress={handleGoogleLogin}
            disabled={loading}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.guestButton, loading && styles.disabledButton]}
            onPress={handleGuestLogin}
            disabled={loading}
          >
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
            <Text style={styles.guestSubText}>
              Local storage sync • Register anytime to keep data
            </Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.normalText}>Don't have an account? </Text>
            <Link href="/register" style={styles.link}>
              Sign Up
            </Link>
          </View>
        </View>

        <Text style={styles.footer}>Secure login powered by Firebase</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoBox: {
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#E4EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoIcon: { fontSize: 34 },
  logo: { fontSize: 27, fontWeight: 'bold', color: '#172554', textAlign: 'center' },
  tagline: { color: '#64748B', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22 },
  heading: { fontSize: 25, fontWeight: 'bold', color: '#172554' },
  subtitle: { color: '#64748B', marginTop: 6, marginBottom: 25 },
  label: { color: '#334155', fontWeight: '600', marginBottom: 8, marginTop: 14 },
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
  forgotButton: { alignSelf: 'flex-end', marginTop: 15, marginBottom: 22 },
  forgotText: { color: '#2563EB', fontWeight: '600' },
  button: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: '#172554',
    fontSize: 16,
    fontWeight: '700',
  },
  guestButton: {
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    color: '#1D4ED8',
    fontSize: 15.5,
    fontWeight: '700',
  },
  guestSubText: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  normalText: { color: '#64748B' },
  link: { color: '#2563EB', fontWeight: 'bold' },
  footer: { color: '#94A3B8', textAlign: 'center', fontSize: 12, marginTop: 24 },
});