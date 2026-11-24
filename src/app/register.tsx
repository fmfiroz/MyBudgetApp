
import { Link, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useState } from 'react';
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
import { syncUserAccountOnLogin } from '../utils/guestAuthSync';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const confirmLegacyDataImport = (dataGroupCount: number) => {
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
      // Create new Firebase account
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // Save user's display name
      await updateProfile(credential.user, {
        displayName: name.trim(),
      });

      // Sync Guest/Local data with the new registered account
      await syncUserAccountOnLogin({
        userId: credential.user.uid,
        email: credential.user.email,
        displayName: name.trim(),
        confirmLegacyDataImport,

        // Fetch existing cloud data
        fetchCloudDataFn: async (uid) => {
          return await fetchAllFirebaseData(uid);
        },

        // Upload Guest data when cloud is empty
        saveCloudDataFn: async (uid, data) => {
          await saveSnapshotToFirebase(uid, data);
        },
      });

      router.replace('/dashboard');
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
            Start managing your finances today. Your local data will stay synced.
          </Text>

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
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Create Account & Sync Data</Text>
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
    marginBottom: 25,
  },
  heading: { fontSize: 25, fontWeight: 'bold', color: '#172554' },
  subtitle: {
    color: '#64748B',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
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
