import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  const router = useRouter();
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0); // ভবিষ্যতে আয়ের হিসাবের জন্য

  // লোকাল স্টোরেজ থেকে মোট খরচ হিসাব করে নিয়ে আসার ফাংশন
  const loadDashboardData = async () => {
    try {
      const existingData = await AsyncStorage.getItem('@local_expense_db');
      if (existingData) {
        const expenses = JSON.parse(existingData);
        // সব খরচের পরিমাণ যোগ করা
        const sum = expenses.reduce((acc: number, item: any) => acc + (Number(item.amount) || 0), 0);
        setTotalExpense(sum);
      } else {
        setTotalExpense(0);
      }
    } catch (error) {
      console.log('Error loading dashboard data', error);
    }
  };

  // useFocusEffect ব্যবহার করার ফলে ড্যাশবোর্ডে ফোকাস আসার সাথে সাথেই অটোমেটিক ডাটা রিফ্রেশ হবে
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  // বর্তমান স্থিতি বা ব্যালেন্স হিসাব (আয় - খরচ)
  const currentBalance = totalIncome - totalExpense;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>আমার বাজেট অ্যাপ</Text>
          <Text style={styles.headerSubtitle}>নভেম্বর ২০২৬ (অটো-রিফ্রেশ লোকাল-ফার্স্ট)</Text>
        </View>

        {/* Summary Cards */}
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

        {/* Modules Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>হিসাবের মডিউলসমূহ</Text>
          <View style={styles.moduleBox}>
            {/* দৈনিক বাজার ও খরচ পেজে যাওয়ার লিংক */}
            <TouchableOpacity onPress={() => router.push('/expense')}>
              <Text style={styles.moduleText}>📌 দৈনিক বাজার ও খরচ (Market Expense)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/annual-budget')}>
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
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  scrollContainer: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2f3640',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#718093',
    marginTop: 4,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  card: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
    marginHorizontal: 5,
    elevation: 3,
  },
  incomeCard: {
    backgroundColor: '#4cd137',
  },
  expenseCard: {
    backgroundColor: '#e84118',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  cardAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  balanceCard: {
    backgroundColor: '#00a8ff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 3,
  },
  balanceTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  sectionContainer: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2f3640',
    marginBottom: 10,
  },
  moduleBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    elevation: 2,
  },
  moduleText: {
    fontSize: 16,
    color: '#353b48',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
});