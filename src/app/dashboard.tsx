import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../firebase';

export default function HomeScreen() {
  const router = useRouter();
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadDashboardData = async () => {
    try {
      const existingData = await AsyncStorage.getItem('@local_expense_db');
      if (existingData) {
        const expenses = JSON.parse(existingData);
        const sum = expenses.reduce(
          (acc: number, item: any) => acc + (Number(item.amount) || 0), 0
        );
        setTotalExpense(sum);
      } else {
        setTotalExpense(0);
      }
    } catch (error) {
      console.log('Error loading dashboard data', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'আপনি কি অ্যাকাউন্ট থেকে Logout করতে চান?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOut(true);
              await signOut(auth);
              router.replace('/login');
            } catch (error: any) {
              Alert.alert('Logout Failed', error.message || 'Unable to logout.');
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const currentBalance = totalIncome - totalExpense;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>আমার বাজেট অ্যাপ</Text>
          <Text style={styles.headerSubtitle}>নভেম্বর ২০২৬ (অটো-রিফ্রেশ লোকাল-ফার্স্ট)</Text>
          <Text style={styles.userEmail}>{auth.currentUser?.email || ''}</Text>
          <TouchableOpacity
  style={styles.logoutButton}
  onPress={() => {
    console.log('Logout button pressed');
    handleLogout();
  }}
  disabled={false}
>
            <Text style={styles.logoutText}>
              {loggingOut ? 'Logging out...' : 'Logout'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardRow}>
          <View style={[styles.card, styles.incomeCard]}>
            <Text style={styles.cardTitle}>মোট আয়</Text>
            <Text style={styles.cardAmount}>৳ {totalIncome.toLocaleString()}</Text>
          </View>
          <View style={[styles.card, styles.expenseCard]}>
            <Text style={styles.cardTitle}>মোট খরচ</Text>
            <Text style={styles.cardAmount}>৳ {totalExpense.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceTitle}>বর্তমান স্থিতি (Balance)</Text>
          <Text style={styles.balanceAmount}>৳ {currentBalance.toLocaleString()}</Text>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>হিসাবের মডিউলসমূহ</Text>
          <View style={styles.moduleBox}>
            <TouchableOpacity onPress={() => router.push('/expense' as never)}>
              <Text style={styles.moduleText}>📌 দৈনিক বাজার ও খরচ (Market Expense)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/annual-budget' as never)}>
              <Text style={styles.moduleText}>📌 ১২ মাসের বাজেট ও ট্র্যাকিং (Annual Budget)</Text>
            </TouchableOpacity>
            <Text style={styles.moduleText}>📌 ধার ও বাকি খাতা (Dhar Ledger)</Text>
            <Text style={styles.moduleText}>📌 কল্যাণ তহবিল (Welfare Fund)</Text>
            <Text style={styles.moduleText}>📌 স্থায়ী খরচ ও ডিপিএস (Fixed Savings)</Text>
            <Text style={styles.moduleText}>📌 বাইকের ফুয়েল ট্র্যাকিং (Vehicle Log)</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  scrollContainer: { padding: 20 },
  header: { marginBottom: 20, alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#2f3640' },
  headerSubtitle: { fontSize: 14, color: '#718093', marginTop: 4 },
  userEmail: { fontSize: 13, color: '#718093', marginTop: 8 },
  logoutButton: {
    marginTop: 12, backgroundColor: '#fee2e2',
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 8,
  },
  logoutText: { color: '#dc2626', fontWeight: 'bold' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  card: { flex: 1, padding: 20, borderRadius: 12, marginHorizontal: 5, elevation: 3 },
  incomeCard: { backgroundColor: '#4cd137' },
  expenseCard: { backgroundColor: '#e84118' },
  cardTitle: { color: '#fff', fontSize: 14, marginBottom: 8 },
  cardAmount: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  balanceCard: {
    backgroundColor: '#00a8ff', padding: 20, borderRadius: 12,
    alignItems: 'center', marginBottom: 20, elevation: 3,
  },
  balanceTitle: { color: '#fff', fontSize: 16, marginBottom: 8 },
  balanceAmount: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  sectionContainer: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2f3640', marginBottom: 10 },
  moduleBox: { backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 2 },
  moduleText: {
    fontSize: 16, color: '#353b48', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f2f6',
  },
});