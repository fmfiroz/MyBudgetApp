import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ExpenseScreen() {
  const router = useRouter();
  const [category, setCategory] = useState('বাজার');
  const [expenseList, setExpenseList] = useState<any[]>([]);

  // একাধিক আইটেম একসাথে এন্ট্রি দেওয়ার জন্য স্টেট (প্রতিটি সারিতে title এবং amount থাকবে)
  const [rows, setRows] = useState([{ id: '1', title: '', amount: '' }]);

  // লোকাল স্টোরেজ থেকে ডেটা লোড করা
  const loadExpenses = async () => {
    try {
      const existingData = await AsyncStorage.getItem('@local_expense_db');
      if (existingData) {
        setExpenseList(JSON.parse(existingData));
      }
    } catch (error) {
      console.log('Error loading data', error);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  // নতুন একটি ইনপুট রো যোগ করার ফাংশন
  const addRow = () => {
    setRows([...rows, { id: Date.now().toString(), title: '', amount: '' }]);
  };

  // নির্দিষ্ট রো-এর মান পরিবর্তনের ফাংশন
  const updateRow = (id: string, field: 'title' | 'amount', value: string) => {
    const updatedRows = rows.map((row) => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    });
    setRows(updatedRows);
  };

  // নির্দিষ্ট রো ডিলিট করার ফাংশন
  const removeRow = (id: string) => {
    if (rows.length === 1) {
      Alert.alert('সতর্কতা', 'কমপক্ষে একটি এন্ট্রি রাখতে হবে!');
      return;
    }
    setRows(rows.filter((row) => row.id !== id));
  };

  // সব এন্ট্রি একসাথে লোকাল স্টোরেজে সেভ করার ফাংশন
  const handleSaveAll = async () => {
    // ভ্যালিডেশন: কোনো ফিল্ড খালি আছে কিনা দেখা
    for (let row of rows) {
      if (!row.title || !row.amount) {
        Alert.alert('ভুল হয়েছে', 'সবগুলো রো-তে বিবরণ এবং টাকার পরিমাণ সঠিকভাবে লিখুন!');
        return;
      }
    }

    try {
      const existingData = await AsyncStorage.getItem('@local_expense_db');
      const existingExpenses = existingData ? JSON.parse(existingData) : [];

      // নতুন এন্ট্রিগুলোকে ফরম্যাট করা
      const newEntries = rows.map((row) => ({
        id: Date.now().toString() + Math.random(),
        title: row.title,
        amount: parseFloat(row.amount),
        category,
        date: new Date().toLocaleDateString(),
      }));

      // সব নতুন এন্ট্রি আগের তালিকার সাথে যুক্ত করা
      const updatedExpenses = [...newEntries, ...existingExpenses];

      // লোকাল স্টোরেজে মেইন ব্যাকআপ ফাইল হিসেবে সেভ করা
      await AsyncStorage.setItem('@local_expense_db', JSON.stringify(updatedExpenses));

      setExpenseList(updatedExpenses);
      setRows([{ id: '1', title: '', amount: '' }]); // ফর্ম রিসেট
      Alert.alert('সফল হয়েছে', 'সকল খরচ লোকাল স্টোরেজে নিরাপদে সংরক্ষিত হয়েছে!');
    } catch (error) {
      Alert.alert('ত্রুটি', 'ডেটা সেভ করতে সমস্যা হয়েছে!');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← পেছনের ড্যাশবোর্ড</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>একাধিক খরচ এন্ট্রি (Local-First)</Text>
        </View>

        {/* Multi-Input Form */}
        <View style={styles.formCard}>
          <Text style={styles.label}>ক্যাটাগরি নির্বাচন করুন</Text>
          <View style={styles.categoryRow}>
            {['বাজার', 'যাতায়াত', 'অন্যান্য'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.categoryBtn, category === item && styles.activeCategory]}
                onPress={() => setCategory(item)}
              >
                <Text style={[styles.categoryText, category === item && styles.activeCategoryText]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>খরচের তালিকা (একাধিক এন্ট্রি)</Text>

          {rows.map((row, index) => (
            <View key={row.id} style={styles.rowContainer}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="বিবরণ (যেমন: চাল)"
                placeholderTextColor="#a4b0be"
                value={row.title}
                onChangeText={(text) => updateRow(row.id, 'title', text)}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginHorizontal: 6 }]}
                placeholder="টাকা"
                placeholderTextColor="#a4b0be"
                keyboardType="numeric"
                value={row.amount}
                onChangeText={(text) => updateRow(row.id, 'amount', text)}
              />
              <TouchableOpacity style={styles.deleteBtn} onPress={() => removeRow(row.id)}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add More Row Button */}
          <TouchableOpacity style={styles.addRowButton} onPress={addRow}>
            <Text style={styles.addRowButtonText}>+ আরেকটি আইটেম যোগ করুন</Text>
          </TouchableOpacity>

          {/* Save All Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveAll}>
            <Text style={styles.saveButtonText}>সবগুলো খরচ সংরক্ষণ করুন</Text>
          </TouchableOpacity>
        </View>

        {/* Saved List Section */}
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>লোকাল ব্যাকআপে সংরক্ষিত খরচসমূহ</Text>
          {expenseList.length === 0 ? (
            <Text style={styles.noDataText}>কোনো হিসাব পাওয়া যায়নি।</Text>
          ) : (
            expenseList.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemCategory}>{item.category} • {item.date}</Text>
                </View>
                <Text style={styles.itemAmount}>৳{item.amount}</Text>
              </View>
            ))
          )}
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
  },
  backButton: {
    color: '#00a8ff',
    fontSize: 16,
    marginBottom: 10,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2f3640',
  },
  formCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    elevation: 3,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#353b48',
    marginBottom: 8,
    fontWeight: '600',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  categoryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#f8f9fa',
  },
  activeCategory: {
    backgroundColor: '#00a8ff',
    borderColor: '#00a8ff',
  },
  categoryText: {
    color: '#353b48',
    fontWeight: '600',
  },
  activeCategoryText: {
    color: '#fff',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dcdde1',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#2f3640',
    backgroundColor: '#f8f9fa',
  },
  deleteBtn: {
    backgroundColor: '#ff4757',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addRowButton: {
    borderWidth: 1,
    borderColor: '#00a8ff',
    borderStyle: 'dashed',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
    backgroundColor: '#f0f9ff',
  },
  addRowButtonText: {
    color: '#00a8ff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4cd137',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContainer: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2f3640',
    marginBottom: 12,
  },
  noDataText: {
    color: '#718093',
    fontStyle: 'italic',
  },
  itemCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2f3640',
  },
  itemCategory: {
    fontSize: 12,
    color: '#718093',
    marginTop: 4,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e84118',
  },
});