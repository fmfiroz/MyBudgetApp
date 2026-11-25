import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { saveLocalData } from '../utils/firebaseSync';
import { getCombinedIncomeForMonth } from '../utils/incomeSyncHelper';

export type SavingsCategoryType = 'Insurance' | 'DPS' | 'Loan EMI' | 'Others';

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

interface SavingsPlanItem {
  id: string;
  type: SavingsCategoryType;
  name: string;
  companyName?: string;
  policyNo?: string;
  amount: number;
  startFiscalYear: number;
  startMonthIndex: number;
  durationMonths: number;
}

const SAVINGS_ITEMS_KEY = '@mybudget_savings_plans_v1';
const SAVINGS_MONTH_KEY_PREFIX = '@mybudget_savings_monthly_v1_';

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

function formatFiscalYearLabel(startYear: number): string {
  const nextTwoDigits = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${nextTwoDigits}`;
}

function getMonthCalendarYear(month: string, startYear: number): number {
  const idx = FISCAL_MONTHS.indexOf(month);
  return idx >= 0 && idx <= 5 ? startYear : startYear + 1;
}

function getYearMonthForFiscalMonth(month: string, startYear: number): string {
  const calYear = getMonthCalendarYear(month, startYear);
  const mm = MONTH_NAME_TO_NUM[month] || '01';
  return `${calYear}-${mm}`;
}

function getPreviousMonthAndFiscalYear(
  month: string,
  startYear: number
): { prevMonth: string; prevFiscalStartYear: number } {
  const idx = FISCAL_MONTHS.indexOf(month);
  if (idx <= 0) {
    return {
      prevMonth: FISCAL_MONTHS[FISCAL_MONTHS.length - 1],
      prevFiscalStartYear: startYear - 1,
    };
  }
  return {
    prevMonth: FISCAL_MONTHS[idx - 1],
    prevFiscalStartYear: startYear,
  };
}

function getCurrentFiscalMonthName(): string {
  const jsMonth = new Date().getMonth();
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return names[jsMonth] || 'November';
}

function getItemStateForMonth(
  item: SavingsPlanItem,
  targetFiscalYear: number,
  targetMonthIndex: number
): { activeAmount: number; isWithinMeyad: boolean; isExpiredByNow: boolean } {
  const duration = Math.max(1, Math.floor(Number(item.durationMonths) || 1));

  const now = new Date();
  const nowStartYear =
    now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const nowMonthName = getCurrentFiscalMonthName();
  const nowMonthIdx = Math.max(0, FISCAL_MONTHS.indexOf(nowMonthName));

  const itemStartAbs = item.startFiscalYear * 12 + item.startMonthIndex;
  const itemEndAbsExclusive = itemStartAbs + duration;
  const nowAbs = nowStartYear * 12 + nowMonthIdx;
  const isExpiredByNow = nowAbs >= itemEndAbsExclusive;

  const targetAbs = targetFiscalYear * 12 + targetMonthIndex;
  const isWithinMeyad =
    targetAbs >= itemStartAbs && targetAbs < itemEndAbsExclusive;

  const amtCents = safeToCents(item.amount);
  return {
    activeAmount: isWithinMeyad ? safeFromCents(amtCents) : 0,
    isWithinMeyad,
    isExpiredByNow,
  };
}

export default function SavingsScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const isMobileScreen = screenWidth < 768;
  const visibleColumnsCount = isMobileScreen
    ? 2
    : Math.max(4, Math.floor((screenWidth - 215) / 114));
  const rawRightWidth = Math.max(
    200,
    Math.floor(screenWidth - (isMobileScreen ? 136 : 215))
  );
  const monthColWidth = Math.floor(rawRightWidth / visibleColumnsCount);
  const exactRightViewportWidth = monthColWidth * visibleColumnsCount;
  const descColWidth = Math.max(
    138,
    Math.floor(screenWidth) - exactRightViewportWidth
  );

  const gridSnapOffsets = useMemo(() => {
    const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
    const offsets: number[] = [];
    for (let i = 0; i <= maxStartIndex; i++) {
      offsets.push(i * monthColWidth);
    }
    return offsets;
  }, [monthColWidth, visibleColumnsCount]);

  const monthScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null
  );
  const initialScrollDoneRef = useRef<boolean>(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeGridIndex, setActiveGridIndex] = useState<number>(0);

  const getInitialFiscalStartYear = () => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const [fiscalStartYear, setFiscalStartYear] = useState<number>(
    getInitialFiscalStartYear
  );
  const [plans, setPlans] = useState<SavingsPlanItem[]>([]);
  const [incomeNetByMonth, setIncomeNetByMonth] = useState<{
    [month: string]: number;
  }>(() => {
    const obj: { [month: string]: number } = {};
    FISCAL_MONTHS.forEach((m) => {
      obj[m] = 0;
    });
    return obj;
  });

  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [selectedType, setSelectedType] =
    useState<SavingsCategoryType>('Insurance');
  const [itemName, setItemName] = useState<string>('');
  const [companyNameInput, setCompanyNameInput] = useState<string>('');
  const [policyNoInput, setPolicyNoInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [meyadMonthsInput, setMeyadMonthsInput] = useState<string>('12');
  const [startMonthName, setStartMonthName] = useState<string>(() =>
    getCurrentFiscalMonthName()
  );

  const [deleteTargetPlan, setDeleteTargetPlan] =
    useState<SavingsPlanItem | null>(null);
  const [deleteCheckboxChecked, setDeleteCheckboxChecked] =
    useState<boolean>(false);
  const [deleteConfirmTypedText, setDeleteConfirmTypedText] =
    useState<string>('');

  const fiscalLabel = formatFiscalYearLabel(fiscalStartYear);
  const isLoanEmiSelected = selectedType === 'Loan EMI';

  const syncMonthlySavingsToBudget = useCallback(
    async (startYr: number, planList: SavingsPlanItem[]) => {
      try {
        const affectedFiscalYears = new Set<number>([startYr]);
        planList.forEach((item) => {
          const duration = Math.max(
            1,
            Math.floor(Number(item.durationMonths) || 1)
          );
          const endFiscalYear = Math.floor(
            (item.startFiscalYear * 12 + item.startMonthIndex + duration - 1) /
              12
          );
          for (let yr = item.startFiscalYear; yr <= endFiscalYear; yr++) {
            affectedFiscalYears.add(yr);
          }
        });

        const tasks: Promise<void>[] = [];

        affectedFiscalYears.forEach((yr) => {
          for (let mIdx = 0; mIdx < FISCAL_MONTHS.length; mIdx++) {
            const month = FISCAL_MONTHS[mIdx];
            const ym = getYearMonthForFiscalMonth(month, yr);

            let savingsOnlyCents = 0;
            let loanEmiCents = 0;

            for (const item of planList) {
              const st = getItemStateForMonth(item, yr, mIdx);
              const activeCents = safeToCents(st.activeAmount);
              if (item.type === 'Loan EMI') {
                loanEmiCents += activeCents;
              } else {
                savingsOnlyCents += activeCents;
              }
            }

            const totalCombinedCents = savingsOnlyCents + loanEmiCents;

            tasks.push(
              saveLocalData(`${SAVINGS_MONTH_KEY_PREFIX}${ym}`, {
                yearMonth: ym,
                totalSavings: safeFromCents(totalCombinedCents),
                savingsOnly: safeFromCents(savingsOnlyCents),
                loanEmiTotal: safeFromCents(loanEmiCents),
                updatedAt: new Date().toISOString(),
              })
            );
          }
        });

        await Promise.all(tasks);
      } catch (e) {
        console.log('Failed to sync monthly savings to budget:', e);
      }
    },
    []
  );

  const loadSavingsData = useCallback(
    async (startYr: number) => {
      try {
        const rawPlans = await AsyncStorage.getItem(SAVINGS_ITEMS_KEY);
        const parsedPlans: SavingsPlanItem[] = rawPlans
          ? (JSON.parse(rawPlans) as SavingsPlanItem[])
          : [];
        const validPlans = Array.isArray(parsedPlans) ? parsedPlans : [];
        setPlans(validPlans);

        const netMap: { [month: string]: number } = {};
        for (const month of FISCAL_MONTHS) {
          const { prevMonth, prevFiscalStartYear } =
            getPreviousMonthAndFiscalYear(month, startYr);
          netMap[month] = await getCombinedIncomeForMonth(
            prevMonth,
            prevFiscalStartYear
          );
        }
        setIncomeNetByMonth(netMap);

        await syncMonthlySavingsToBudget(startYr, validPlans);
      } catch (e) {
        console.log('Failed to load savings page:', e);
      }
    },
    [syncMonthlySavingsToBudget]
  );

  useEffect(() => {
    void loadSavingsData(fiscalStartYear);
  }, [fiscalStartYear, loadSavingsData]);

  const snapToGridIndex = useCallback(
    (targetIdx: number, animated = true) => {
      const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
      const clampedIdx = Math.max(0, Math.min(maxStartIndex, targetIdx));
      setActiveGridIndex(clampedIdx);
      monthScrollRef.current?.scrollTo({
        x: clampedIdx * monthColWidth,
        animated,
      });
    },
    [monthColWidth, visibleColumnsCount]
  );

  useEffect(() => {
    if (!initialScrollDoneRef.current && monthColWidth > 0) {
      initialScrollDoneRef.current = true;
      const curMonth = getCurrentFiscalMonthName();
      const idx = FISCAL_MONTHS.indexOf(curMonth);
      if (idx >= 0) {
        setTimeout(() => {
          snapToGridIndex(idx, false);
        }, 60);
      }
    }
  }, [monthColWidth, snapToGridIndex]);

  const handleJumpToCurrentMonth = () => {
    const curMonth = getCurrentFiscalMonthName();
    const idx = FISCAL_MONTHS.indexOf(curMonth);
    if (idx >= 0) {
      snapToGridIndex(idx, true);
    }
  };

  const scheduleGridSnapFromOffset = useCallback(
    (offsetX: number) => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
      }
      snapTimerRef.current = setTimeout(() => {
        if (monthColWidth <= 0) return;
        const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
        const rawRatio = offsetX / monthColWidth;
        const targetIdx = Math.max(
          0,
          Math.min(maxStartIndex, Math.round(rawRatio))
        );
        setActiveGridIndex(targetIdx);

        const exactTargetX = targetIdx * monthColWidth;
        if (Math.abs(offsetX - exactTargetX) > 0.5) {
          monthScrollRef.current?.scrollTo({
            x: exactTargetX,
            animated: true,
          });
        }
      }, 90);
    },
    [monthColWidth, visibleColumnsCount]
  );

  const handleGridScroll = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x || 0;
    scheduleGridSnapFromOffset(offsetX);
  };

  const handleGridScrollEnd = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x || 0;
    scheduleGridSnapFromOffset(offsetX);
  };

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, []);

  const handleAddSavingsPlan = async () => {
    const cleanName = itemName.trim();
    const cleanCompany = companyNameInput.trim();
    const cleanPolicy = policyNoInput.trim();
    const amtCents = safeToCents(amountInput);
    const meyad = Math.max(
      1,
      parseInt(meyadMonthsInput.replace(/[^0-9]/g, ''), 10) || 1
    );

    if (!cleanName) {
      Alert.alert(
        'তথ্য অসম্পূর্ণ',
        'Savings / Policy / Loan EMI-এর নাম লিখুন।'
      );
      return;
    }
    if (amtCents <= 0) {
      Alert.alert('সঠিক পরিমাণ দিন', 'Amount ০-এর বেশি হতে হবে।');
      return;
    }

    try {
      const sIdx = Math.max(0, FISCAL_MONTHS.indexOf(startMonthName));
      const newPlan: SavingsPlanItem = {
        id: `sav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: selectedType,
        name: cleanName,
        companyName: cleanCompany || undefined,
        policyNo: cleanPolicy || undefined,
        amount: safeFromCents(amtCents),
        startFiscalYear: fiscalStartYear,
        startMonthIndex: sIdx,
        durationMonths: meyad,
      };

      const nextPlans = [...plans, newPlan];
      setPlans(nextPlans);
      await saveLocalData(SAVINGS_ITEMS_KEY, nextPlans);
      await syncMonthlySavingsToBudget(fiscalStartYear, nextPlans);

      setItemName('');
      setCompanyNameInput('');
      setPolicyNoInput('');
      setAmountInput('');
      setMeyadMonthsInput('12');
      setAddModalVisible(false);
    } catch (e) {
      console.log('Failed to save new savings plan:', e);
      Alert.alert('ত্রুটি', 'সেভিংস প্ল্যান সেভ করা যায়নি।');
    }
  };

  const openStrictDeleteModal = (plan: SavingsPlanItem) => {
    setDeleteTargetPlan(plan);
    setDeleteCheckboxChecked(false);
    setDeleteConfirmTypedText('');
  };

  const isDeleteConditionMet = useMemo(() => {
    if (!deleteTargetPlan || !deleteCheckboxChecked) return false;
    const typed = deleteConfirmTypedText.trim().toLowerCase();
    const targetNameLower = deleteTargetPlan.name.trim().toLowerCase();
    return (
      typed === 'delete' ||
      (targetNameLower.length > 0 && typed === targetNameLower)
    );
  }, [deleteTargetPlan, deleteCheckboxChecked, deleteConfirmTypedText]);

  const handleConfirmStrictDelete = async () => {
    if (!deleteTargetPlan || !isDeleteConditionMet) return;
    try {
      const remaining = plans.filter((p) => p.id !== deleteTargetPlan.id);
      setPlans(remaining);
      await saveLocalData(SAVINGS_ITEMS_KEY, remaining);
      await syncMonthlySavingsToBudget(fiscalStartYear, remaining);
      setDeleteTargetPlan(null);
      setDeleteCheckboxChecked(false);
      setDeleteConfirmTypedText('');
    } catch (e) {
      console.log('Failed to delete savings plan:', e);
      Alert.alert('ত্রুটি', 'ডিলিট করা যায়নি।');
    }
  };

  const monthlySummary = useMemo(() => {
    const map: {
      [month: string]: {
        incomeNet: number;
        totalSavingsOnly: number;
        totalLoanEmi: number;
        totalDeductions: number;
        balanceAfterSavings: number;
      };
    } = {};

    FISCAL_MONTHS.forEach((month, mIdx) => {
      const incCents = safeToCents(incomeNetByMonth[month]);
      let savOnlyCents = 0;
      let loanEmiCents = 0;

      plans.forEach((item) => {
        const st = getItemStateForMonth(item, fiscalStartYear, mIdx);
        const amtCents = safeToCents(st.activeAmount);
        if (item.type === 'Loan EMI') {
          loanEmiCents += amtCents;
        } else {
          savOnlyCents += amtCents;
        }
      });

      const totalDedCents = savOnlyCents + loanEmiCents;
      const remCents = incCents - totalDedCents;

      map[month] = {
        incomeNet: safeFromCents(incCents),
        totalSavingsOnly: safeFromCents(savOnlyCents),
        totalLoanEmi: safeFromCents(loanEmiCents),
        totalDeductions: safeFromCents(totalDedCents),
        balanceAfterSavings: safeFromCents(remCents),
      };
    });

    return map;
  }, [incomeNetByMonth, plans, fiscalStartYear]);

  const renderMonthCellsForPlan = (plan: SavingsPlanItem) => {
    const isLoan = plan.type === 'Loan EMI';
    return FISCAL_MONTHS.map((month, mIdx) => {
      const st = getItemStateForMonth(plan, fiscalStartYear, mIdx);
      return (
        <View
          key={month}
          style={[
            styles.cell,
            { width: monthColWidth },
            st.isWithinMeyad &&
              (isLoan ? styles.activeLoanCellBg : styles.activeSavingsCellBg),
            !st.isWithinMeyad && styles.inactiveCellBg,
          ]}
        >
          <Text
            style={[
              styles.cellAmountText,
              isLoan && st.isWithinMeyad && { color: '#9A3412' },
              !st.isWithinMeyad && { color: '#94A3B8' },
            ]}
          >
            {st.activeAmount > 0 ? formatMoney(st.activeAmount) : '0.00'}
          </Text>
          <Text
            style={[
              styles.meyadTagText,
              st.isWithinMeyad
                ? { color: isLoan ? '#C2410C' : '#15803D' }
                : { color: '#64748B' },
            ]}
          >
            {st.isWithinMeyad ? `${plan.durationMonths}m` : 'Ended'}
          </Text>
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Savings & Loan EMI ({fiscalLabel})
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Prev Month Income → Next Month • Net - (Savings + EMI)
          </Text>
        </View>

        <TouchableOpacity
          style={styles.nowBtn}
          onPress={handleJumpToCurrentMonth}
        >
          <Text style={styles.nowBtnText}>Now</Text>
        </TouchableOpacity>

        <View style={styles.yearBox}>
          <TouchableOpacity onPress={() => setFiscalStartYear((y) => y - 1)}>
            <Ionicons name="chevron-back" size={18} color="#2563EB" />
          </TouchableOpacity>
          <Text style={styles.yearText}>{fiscalLabel}</Text>
          <TouchableOpacity onPress={() => setFiscalStartYear((y) => y + 1)}>
            <Ionicons name="chevron-forward" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setStartMonthName(getCurrentFiscalMonthName());
            setAddModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
          <Text style={styles.addBtnText}>
            + Add Savings / Policy / Loan EMI
          </Text>
        </TouchableOpacity>

        <View style={styles.gridStepGroup}>
          <TouchableOpacity
            style={styles.gridStepBtn}
            onPress={() => snapToGridIndex(activeGridIndex - 1, true)}
          >
            <Ionicons name="chevron-back" size={16} color="#1E3A8A" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gridStepBtn}
            onPress={() => snapToGridIndex(activeGridIndex + 1, true)}
          >
            <Ionicons name="chevron-forward" size={16} color="#1E3A8A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.verticalScroll}>
        <View style={styles.sheetWrapper}>
          <View style={[styles.fixedColumn, { width: descColWidth }]}>
            <View style={[styles.headerCell, { width: descColWidth }]}>
              <Text style={styles.headerCellText}>Savings / Loan EMI</Text>
            </View>

            <View
              style={[
                styles.summaryCell,
                styles.incomeNetBg,
                { width: descColWidth },
              ]}
            >
              <Text
                style={[styles.summaryTitle, { color: '#1E3A8A' }]}
                numberOfLines={1}
              >
                Income (Prev Mo)
              </Text>
            </View>

            <View
              style={[
                styles.summaryCell,
                styles.totalSavingsBg,
                { width: descColWidth },
              ]}
            >
              <Text
                style={[styles.summaryTitle, { color: '#B91C1C' }]}
                numberOfLines={1}
              >
                Savings (-)
              </Text>
            </View>

            <View
              style={[
                styles.summaryCell,
                styles.totalLoanEmiBg,
                { width: descColWidth },
              ]}
            >
              <Text
                style={[styles.summaryTitle, { color: '#C2410C' }]}
                numberOfLines={1}
              >
                Loan EMI (-)
              </Text>
            </View>

            <View
              style={[
                styles.summaryCell,
                styles.balanceAfterBg,
                { width: descColWidth },
              ]}
            >
              <Text
                style={[styles.summaryTitle, { color: '#15803D' }]}
                numberOfLines={1}
              >
                Net Balance
              </Text>
            </View>

            {plans.length === 0 ? (
              <View style={[styles.emptyFixedBox, { width: descColWidth }]}>
                <Text style={styles.emptyFixedText}>
                  কোনো সেভিংস বা Loan EMI নেই। উপরে + Add দিয়ে যোগ করুন।
                </Text>
              </View>
            ) : (
              plans.map((plan) => {
                const now = new Date();
                const nowStartYear =
                  now.getMonth() >= 6
                    ? now.getFullYear()
                    : now.getFullYear() - 1;
                const nowIdx = Math.max(
                  0,
                  FISCAL_MONTHS.indexOf(getCurrentFiscalMonthName())
                );
                const st = getItemStateForMonth(plan, nowStartYear, nowIdx);
                const isLoan = plan.type === 'Loan EMI';

                const subParts: string[] = [plan.type];
                if (plan.companyName) subParts.push(plan.companyName);
                if (plan.policyNo) subParts.push(`#${plan.policyNo}`);
                subParts.push(`${plan.durationMonths}m`);

                return (
                  <View
                    key={plan.id}
                    style={[
                      styles.descCell,
                      isLoan && styles.loanDescCellBg,
                      { width: descColWidth },
                    ]}
                  >
                    <View style={{ flex: 1, marginRight: 4 }}>
                      <Text
                        style={[
                          styles.descTitle,
                          isLoan && { color: '#9A3412' },
                        ]}
                        numberOfLines={1}
                      >
                        {plan.name}
                      </Text>
                      <Text style={styles.descMeta} numberOfLines={1}>
                        {subParts.join(' • ')}
                        {st.isExpiredByNow ? ' • মেয়াদ শেষ' : ''}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => openStrictDeleteModal(plan)}
                      style={[
                        styles.deleteIconBtn,
                        st.isExpiredByNow && styles.expiredDeleteHighlight,
                      ]}
                      accessibilityLabel="Delete item"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color={st.isExpiredByNow ? '#FFFFFF' : '#DC2626'}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          <View style={{ width: exactRightViewportWidth, overflow: 'hidden' }}>
            <ScrollView
              ref={monthScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToOffsets={gridSnapOffsets}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum={true}
              scrollEventThrottle={16}
              onScroll={handleGridScroll}
              onMomentumScrollEnd={handleGridScrollEnd}
              onScrollEndDrag={handleGridScrollEnd}
            >
              <View>
                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => {
                    const calYear = getMonthCalendarYear(
                      month,
                      fiscalStartYear
                    );
                    const isCurrent = month === getCurrentFiscalMonthName();
                    return (
                      <View
                        key={month}
                        style={[
                          styles.headerCell,
                          { width: monthColWidth },
                          isCurrent && styles.currentMonthHeader,
                        ]}
                      >
                        <Text style={styles.headerCellText} numberOfLines={1}>
                          {month.slice(0, 3)} {String(calYear).slice(-2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => {
                    const { prevMonth } = getPreviousMonthAndFiscalYear(
                      month,
                      fiscalStartYear
                    );
                    return (
                      <View
                        key={month}
                        style={[
                          styles.summaryCell,
                          styles.incomeNetBg,
                          { width: monthColWidth },
                        ]}
                      >
                        <Text
                          style={[styles.summaryValue, { color: '#1E3A8A' }]}
                        >
                          {formatMoney(monthlySummary[month]?.incomeNet || 0)}
                        </Text>
                        <Text style={styles.prevMonthHintText}>
                          from {prevMonth.slice(0, 3)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[
                        styles.summaryCell,
                        styles.totalSavingsBg,
                        { width: monthColWidth },
                      ]}
                    >
                      <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>
                        -
                        {formatMoney(
                          monthlySummary[month]?.totalSavingsOnly || 0
                        )}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[
                        styles.summaryCell,
                        styles.totalLoanEmiBg,
                        { width: monthColWidth },
                      ]}
                    >
                      <Text style={[styles.summaryValue, { color: '#C2410C' }]}>
                        -{formatMoney(monthlySummary[month]?.totalLoanEmi || 0)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => {
                    const bal = monthlySummary[month]?.balanceAfterSavings || 0;
                    return (
                      <View
                        key={month}
                        style={[
                          styles.summaryCell,
                          styles.balanceAfterBg,
                          { width: monthColWidth },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: bal >= 0 ? '#15803D' : '#B91C1C' },
                          ]}
                        >
                          {formatMoney(bal)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {plans.length === 0 ? (
                  <View
                    style={[
                      styles.emptyGridBox,
                      { width: monthColWidth * FISCAL_MONTHS.length },
                    ]}
                  >
                    <Text style={styles.emptyFixedText}>—</Text>
                  </View>
                ) : (
                  plans.map((plan) => (
                    <View key={plan.id} style={styles.row}>
                      {renderMonthCellsForPlan(plan)}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              নতুন Savings / Policy / Loan EMI যুক্ত করুন
            </Text>

            <Text style={styles.inputLabel}>ধরন (Type)</Text>
            <View style={styles.typeRow}>
              {(
                [
                  'Insurance',
                  'DPS',
                  'Loan EMI',
                  'Others',
                ] as SavingsCategoryType[]
              ).map((tp) => (
                <TouchableOpacity
                  key={tp}
                  style={[
                    styles.typeChip,
                    selectedType === tp &&
                      (tp === 'Loan EMI'
                        ? styles.typeChipLoanActive
                        : styles.typeChipActive),
                  ]}
                  onPress={() => setSelectedType(tp)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      selectedType === tp && styles.typeChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tp}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>
              {isLoanEmiSelected
                ? 'Loan / EMI Name *'
                : 'Savings / Policy / Scheme Name *'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                isLoanEmiSelected
                  ? 'e.g. Home Loan, Bike Loan, Personal Loan...'
                  : 'e.g. Jibon Bima Policy, Monthly DPS...'
              }
              value={itemName}
              onChangeText={setItemName}
            />

            <Text style={styles.inputLabel}>
              {isLoanEmiSelected
                ? 'Bank / Lender Name (Optional)'
                : 'Company Name (Optional)'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                isLoanEmiSelected
                  ? 'e.g. Sonali Bank, DBBL, BRAC Bank (ঐচ্ছিক)'
                  : 'e.g. MetLife, DBBL, Islami Bank (ঐচ্ছিক)'
              }
              value={companyNameInput}
              onChangeText={setCompanyNameInput}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={styles.inputLabel}>
                  {isLoanEmiSelected ? 'Loan A/C No.' : 'Policy No.'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={
                    isLoanEmiSelected ? 'e.g. LN-45821' : 'e.g. POL-984512'
                  }
                  value={policyNoInput}
                  onChangeText={setPolicyNoInput}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>
                  {isLoanEmiSelected ? 'Monthly EMI (Tk.) *' : 'Amount (Tk.) *'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  value={amountInput}
                  onChangeText={setAmountInput}
                />
              </View>
            </View>

            <View
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
            >
              <View style={{ flex: 0.85 }}>
                <Text style={styles.inputLabel}>
                  {isLoanEmiSelected ? 'কিস্তি (মাস)' : 'মেয়াদ (মাস)'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  placeholder="12"
                  value={meyadMonthsInput}
                  onChangeText={setMeyadMonthsInput}
                />
              </View>

              <View style={{ flex: 1.35 }}>
                <Text style={styles.inputLabel}>শুরুর মাস</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 6 }}
                >
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {FISCAL_MONTHS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setStartMonthName(m)}
                        style={[
                          styles.monthChip,
                          startMonthName === m && styles.monthChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.monthChipText,
                            startMonthName === m && styles.monthChipTextActive,
                          ]}
                        >
                          {m.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: isLoanEmiSelected ? '#EA580C' : '#16A34A',
                  },
                ]}
                onPress={() => void handleAddSavingsPlan()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTargetPlan)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>
              কঠিন ডিলিট নিশ্চিতকরণ (Strict Delete)
            </Text>

            {deleteTargetPlan && (
              <View style={styles.deleteSummaryBox}>
                <Text style={styles.deletePlanName}>
                  Name: {deleteTargetPlan.name} ({deleteTargetPlan.type})
                </Text>
                {deleteTargetPlan.companyName ? (
                  <Text style={styles.deletePlanSub}>
                    {deleteTargetPlan.type === 'Loan EMI'
                      ? 'Bank/Lender'
                      : 'Company'}
                    : {deleteTargetPlan.companyName}
                  </Text>
                ) : null}
                {deleteTargetPlan.policyNo ? (
                  <Text style={styles.deletePlanSub}>
                    {deleteTargetPlan.type === 'Loan EMI'
                      ? 'Loan A/C'
                      : 'Policy No.'}
                    : {deleteTargetPlan.policyNo}
                  </Text>
                ) : null}
                <Text style={styles.deletePlanSub}>
                  Amount: {formatMoney(deleteTargetPlan.amount)} Tk. • Meyad:{' '}
                  {deleteTargetPlan.durationMonths} months
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.strictCheckRow}
              onPress={() => setDeleteCheckboxChecked((prev) => !prev)}
            >
              <Ionicons
                name={deleteCheckboxChecked ? 'checkbox' : 'square-outline'}
                size={22}
                color="#DC2626"
              />
              <Text style={styles.strictCheckText}>
                আমি বুঝতে পারছি যে মেয়াদ শেষে বা ডিলিট করলে এই রেকর্ডটি
                স্থায়ীভাবে মুছে যাবে।
              </Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>
              নিশ্চিত করতে &ldquo;{deleteTargetPlan?.name}&rdquo; অথবা
              &ldquo;DELETE&rdquo; লিখুন:
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder='Type "DELETE" or exact name'
              value={deleteConfirmTypedText}
              onChangeText={setDeleteConfirmTypedText}
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => {
                  setDeleteTargetPlan(null);
                  setDeleteCheckboxChecked(false);
                  setDeleteConfirmTypedText('');
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!isDeleteConditionMet}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: isDeleteConditionMet
                      ? '#DC2626'
                      : '#FCA5A5',
                  },
                ]}
                onPress={() => void handleConfirmStrictDelete()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  Permanent Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 5,
  },
  backBtn: {
    padding: 3,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 10,
    color: '#64748B',
  },
  nowBtn: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
  },
  nowBtnText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 11,
  },
  yearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 2,
  },
  yearText: {
    fontWeight: '700',
    color: '#1E40AF',
    fontSize: 12,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  gridStepGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  gridStepBtn: {
    width: 30,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalScroll: {
    flex: 1,
  },
  sheetWrapper: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },
  fixedColumn: {
    borderRightWidth: 2,
    borderRightColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  row: {
    flexDirection: 'row',
  },
  headerCell: {
    height: 42,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    paddingHorizontal: 4,
  },
  currentMonthHeader: {
    backgroundColor: '#1D4ED8',
  },
  headerCellText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
    textAlign: 'center',
  },
  summaryCell: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#94A3B8',
  },
  incomeNetBg: {
    backgroundColor: '#DBEAFE',
  },
  totalSavingsBg: {
    backgroundColor: '#FEE2E2',
  },
  totalLoanEmiBg: {
    backgroundColor: '#FFEDD5',
  },
  balanceAfterBg: {
    backgroundColor: '#DCFCE7',
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  prevMonthHintText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#1D4ED8',
    textAlign: 'right',
    marginTop: 1,
  },
  descCell: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  loanDescCellBg: {
    backgroundColor: '#FFF7ED',
  },
  descTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  descMeta: {
    fontSize: 9.5,
    color: '#475569',
    marginTop: 1,
  },
  deleteIconBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  expiredDeleteHighlight: {
    backgroundColor: '#DC2626',
  },
  cell: {
    height: 54,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  activeSavingsCellBg: {
    backgroundColor: '#FFFFFF',
  },
  activeLoanCellBg: {
    backgroundColor: '#FFFBEB',
  },
  inactiveCellBg: {
    backgroundColor: '#F8FAFC',
  },
  cellAmountText: {
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  meyadTagText: {
    textAlign: 'right',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  emptyFixedBox: {
    height: 70,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  emptyGridBox: {
    height: 70,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  emptyFixedText: {
    fontSize: 11,
    color: '#64748B',
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
    maxWidth: 450,
    width: '100%',
    alignSelf: 'center',
    gap: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  typeChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  typeChipLoanActive: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 6,
  },
  monthChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  monthChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  deleteSummaryBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    gap: 2,
  },
  deletePlanName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  deletePlanSub: {
    fontSize: 11.5,
    color: '#7F1D1D',
  },
  strictCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  strictCheckText: {
    flex: 1,
    fontSize: 11.5,
    color: '#334155',
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