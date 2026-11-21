
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function WelfareScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Ionicons name="heart-outline" size={64} color="#0b5ed7" />
      <Text style={styles.title}>Welfare</Text>
      <Text style={styles.subtitle}>কল্যাণমূলক কার্যক্রম ও সহায়তার হিসাব</Text>
      <Text style={styles.badge}>Coming Soon</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/dashboard')}>
        <Text style={styles.buttonText}>Dashboard-এ ফিরে যান</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f5f7fb' },
  title: { fontSize: 26, fontWeight: 'bold', marginTop: 16, color: '#172b4d' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 8, textAlign: 'center' },
  badge: { marginTop: 20, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: '#e0ecff', color: '#0b5ed7', borderRadius: 20, fontWeight: '600' },
  button: { marginTop: 28, backgroundColor: '#0b5ed7', padding: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
