import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { saveLocalData } from '../utils/firebaseSync';

type WelfareTab = 'income' | 'expense' | 'loans';

interface WelfareCashFlowItem {
  id: string;
  date: string; // DD/MM/YYYY
  sourceOrTarget: string;
  note?: string;
  amount: number;
  createdAt: number;
}

interface LoanRepaymentRecord {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

interface WelfareLoanItem {
  id: string;
  borrowerName: string;
  dateGiven: string;
  amountGiven: number;
  note?: string;
  repayments: LoanRepaymentRecord[];
  createdAt: number;
}

interface WelfareStoreData {
  incomes: WelfareCashFlowItem[];
  expenses: WelfareCashFlowItem[];
  loans: WelfareLoanItem[];
}

type StrictDeleteTarget =
  | {
      kind: 'income';
      id: string;
      title: string;
      subtitle: string;
      amount: number;
    }
  | {
      kind: 'expense';
      id: string;
      title: string;
      subtitle: string;
      amount: number;
    }
  | {
      kind: 'loan';
      id: string;
      title: string;
      subtitle: string;
      amount: number;
    }
  | {
      kind: 'repayment';
      loanId: string;
      repaymentId: string;
      title: string;
      subtitle: string;
      amount: number;
    };

const WELFARE_STORAGE_KEY = '@mybudget_welfare_fund_v1';
const BUDGET_MONTH_KEY_PREFIX = '@mybudget_budget_v3_';
const WELFARE_ROW_ID = 'cat-welfare-fund';

const FISCAL_MONTHS = [
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
];

const MONTH_NAME_TO_NUM: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

function safeToCents(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val * 100) : 0;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  return 0;
}

function safeFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function formatMoney(val: number): string {
  const num = Number.isFinite(val) ? val : 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getTodayDDMMYYYY(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

function getFiscalStartYearForNow(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function getYearMonthForFiscalMonth(month: string, startYear: number): string {
  const idx = FISCAL_MONTHS.indexOf(month);
  const calYear = idx >= 0 && idx <= 5 ? startYear : startYear + 1;
  const mm = MONTH_NAME_TO_NUM[month] || '01';
  return `${calYear}-${mm}`;
}

async function getBudgetWelfareAllocations(startYear: number): Promise<
  { id: string; label: string; amount: number }[]
> {
  const results: { id: string; label: string; amount: number }[] = [];
  for (const month of FISCAL_MONTHS) {
    const ym = getYearMonthForFiscalMonth(month, startYear);
    try {
      const raw = await AsyncStorage.getItem(`${BUDGET_MONTH_KEY_PREFIX}${ym}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { rowAmounts?: { [rowId: string]: number } };
      const amtCents = safeToCents(parsed?.rowAmounts?.[WELFARE_ROW_ID]);
      if (amtCents > 0) {
        const calYr = ym.slice(0, 4);
        results.push({
          id: `budget-alloc-${ym}`,
          label: `Budget Allocation (${month} ${calYr})`,
          amount: safeFromCents(amtCents),
        });
      }
    } catch {
      // ignore single month error
    }
  }
  return results;
}

export default function WelfareScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<WelfareTab>('income');
  const [store, setStore] = useState<WelfareStoreData>({
    incomes: [],
    expenses: [],
    loans: [],
  });
  const [budgetAllocations, setBudgetAllocations] = useState<
    { id: string; label: string; amount: number }[]
  >([]);

  // Add Income / Expense Modal
  const [cashFlowModalVisible, setCashFlowModalVisible] = useState<boolean>(false);
  const [cashFlowMode, setCashFlowMode] = useState<'income' | 'expense'>('income');
  const [cfDate, setCfDate] = useState<string>(getTodayDDMMYYYY());
  const [cfParty, setCfParty] = useState<string>('');
  const [cfAmount, setCfAmount] = useState<string>('');
  const [cfNote, setCfNote] = useState<string>('');

  // Add Loan Modal
  const [addLoanModalVisible, setAddLoanModalVisible] = useState<boolean>(false);
  const [loanBorrower, setLoanBorrower] = useState<string>('');
  const [loanDateGiven, setLoanDateGiven] = useState<string>(getTodayDDMMYYYY());
  const [loanAmountGiven, setLoanAmountGiven] = useState<string>('');
  const [loanNote, setLoanNote] = useState<string>('');

  // Add Loan Repayment Modal
  const [repayTargetLoan, setRepayTargetLoan] = useState<WelfareLoanItem | null>(null);
  const [repayDate, setRepayDate] = useState<string>(getTodayDDMMYYYY());
  const [repayAmount, setRepayAmount] = useState<string>('');
  const [repayNote, setRepayNote] = useState<string>('');

  // Strict Delete Modal States (সব ধরনের ডিলিটের জন্য কঠিন যাচাই)
  const [strictDeleteTarget, setStrictDeleteTarget] = useState<StrictDeleteTarget | null>(null);
  const [strictDeleteChecked, setStrictDeleteChecked] = useState<boolean>(false);
  const [strictDeleteTyped, setStrictDeleteTyped] = useState<string>('');

  const loadWelfareData = useCallback(async () => {
    try {
      const startYr = getFiscalStartYearForNow();
      const [raw, allocs] = await Promise.all([
        AsyncStorage.getItem(WELFARE_STORAGE_KEY),
        getBudgetWelfareAllocations(startYr),
      ]);

      setBudgetAllocations(allocs);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WelfareStoreData>;
        setStore({
          incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          loans: Array.isArray(parsed.loans) ? parsed.loans : [],
        });
      }
    } catch (e) {
      console.log('Failed to load welfare data:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWelfareData();
    }, [loadWelfareData])
  );

  const persistStore = useCallback(async (next: WelfareStoreData) => {
    setStore(next);
    try {
      await saveLocalData(WELFARE_STORAGE_KEY, next);
    } catch (e) {
      console.log('Failed to save welfare data:', e);
    }
  }, []);

  const openStrictDeleteDialog = (target: StrictDeleteTarget) => {
    setStrictDeleteTarget(target);
    setStrictDeleteChecked(false);
    setStrictDeleteTyped('');
  };

  const closeStrictDeleteDialog = () => {
    setStrictDeleteTarget(null);
    setStrictDeleteChecked(false);
    setStrictDeleteTyped('');
  };

  const canConfirmStrictDelete = useMemo(() => {
    if (!strictDeleteTarget || !strictDeleteChecked) return false;
    const typed = strictDeleteTyped.trim().toLowerCase();
    const titleLower = strictDeleteTarget.title.trim().toLowerCase();
    return typed === 'delete' || (titleLower.length > 0 && typed === titleLower);
  }, [strictDeleteTarget, strictDeleteChecked, strictDeleteTyped]);

  const handleConfirmStrictDelete = async () => {
    if (!strictDeleteTarget || !canConfirmStrictDelete) return;

    if (strictDeleteTarget.kind === 'income') {
      await persistStore({
        ...store,
        incomes: store.incomes.filter((i) => i.id !== strictDeleteTarget.id),
      });
    } else if (strictDeleteTarget.kind === 'expense') {
      await persistStore({
        ...store,
        expenses: store.expenses.filter((e) => e.id !== strictDeleteTarget.id),
      });
    } else if (strictDeleteTarget.kind === 'loan') {
      await persistStore({
        ...store,
        loans: store.loans.filter((l) => l.id !== strictDeleteTarget.id),
      });
    } else if (strictDeleteTarget.kind === 'repayment') {
      const nextLoans = store.loans.map((l) => {
        if (l.id !== strictDeleteTarget.loanId) return l;
        return {
          ...l,
          repayments: (l.repayments || []).filter(
            (r) => r.id !== strictDeleteTarget.repaymentId
          ),
        };
      });
      await persistStore({
        ...store,
        loans: nextLoans,
      });
    }

    closeStrictDeleteDialog();
  };

  const handleOpenCashFlowModal = (mode: 'income' | 'expense') => {
    setCashFlowMode(mode);
    setCfDate(getTodayDDMMYYYY());
    setCfParty('');
    setCfAmount('');
    setCfNote('');
    setCashFlowModalVisible(true);
  };

  const handleSaveCashFlow = async () => {
    const cleanParty = cfParty.trim();
    const amtCents = safeToCents(cfAmount);

    if (!cleanParty) {
      Alert.alert(
        'তথ্য অসম্পূর্ণ',
        cashFlowMode === 'income'
          ? 'কথা থেকে টাকা এসেছে তা লিখুন।'
          : 'কোথায় বা কাকে খরচ করা হয়েছে তা লিখুন।'
      );
      return;
    }
    if (amtCents <= 0) {
      Alert.alert('সঠিক টাকা দিন', 'টাকার পরিমাণ ০-এর বেশি হতে হবে।');
      return;
    }

    const item: WelfareCashFlowItem = {
      id: `wf-${cashFlowMode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: cfDate.trim() || getTodayDDMMYYYY(),
      sourceOrTarget: cleanParty,
      note: cfNote.trim() || undefined,
      amount: safeFromCents(amtCents),
      createdAt: Date.now(),
    };

    if (cashFlowMode === 'income') {
      await persistStore({
        ...store,
        incomes: [item, ...store.incomes],
      });
    } else {
      await persistStore({
        ...store,
        expenses: [item, ...store.expenses],
      });
    }

    setCashFlowModalVisible(false);
  };

  const handleAddLoan = async () => {
    const cleanName = loanBorrower.trim();
    const amtCents = safeToCents(loanAmountGiven);

    if (!cleanName) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'যাকে ধার দেওয়া হয়েছে তার নাম লিখুন।');
      return;
    }
    if (amtCents <= 0) {
      Alert.alert('সঠিক টাকা দিন', 'ধারের পরিমাণ ০-এর বেশি হতে হবে।');
      return;
    }

    const newLoan: WelfareLoanItem = {
      id: `wloan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      borrowerName: cleanName,
      dateGiven: loanDateGiven.trim() || getTodayDDMMYYYY(),
      amountGiven: safeFromCents(amtCents),
      note: loanNote.trim() || undefined,
      repayments: [],
      createdAt: Date.now(),
    };

    await persistStore({
      ...store,
      loans: [newLoan, ...store.loans],
    });

    setLoanBorrower('');
    setLoanDateGiven(getTodayDDMMYYYY());
    setLoanAmountGiven('');
    setLoanNote('');
    setAddLoanModalVisible(false);
  };

  const openRepayModal = (loan: WelfareLoanItem) => {
    setRepayTargetLoan(loan);
    setRepayDate(getTodayDDMMYYYY());
    setRepayAmount('');
    setRepayNote('');
  };

  const handleSaveRepayment = async () => {
    if (!repayTargetLoan) return;
    const amtCents = safeToCents(repayAmount);
    if (amtCents <= 0) {
      Alert.alert('সঠিক টাকা দিন', 'ফেরত পাওয়া টাকার পরিমাণ ০-এর বেশি হতে হবে।');
      return;
    }

    const givenCents = safeToCents(repayTargetLoan.amountGiven);
    const prevReturnedCents = (repayTargetLoan.repayments || []).reduce(
      (s, r) => s + safeToCents(r.amount),
      0
    );
    const remainingDueCents = Math.max(0, givenCents - prevReturnedCents);

    if (amtCents > remainingDueCents) {
      Alert.alert(
        'বকেয়ার চেয়ে বেশি',
        `এই ব্যক্তির আর ${formatMoney(safeFromCents(remainingDueCents))} Tk. ফেরত দিতে বাকি আছে।`
      );
      return;
    }

    const rep: LoanRepaymentRecord = {
      id: `repay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: repayDate.trim() || getTodayDDMMYYYY(),
      amount: safeFromCents(amtCents),
      note: repayNote.trim() || undefined,
    };

    const nextLoans = store.loans.map((l) => {
      if (l.id !== repayTargetLoan.id) return l;
      return {
        ...l,
        repayments: [rep, ...(l.repayments || [])],
      };
    });

    await persistStore({
      ...store,
      loans: nextLoans,
    });

    setRepayTargetLoan(null);
  };

  const summary = useMemo(() => {
    const budgetAllocCents = budgetAllocations.reduce(
      (s, a) => s + safeToCents(a.amount),
      0
    );
    const directIncomeCents = store.incomes.reduce(
      (s, i) => s + safeToCents(i.amount),
      0
    );
    const totalFundCents = budgetAllocCents + directIncomeCents;

    const totalExpenseCents = store.expenses.reduce(
      (s, e) => s + safeToCents(e.amount),
      0
    );

    let totalLoanGivenCents = 0;
    let totalLoanReturnedCents = 0;
    let totalLoanDueCents = 0;

    store.loans.forEach((loan) => {
      const gCents = safeToCents(loan.amountGiven);
      const rCents = (loan.repayments || []).reduce(
        (sum, r) => sum + safeToCents(r.amount),
        0
      );
      const dueCents = Math.max(0, gCents - rCents);
      totalLoanGivenCents += gCents;
      totalLoanReturnedCents += rCents;
      totalLoanDueCents += dueCents;
    });

    const availableCashCents = totalFundCents - totalExpenseCents - totalLoanDueCents;

    return {
      budgetAlloc: safeFromCents(budgetAllocCents),
      directIncome: safeFromCents(directIncomeCents),
      totalFund: safeFromCents(totalFundCents),
      totalExpense: safeFromCents(totalExpenseCents),
      totalLoanGiven: safeFromCents(totalLoanGivenCents),
      totalLoanReturned: safeFromCents(totalLoanReturnedCents),
      totalLoanDue: safeFromCents(totalLoanDueCents),
      availableCash: safeFromCents(availableCashCents),
    };
  }, [budgetAllocations, store.incomes, store.expenses, store.loans]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Welfare Fund</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Budget Allocation, Income, Expense & Loan Ledger
          </Text>
        </View>
      </View>

      {/* Heading Summary Cards */}
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, { backgroundColor: '#DBEAFE' }]}>
          <Text style={styles.summaryLabel}>মোট তহবিল (Total Fund)</Text>
          <Text style={[styles.summaryAmount, { color: '#1E3A8A' }]}>
            {formatMoney(summary.totalFund)} Tk.
          </Text>
          <Text style={styles.summaryTiny}>
            Budget: {formatMoney(summary.budgetAlloc)} + আয়: {formatMoney(summary.directIncome)}
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
          <Text style={styles.summaryLabel}>মোট খরচ (Expense)</Text>
          <Text style={[styles.summaryAmount, { color: '#B91C1C' }]}>
            {formatMoney(summary.totalExpense)} Tk.
          </Text>
          <Text style={styles.summaryTiny}>অনুদান ও অন্যান্য খরচ</Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={styles.summaryLabel}>ফেরত আসতে বাকি (Due)</Text>
          <Text style={[styles.summaryAmount, { color: '#92400E' }]}>
            {formatMoney(summary.totalLoanDue)} Tk.
          </Text>
          <Text style={styles.summaryTiny}>
            দেওয়া: {formatMoney(summary.totalLoanGiven)} • ফেরত: {formatMoney(summary.totalLoanReturned)}
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: '#DCFCE7' }]}>
          <Text style={styles.summaryLabel}>বর্তমান স্থিতি (Balance)</Text>
          <Text
            style={[
              styles.summaryAmount,
              { color: summary.availableCash >= 0 ? '#15803D' : '#B91C1C' },
            ]}
          >
            {formatMoney(summary.availableCash)} Tk.
          </Text>
          <Text style={styles.summaryTiny}>তহবিল − খরচ − বকেয়া ধার</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'income' && styles.tabBtnActive]}
          onPress={() => setActiveTab('income')}
        >
          <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>
            আয় (Income)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'expense' && styles.tabBtnActive]}
          onPress={() => setActiveTab('expense')}
        >
          <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>
            খরচ (Expense)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'loans' && styles.tabBtnActive]}
          onPress={() => setActiveTab('loans')}
        >
          <Text style={[styles.tabText, activeTab === 'loans' && styles.tabTextActive]}>
            ধার ও ফেরত (Loan)
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {activeTab === 'income' && (
          <>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: '#16A34A' }]}
              onPress={() => handleOpenCashFlowModal('income')}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>+ নতুন Welfare আয় যোগ করুন</Text>
            </TouchableOpacity>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Budget থেকে আসা Welfare বরাদ্দ ({formatMoney(summary.budgetAlloc)} Tk.)
              </Text>
              {budgetAllocations.length === 0 ? (
                <Text style={styles.emptyHint}>
                  Budget পেজের Welfare Fund খাতে কোনো মাসিক বরাদ্দ দেওয়া হয়নি।
                </Text>
              ) : (
                budgetAllocations.map((alloc) => (
                  <View key={alloc.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{alloc.label}</Text>
                      <Text style={styles.itemSub}>Budget Sheet Sync</Text>
                    </View>
                    <Text style={[styles.itemAmount, { color: '#1D4ED8' }]}>
                      +{formatMoney(alloc.amount)} Tk.
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Welfare আয়ের তালিকা ({store.incomes.length})
              </Text>
              {store.incomes.length === 0 ? (
                <Text style={styles.emptyHint}>কোনো অতিরিক্ত Welfare আয় যোগ করা হয়নি।</Text>
              ) : (
                store.incomes.map((inc) => (
                  <View key={inc.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{inc.sourceOrTarget}</Text>
                      <Text style={styles.itemSub}>
                        তারিখ: {inc.date}
                        {inc.note ? ` • ${inc.note}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemAmount, { color: '#15803D' }]}>
                      +{formatMoney(inc.amount)} Tk.
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        openStrictDeleteDialog({
                          kind: 'income',
                          id: inc.id,
                          title: inc.sourceOrTarget,
                          subtitle: `তারিখ: ${inc.date}`,
                          amount: inc.amount,
                        })
                      }
                      style={styles.deleteBtnSmall}
                      accessibilityLabel="Delete Welfare Income"
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {activeTab === 'expense' && (
          <>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: '#DC2626' }]}
              onPress={() => handleOpenCashFlowModal('expense')}
            >
              <Ionicons name="remove-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>+ নতুন Welfare খরচ যোগ করুন</Text>
            </TouchableOpacity>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Welfare খরচের তালিকা ({store.expenses.length})
              </Text>
              {store.expenses.length === 0 ? (
                <Text style={styles.emptyHint}>কোনো খরচের রেকর্ড নেই।</Text>
              ) : (
                store.expenses.map((exp) => (
                  <View key={exp.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{exp.sourceOrTarget}</Text>
                      <Text style={styles.itemSub}>
                        তারিখ: {exp.date}
                        {exp.note ? ` • ${exp.note}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemAmount, { color: '#B91C1C' }]}>
                      -{formatMoney(exp.amount)} Tk.
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        openStrictDeleteDialog({
                          kind: 'expense',
                          id: exp.id,
                          title: exp.sourceOrTarget,
                          subtitle: `তারিখ: ${exp.date}`,
                          amount: exp.amount,
                        })
                      }
                      style={styles.deleteBtnSmall}
                      accessibilityLabel="Delete Welfare Expense"
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {activeTab === 'loans' && (
          <>
            <View style={styles.loanTotalBanner}>
              <Text style={styles.loanBannerTitle}>
                সবার মিলিয়ে মোট ফেরত আসতে বাকি আছে:
              </Text>
              <Text style={styles.loanBannerAmount}>
                {formatMoney(summary.totalLoanDue)} Tk.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => {
                setLoanBorrower('');
                setLoanDateGiven(getTodayDDMMYYYY());
                setLoanAmountGiven('');
                setLoanNote('');
                setAddLoanModalVisible(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>+ নতুন ধার দিন (Give Loan)</Text>
            </TouchableOpacity>

            {store.loans.length === 0 ? (
              <View style={styles.sectionCard}>
                <Text style={styles.emptyHint}>Welfare ফান্ড থেকে কাউকে ধার দেওয়া হয়নি।</Text>
              </View>
            ) : (
              store.loans.map((loan) => {
                const givenCents = safeToCents(loan.amountGiven);
                const returnedCents = (loan.repayments || []).reduce(
                  (s, r) => s + safeToCents(r.amount),
                  0
                );
                const dueCents = Math.max(0, givenCents - returnedCents);
                const dueVal = safeFromCents(dueCents);
                const returnedVal = safeFromCents(returnedCents);

                return (
                  <View key={loan.id} style={styles.loanCard}>
                    <View style={styles.loanCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.loanBorrowerName}>{loan.borrowerName}</Text>
                        <Text style={styles.itemSub}>
                          ধার দেওয়ার তারিখ: {loan.dateGiven}
                          {loan.note ? ` • ${loan.note}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          openStrictDeleteDialog({
                            kind: 'loan',
                            id: loan.id,
                            title: loan.borrowerName,
                            subtitle: `ধার: ${formatMoney(loan.amountGiven)} Tk. • বাকি: ${formatMoney(dueVal)} Tk.`,
                            amount: loan.amountGiven,
                          })
                        }
                        style={styles.deleteBtnSmall}
                        accessibilityLabel="Delete Loan Record"
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.loanMetricsRow}>
                      <View style={styles.loanMetricBox}>
                        <Text style={styles.loanMetricLabel}>ধার দেওয়া হয়েছে</Text>
                        <Text style={styles.loanMetricVal}>
                          {formatMoney(loan.amountGiven)} Tk.
                        </Text>
                      </View>
                      <View style={styles.loanMetricBox}>
                        <Text style={styles.loanMetricLabel}>ফেরত পাওয়া গেছে</Text>
                        <Text style={[styles.loanMetricVal, { color: '#15803D' }]}>
                          {formatMoney(returnedVal)} Tk.
                        </Text>
                      </View>
                      <View style={styles.loanMetricBox}>
                        <Text style={styles.loanMetricLabel}>ফেরত দিতে বাকি</Text>
                        <Text
                          style={[
                            styles.loanMetricVal,
                            { color: dueVal > 0 ? '#B91C1C' : '#15803D' },
                          ]}
                        >
                          {dueVal > 0 ? `${formatMoney(dueVal)} Tk.` : 'পরিশোধিত'}
                        </Text>
                      </View>
                    </View>

                    {Array.isArray(loan.repayments) && loan.repayments.length > 0 && (
                      <View style={styles.repayHistoryBox}>
                        <Text style={styles.repayHistoryTitle}>ফেরত দেওয়ার বিবরণ:</Text>
                        {loan.repayments.map((rep) => (
                          <View key={rep.id} style={styles.repayHistoryRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.repayHistoryText}>
                                তারিখ: {rep.date}
                                {rep.note ? ` (${rep.note})` : ''}
                              </Text>
                            </View>
                            <Text style={styles.repayHistoryAmt}>
                              +{formatMoney(rep.amount)} Tk.
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                openStrictDeleteDialog({
                                  kind: 'repayment',
                                  loanId: loan.id,
                                  repaymentId: rep.id,
                                  title: `${loan.borrowerName} Repayment`,
                                  subtitle: `ফেরতের তারিখ: ${rep.date}`,
                                  amount: rep.amount,
                                })
                              }
                              style={{ paddingLeft: 6 }}
                              accessibilityLabel="Delete Repayment Entry"
                            >
                              <Ionicons name="trash-outline" size={14} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {dueVal > 0 && (
                      <TouchableOpacity
                        style={styles.repayBtn}
                        onPress={() => openRepayModal(loan)}
                      >
                        <Ionicons name="return-down-back-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.repayBtnText}>ফেরত এন্ট্রি যোগ করুন (Repay)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Strict Two-Step Delete Confirmation Modal */}
      <Modal visible={Boolean(strictDeleteTarget)} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>
                কঠিন ডিলিট নিশ্চিতকরণ (Strict Delete)
              </Text>

              {strictDeleteTarget && (
                <View style={styles.strictDangerBox}>
                  <Text style={styles.strictDangerTitle}>
                    {strictDeleteTarget.title} ({formatMoney(strictDeleteTarget.amount)} Tk.)
                  </Text>
                  <Text style={styles.strictDangerSub}>{strictDeleteTarget.subtitle}</Text>
                  <Text style={styles.strictDangerSub}>
                    সতর্কতা: ডিলিট করলে এই রেকর্ডটি স্থায়ীভাবে মুছে যাবে এবং মোট হিসাব আপডেট হবে।
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.strictCheckRow}
                onPress={() => setStrictDeleteChecked((v) => !v)}
              >
                <Ionicons
                  name={strictDeleteChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#DC2626"
                />
                <Text style={styles.strictCheckLabel}>
                  আমি ঝুঁকি জেনে এই এন্ট্রিটি স্থায়ীভাবে মুছে ফেলতে চাই।
                </Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>
                নিশ্চিত করতে "{strictDeleteTarget?.title}" অথবা "DELETE" লিখুন:
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder='Type "DELETE" or exact name'
                value={strictDeleteTyped}
                onChangeText={setStrictDeleteTyped}
                autoCapitalize="none"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={closeStrictDeleteDialog}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!canConfirmStrictDelete}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: canConfirmStrictDelete ? '#DC2626' : '#FCA5A5',
                    },
                  ]}
                  onPress={handleConfirmStrictDelete}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Permanent Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Welfare Income / Expense Modal */}
      <Modal visible={cashFlowModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {cashFlowMode === 'income'
                ? 'নতুন Welfare আয় যোগ করুন'
                : 'নতুন Welfare খরচ যোগ করুন'}
            </Text>

            <Text style={styles.inputLabel}>তারিখ (DD/MM/YYYY)</Text>
            <TextInput
              style={styles.modalInput}
              value={cfDate}
              onChangeText={setCfDate}
              placeholder="23/11/2026"
            />

            <Text style={styles.inputLabel}>
              {cashFlowMode === 'income'
                ? 'কোথা থেকে / কার কাছ থেকে টাকা এসেছে?'
                : 'কোথায় / কাকে টাকা খরচ করা হয়েছে?'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={cfParty}
              onChangeText={setCfParty}
              placeholder={
                cashFlowMode === 'income'
                  ? 'যেমন: অনুদান, সদস্য চাঁদা...'
                  : 'যেমন: চিকিৎসা সহায়তা, আপ্যায়ন...'
              }
            />

            <Text style={styles.inputLabel}>টাকার পরিমাণ (Tk.)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={cfAmount}
              onChangeText={setCfAmount}
              placeholder="0.00"
            />

            <Text style={styles.inputLabel}>নোট (ঐচ্ছিক)</Text>
            <TextInput
              style={styles.modalInput}
              value={cfNote}
              onChangeText={setCfNote}
              placeholder="অতিরিক্ত বিবরণ..."
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setCashFlowModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: cashFlowMode === 'income' ? '#16A34A' : '#DC2626' },
                ]}
                onPress={handleSaveCashFlow}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Loan Modal */}
      <Modal visible={addLoanModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Welfare ফান্ড থেকে ধার দিন</Text>

            <Text style={styles.inputLabel}>যাকে ধার দেওয়া হচ্ছে তার নাম</Text>
            <TextInput
              style={styles.modalInput}
              value={loanBorrower}
              onChangeText={setLoanBorrower}
              placeholder="নাম লিখুন"
            />

            <Text style={styles.inputLabel}>ধার দেওয়ার তারিখ (DD/MM/YYYY)</Text>
            <TextInput
              style={styles.modalInput}
              value={loanDateGiven}
              onChangeText={setLoanDateGiven}
              placeholder="23/11/2026"
            />

            <Text style={styles.inputLabel}>ধারের পরিমাণ (Tk.)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={loanAmountGiven}
              onChangeText={setLoanAmountGiven}
              placeholder="0.00"
            />

            <Text style={styles.inputLabel}>নোট (ঐচ্ছিক)</Text>
            <TextInput
              style={styles.modalInput}
              value={loanNote}
              onChangeText={setLoanNote}
              placeholder="শর্ত বা মন্তব্য..."
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddLoanModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleAddLoan}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>ধার সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Repayment Modal */}
      <Modal visible={Boolean(repayTargetLoan)} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              ধার ফেরত এন্ট্রি — {repayTargetLoan?.borrowerName}
            </Text>

            <Text style={styles.inputLabel}>ফেরত দেওয়ার তারিখ (DD/MM/YYYY)</Text>
            <TextInput
              style={styles.modalInput}
              value={repayDate}
              onChangeText={setRepayDate}
              placeholder="23/11/2026"
            />

            <Text style={styles.inputLabel}>কত টাকা ফেরত দিল? (Tk.)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={repayAmount}
              onChangeText={setRepayAmount}
              placeholder="0.00"
              autoFocus
            />

            <Text style={styles.inputLabel}>নোট (ঐচ্ছিক)</Text>
            <TextInput
              style={styles.modalInput}
              value={repayNote}
              onChangeText={setRepayNote}
              placeholder="কিস্তি বা ফেরতের বিবরণ..."
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setRepayTargetLoan(null)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                onPress={handleSaveRepayment}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>ফেরত সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 28 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  backBtn: {
    padding: 3,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  summaryCard: {
    width: '48.8%',
    borderRadius: 10,
    padding: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  summaryAmount: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  summaryTiny: {
    fontSize: 9.5,
    color: '#475569',
    marginTop: 2,
  },
  tabsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#1E3A8A',
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  contentContainer: {
    padding: 10,
    gap: 10,
    paddingBottom: 28,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 9,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 12,
    color: '#64748B',
    paddingVertical: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  deleteBtnSmall: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  loanTotalBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loanBannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  loanBannerAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B91C1C',
  },
  loanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  loanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loanBorrowerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanMetricsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  loanMetricBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loanMetricLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  loanMetricVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  repayHistoryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  repayHistoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#14532D',
  },
  repayHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  repayHistoryText: {
    fontSize: 11,
    color: '#166534',
  },
  repayHistoryAmt: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  repayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    borderRadius: 8,
  },
  repayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  strictDangerBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 3,
  },
  strictDangerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#991B1B',
  },
  strictDangerSub: {
    fontSize: 11.5,
    color: '#7F1D1D',
  },
  strictCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  strictCheckLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    gap: 6,
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});