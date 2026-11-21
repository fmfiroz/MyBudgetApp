
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../firebase';

const menuItems = [
  { title: 'Budget', icon: '📊', route: '/budget', color: '#2563eb' },
  { title: 'Shop Debt', icon: '📒', route: '/shop-debt', color: '#0891b2' },
  { title: 'Social & Religious Activity', icon: '🤝', route: '/social-religious', color: '#7c3aed' },
  { title: 'Welfare', icon: '❤️', route: '/welfare', color: '#db2777' },
  { title: 'Savings', icon: '🏦', route: '/savings', color: '#059669' },
  { title: 'Income', icon: '💰', route: '/income', color: '#16a34a' },
  { title: 'Bike Expense', icon: '🏍️', route: '/bike-expense', color: '#ea580c' },
  { title: 'Reports', icon: '📈', route: '/reports', color: '#4f46e5' },
  { title: 'Settings', icon: '⚙️', route: '/settings', color: '#64748b' },
];

export default function HomeScreen() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
      router.replace('/login');
    } catch (error: any) {
      const message = error.message || 'Unable to logout.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Logout Failed', message);
      }
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (loggingOut) return;

    if (Platform.OS === 'web') {
      if (window.confirm('আপনি কি অ্যাকাউন্ট থেকে Logout করতে চান?')) {
        performLogout();
      }
    } else {
      Alert.alert(
        'Logout',
        'আপনি কি অ্যাকাউন্ট থেকে Logout করতে চান?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>আমার বাজেট অ্যাপ</Text>
          <Text style={styles.headerSubtitle}>
            Personal Finance Management
          </Text>
          <Text style={styles.userEmail}>
            {auth.currentUser?.email || ''}
          </Text>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            <Text style={styles.logoutText}>
              {loggingOut ? 'Logging out...' : 'Logout'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>হিসাবের মডিউলসমূহ</Text>

          <View style={styles.menuGrid}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={styles.menuCard}
                activeOpacity={0.75}
                onPress={() => router.push(item.route as never)}
              >
                <View style={[
                  styles.iconContainer,
                  { backgroundColor: item.color + '18' }
                ]}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                </View>

                <Text style={styles.menuTitle}>
                  {item.title}
                </Text>

                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  scrollContainer: {
    padding: 18,
    paddingBottom: 30,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#718093',
    marginTop: 5,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 9,
  },
  logoutButton: {
    marginTop: 14,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 24,
    paddingVertical: 9,
    borderRadius: 8,
  },
  logoutText: {
    color: '#dc2626',
    fontWeight: 'bold',
  },
  sectionContainer: {
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 14,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuCard: {
    width: '48%',
    minHeight: 135,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    justifyContent: 'center',
    elevation: 2,
    position: 'relative',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  menuIcon: {
    fontSize: 27,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    paddingRight: 5,
  },
  menuArrow: {
    position: 'absolute',
    right: 12,
    top: 12,
    fontSize: 23,
    color: '#94a3b8',
  },
});
