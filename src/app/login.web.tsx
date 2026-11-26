import { Link, useRouter } from 'expo-router';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  startGuestSession,
  syncUserAccountOnLogin,
} from '../utils/guestAuthSync';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const showMessage = (title: string, message: string) => {
    window.alert(`${title}\n\n${message}`);
  };

  const confirmLegacyDataImport = async (dataGroupCount: number) =>
    window.confirm(
      `${dataGroupCount} unassigned local data group(s) were found on this device. ` +
        'Their previous account cannot be determined. Import them into this account? ' +
        'Existing cloud values will be kept when a data group conflicts.'
    );

  const finalizeRegisteredLogin = async (user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  }) => {
    await syncUserAccountOnLogin({
      userId: user.uid,
      email: user.email,
      displayName: user.displayName,
      confirmLegacyDataImport,
      fetchCloudDataFn: async (uid) => {
        return await fetchAllFirebaseData(uid);
      },
      saveCloudDataFn: async (uid, data) => {
        await saveSnapshotToFirebase(uid, data);
      },
    });
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showMessage('Required', 'Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      await finalizeRegisteredLogin({
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
      });
      router.replace('/');
    } catch (error: any) {
      const messages: Record<string, string> = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/network-request-failed': 'Network connection failed.',
      };

      showMessage(
        'Login Failed',
        messages[error?.code] || error?.message || 'Unable to login.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const credential = await signInWithPopup(auth, provider);
      await finalizeRegisteredLogin({
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
      });
      router.replace('/');
    } catch (error: any) {
      showMessage(
        'Google Login Failed',
        error?.message || 'Unable to sign in with Google.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);

    try {
      await startGuestSession(confirmLegacyDataImport);
      router.replace('/');
    } catch (error: any) {
      showMessage(
        'Guest Login Failed',
        error?.message || 'Unable to start guest session.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>💰</Text>
        </View>

        <Text style={styles.logo}>My Budget</Text>
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
            onPress={() => void handleLogin()}
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
            onPress={() => void handleGoogleLogin()}
            disabled={loading}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.guestButton, loading && styles.disabledButton]}
            onPress={() => void handleGuestLogin()}
            disabled={loading}
          >
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
            <Text style={styles.guestSubText}>
              Local storage sync • Register anytime to keep data
            </Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.normalText}>Don&apos;t have an account? </Text>
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
  logo: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#172554',
    textAlign: 'center',
  },
  tagline: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
  },
  heading: { fontSize: 25, fontWeight: 'bold', color: '#172554' },
  subtitle: { color: '#64748B', marginTop: 6, marginBottom: 25 },
  label: {
    color: '#334155',
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 14,
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: 15,
    marginBottom: 22,
  },
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  normalText: { color: '#64748B' },
  link: { color: '#2563EB', fontWeight: 'bold' },
  footer: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
  },
});