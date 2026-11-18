
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth } from '../firebase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert(
        'Email Sent',
        'If an account exists for this email, a password reset link has been sent.',
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } catch (error: any) {
      const message =
        error.code === 'auth/invalid-email'
          ? 'Invalid email address.'
          : error.code === 'auth/network-request-failed'
            ? 'Network connection failed.'
            : 'Unable to send reset email. Please try again.';

      Alert.alert('Request Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.heading}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your registered email address. We will send you a password reset link.
        </Text>

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

        <TouchableOpacity
          style={styles.button}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')}>
          <Text style={styles.backText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F7F9FC',
    justifyContent: 'center', padding: 24,
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24 },
  icon: { fontSize: 42, textAlign: 'center', marginBottom: 18 },
  heading: { fontSize: 25, fontWeight: 'bold', color: '#172554', textAlign: 'center' },
  subtitle: { color: '#64748B', textAlign: 'center', lineHeight: 22, marginTop: 12 },
  label: { color: '#334155', fontWeight: '600', marginTop: 28, marginBottom: 8 },
  input: {
    height: 52, borderWidth: 1, borderColor: '#CBD5E1',
    borderRadius: 10, paddingHorizontal: 14, color: '#111827',
  },
  button: {
    height: 54, borderRadius: 12, backgroundColor: '#2563EB',
    justifyContent: 'center', alignItems: 'center', marginTop: 22,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  backText: { color: '#2563EB', fontWeight: '600', textAlign: 'center', marginTop: 22 },
});
