import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// শুধু মাসের নামসমূহ (বাটনগুলোর জন্য)
const MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল',
  'মে', 'জুন', 'জুলাই', 'আগস্ট',
  'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

export default function AnnualBudgetScreen() {
  const router = useRouter();
  
  // ডিফল্টভাবে বর্তমান মাস 'নভেম্বর' সিলেক্ট করা থাকবে
  const [selectedMonth, setSelectedMonth] = useState('নভেম্বর');
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  
  // ইনপুট স্টেটসমূহ
  const [titleInput, setTitleInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [type, setType] = useState<'permanent' | 'temporary'>('permanent');
  
  // নির্দিষ্ট মেয়াদের জন্য স্টেট
  const [tenure, setTenure] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // নির্দিষ্ট মাসের বাজেট ডেটা লোড করা
  const loadMonthBudget = async (month: string) => {
    try {
      const monthData = await AsyncStorage.getItem(`@annual_budget_${month}`);
      
      if (!monthData) {
        const defaultItems = [
          { id: '1', title: 'বাসা ভাড়া', amount: 5000, completed: false, type: 'permanent', startDate: '', endDate: '', tenure: '' },
          { id: '2', title: 'বাজার খরচ', amount: 3000, completed: false, type: 'permanent', startDate: '', endDate: '', tenure: '' },
          { id: '3', title: 'ডিপিএস / সঞ্চয়', amount: 2000, completed: false, type: 'permanent', startDate: '', endDate: '', tenure: '' },
        ];
        setBudgetItems(defaultItems);
        await AsyncStorage.setItem(`@annual_budget_${month}`, JSON.stringify(defaultItems));
      } else {
        setBudgetItems(JSON.parse(monthData));
      }
    } catch (error) {
      console.log('Error loading budget', error);
    }
  };

  useEffect(() => {
    loadMonthBudget(selectedMonth);
  }, [selectedMonth]);

  // নতুন বাজেট আইটেম যোগ করা
  const addItem = async () => {
    if (!titleInput || !amountInput) {
      Alert.alert('ভুল হয়েছে', 'খাতের নাম এবং টাকার পরিমাণ লিখুন!');
      return;
    }

    if (type === 'temporary' && (!startDate || !endDate || !tenure)) {
      Alert.alert('ভুল হয়েছে', 'মেয়াদের জন্য Tenure, Start Date এবং End Date পূরণ করুন!');
      return;
    }

    const newItem = {
      id: Date.now().toString() + Math.random(),
      title: titleInput,
      amount: parseFloat(amountInput),
      completed: false,
      type: type,
      startDate: type === 'temporary' ? startDate : '',
      endDate: type === 'temporary' ? endDate : '',
      tenure: type === 'temporary' ? tenure : '',
    };

    const updatedItems = [newItem, ...budgetItems]; // নতুন আইটেম উপরে যুক্ত হবে
    setBudgetItems(updatedItems);
    
    // ফর্ম রিসেট
    setTitleInput('');
    setAmountInput('');
    setTenure('');
    setStartDate('');
    setEndDate('');

    // লোকাল স্টোরেজে সেভ করা
    await AsyncStorage.setItem(`@annual_budget_${selectedMonth}`, JSON.stringify(updatedItems));
    Alert.alert('সফল হয়েছে', 'নতুন বাজেট খাত সফলভাবে যুক্ত হয়েছে!');
  };

  // চেক বা মার্ক করার ফাংশন (কনফার্মেশন সহ)
  const toggleComplete = (id: string, currentStatus: boolean) => {
    const actionText = currentStatus ? 'অসম্পূর্ণ (Uncheck)' : 'সম্পূর্ণ (Complete)';
    
    Alert.alert(
      'স্ট্যাটাস পরিবর্তন',
      `আপনি কি এই খাতটি ${actionText} হিসেবে মার্ক করতে চান?`,
      [
        { text: 'না', style: 'cancel' },
        {
          text: 'হ্যাঁ',
          onPress: async () => {
            const updatedItems = budgetItems.map((item) => {
              if (item.id === id) {
                return { ...item, completed: !item.completed };
              }
              return item;
            });

            setBudgetItems(updatedItems);
            await AsyncStorage.setItem(`@annual_budget_${selectedMonth}`, JSON.stringify(updatedItems));
          },
        },
      ]
    );
  };

  // আইটেম ডিলিট করার ফাংশন (কনফার্মেশন সহ)
  const deleteItem = (id: string, title: string) => {
    Alert.alert(
      'ডিলিট নিশ্চিত করুন',
      `"${title}" বাজেট খাতটি কি স্থায়ীভাবে ডিলিট করতে চান?`,
      [
        { text: 'না', style: 'cancel' },
        {
          text: 'হ্যাঁ, ডিলিট',
          style: 'destructive',
          onPress: async () => {
            const updatedItems = budgetItems.filter((item) => item.id !== id);
            setBudgetItems(updatedItems);
            await AsyncStorage.setItem(`@annual_budget_${selectedMonth}`, JSON.stringify(updatedItems));
          },
        },
      ]
    );
  };

  // মোট বাজেট হিসাব
  const totalBudgetAmount = budgetItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header with Year */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← পেছনের ড্যাশবোর্ড</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>১২ মাসের বাজেট ট্র্যাকিং (২০২৬)</Text>
        </View>

        {/* Month Selector Carousel (Only Month Names) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {MONTHS.map((month) => (
            <TouchableOpacity
              key={month}
              style={[styles.monthBtn, selectedMonth === month && styles.activeMonthBtn]}
              onPress={() => setSelectedMonth(month)}
            >
              <Text style={[styles.monthText, selectedMonth === month && styles.activeMonthText]}>
                {month}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{selectedMonth} ২০২৬ - এর বাজেট পরিকল্পনা</Text>
          <Text style={styles.summaryAmount}>মোট বাজেট: ৳ {totalBudgetAmount.toLocaleString()}</Text>
        </View>

        {/* Add Budget Item Form */}
        <View style={styles.formCard}>
          <Text style={styles.label}>নতুন বাজেট খাত যোগ করুন</Text>
          <TextInput
            style={styles.input}
            placeholder="খাতের নাম (যেমন: বিদ্যুৎ বিল)"
            placeholderTextColor="#a4b0be"
            value={titleInput}
            onChangeText={setTitleInput}
          />
          <TextInput
            style={styles.input}
            placeholder="টাকার পরিমাণ"
            placeholderTextColor="#a4b0be"
            keyboardType="numeric"
            value={amountInput}
            onChangeText={setAmountInput}
          />

          {/* Type Selector (Permanent vs Temporary) */}
          <Text style={styles.label}>খাতের ধরন নির্বাচন করুন</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'permanent' && styles.activeTypeBtn]}
              onPress={() => setType('permanent')}
            >
              <Text style={[styles.typeText, type === 'permanent' && styles.activeTypeText]}>স্থায়ী (Permanent)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'temporary' && styles.activeTypeBtn]}
              onPress={() => setType('temporary')}
            >
              <Text style={[styles.typeText, type === 'temporary' && styles.activeTypeText]}>নির্দিষ্ট মেয়াদী</Text>
            </TouchableOpacity>
          </View>

          {/* যদি 'নির্দিষ্ট মেয়াদী' সিলেক্ট করা হয় */}
          {type === 'temporary' && (
            <View style={styles.durationContainer}>
              <Text style={styles.subLabel}>মেয়াদের সময়সীমা ও তারিখ নির্বাচন</Text>
              
              <TextInput
                style={styles.input}
                placeholder="সময়কাল বা Tenure (যেমন: ৩ মাস বা ১ বছর)"
                placeholderTextColor="#a4b0be"
                value={tenure}
                onChangeText={setTenure}
              />

              <Text style={styles.dateLabel}>শুরুর তারিখ (Start Date):</Text>
              {/* @ts-ignore */}
              <TextInput
                style={styles.input}
                type="date"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#a4b0be"
                value={startDate}
                onChangeText={setStartDate}
              />

              <Text style={styles.dateLabel}>শেষের তারিখ (End Date):</Text>
              {/* @ts-ignore */}
              <TextInput
                style={styles.input}
                type="date"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#a4b0be"
                value={endDate}
                onChangeText={setEndDate}
              />
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>+ এই মাসে বাজেট যুক্ত করুন</Text>
          </TouchableOpacity>
        </View>

        {/* Budget Items Checklist */}
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>মাসের খরচ ও পূরণযোগ্য খাতসমূহ</Text>
          {budgetItems.length === 0 ? (
            <Text style={styles.noDataText}>কোনো বাজেট এন্ট্রি নেই।</Text>
          ) : (
            budgetItems.map((item) => (
              <View key={item.id} style={[styles.itemCard, item.completed && styles.completedCard]}>
                <TouchableOpacity style={styles.itemLeft} onPress={() => toggleComplete(item.id, item.completed)}>
                  <View style={[styles.checkbox, item.completed && styles.checkedBox]}>
                    {item.completed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.itemTitle, item.completed && styles.completedText]}>{item.title}</Text>
                      <Text style={styles.badgeText}>
                        {item.type === 'permanent' ? '(স্থায়ী)' : `(${item.tenure} | ${item.startDate} থেকে ${item.endDate})`}
                      </Text>
                    </View>
                    <Text style={styles.itemAmount}>৳ {item.amount}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteItem(item.id, item.title)}>
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  scrollContainer: { padding: 20 },
  header: { marginBottom: 15 },
  backButton: { color: '#00a8ff', fontSize: 16, marginBottom: 10, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#2f3640' },
  monthScroll: { marginBottom: 15 },
  monthBtn: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: '#dfe4ea', borderRadius: 20, marginRight: 8 },
  activeMonthBtn: { backgroundColor: '#00a8ff' },
  monthText: { color: '#2f3640', fontWeight: '600', fontSize: 14 },
  activeMonthText: { color: '#fff' },
  summaryCard: { backgroundColor: '#2f3640', padding: 15, borderRadius: 12, marginBottom: 15 },
  summaryTitle: { color: '#fff', fontSize: 16, marginBottom: 5 },
  summaryAmount: { color: '#4cd137', fontSize: 20, fontWeight: 'bold' },
  formCard: { backgroundColor: '#fff', padding: 15, elevation: 2, marginBottom: 20, borderRadius: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#353b48', marginBottom: 8, marginTop: 4 },
  subLabel: { fontSize: 13, fontWeight: '600', color: '#00a8ff', marginBottom: 6 },
  dateLabel: { fontSize: 12, fontWeight: '600', color: '#718093', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#dcdde1', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 10, backgroundColor: '#f8f9fa' },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  typeBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#dcdde1', borderRadius: 8, alignItems: 'center', marginHorizontal: 4, backgroundColor: '#f8f9fa' },
  activeTypeBtn: { backgroundColor: '#00a8ff', borderColor: '#00a8ff' },
  typeText: { color: '#353b48', fontWeight: '600', fontSize: 13 },
  activeTypeText: { color: '#fff' },
  durationContainer: { backgroundColor: '#f1f2f6', padding: 10, borderRadius: 8, marginBottom: 10 },
  addButton: { backgroundColor: '#4cd137', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  listContainer: { marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2f3640', marginBottom: 10 },
  noDataText: { color: '#718093', fontStyle: 'italic' },
  itemCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, elevation: 1 },
  completedCard: { backgroundColor: '#f1f2f6' },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#00a8ff', borderRadius: 6, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkedBox: { backgroundColor: '#00a8ff' },
  checkmark: { color: '#fff', fontWeight: 'bold' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#2f3640' },
  badgeText: { fontSize: 11, color: '#718093', marginLeft: 6, fontStyle: 'italic' },
  completedText: { textDecorationLine: 'line-through', color: '#718093' },
  itemAmount: { fontSize: 14, color: '#e84118', marginTop: 2 },
  deleteText: { color: '#ff4757', fontSize: 18, fontWeight: 'bold', paddingHorizontal: 8 },
});