import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  getBudgetShopDebtLink,
  getPrevYearMonth,
  MonthlyDebtRecord,
  saveShopDebtPaymentFromBudget
} from '../utils/shopDebtBudgetSync';

export type AppLanguage = 'en' | 'bn';

interface ShopProfile {
  id: string;
  name: string;
}

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

const BENGALI_MONTH_MAP: Record<string, string> = {
  January: 'জানুয়ারী',
  February: 'ফেব্রুয়ারি',
  March: 'মার্চ',
  April: 'এপ্রিল',
  May: 'মে',
  June: 'জুন',
  July: 'জুলাই',
  August: 'আগস্ট',
  September: 'সেপ্টেম্বর',
  October: 'অক্টোবর',
  November: 'নভেম্বর',
  December: 'ডিসেম্বর',
};

interface BudgetCategoryRow {
  id: string;
  enName: string;
  bnName: string;
  isShopDebtRow?: boolean;
  linkedShopId?: string;
  amounts: { [month: string]: number };
  cleared: { [month: string]: boolean };
}

interface MonthlyBudgetStorage {
  yearMonth: string;
  shopDebtPaid: number;
  rowAmounts: { [rowId: string]: number };
  rowCleared: { [rowId: string]: boolean };
  updatedAt: string;
}

const BUDGET_MONTH_KEY_PREFIX = '@mybudget_budget_v3_';
const BUDGET_ROWS_META_KEY = '@mybudget_budget_rows_meta_v3';
const SAVINGS_MONTH_KEY_PREFIX = '@mybudget_savings_monthly_v1_';
const LANGUAGE_STORAGE_KEY = '@mybudget_app_language_v1';
const SHOPS_LIST_KEY = '@mybudget_debt_shops_v2';

const DEFAULT_SHOPS: ShopProfile[] = [
  { id: 'shop-ab-hakim', name: 'Ab. Hakim' },
  { id: 'shop-ab-karim', name: 'Ab. Karim' },
];

const UI_TEXT = {
  en: {
    budgetTitle: 'Budget',
    particulars: 'Particulars',
    netSavings: 'Net Savings',
    totalBudget: 'Total Budget',
    extraGhatti: 'Extra / Ghatti',
    addCategory: '+ Add Item',
    now: 'Now',
    settingsTitle: 'Language & Settings',
    selectLanguage: 'Select Display Language',
    english: 'English',
    bangla: 'বাংলা (Bangla)',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
    confirm: 'Confirm',
    deleteItem: 'Delete Item',
    deleteConfirm: 'Are you sure you want to delete this budget item?',
    editItemTitle: 'Edit Budget Item',
    addItemTitle: 'Add New Budget Item',
    itemNameLabel: 'Item Name',
    amountLabel: 'Amount (Tk.)',
    applyForwardLabel: 'Apply to remaining months up to June',
    missingName: 'Please enter a budget item name.',
    shopDebtSyncHint: 'Shop-wise Debt auto-linked • Current & Next Grid',
    billStatusLabel: 'Bill Payment Status',
    clearedBadge: 'Cleared',
    markClearedBtn: 'Mark Bill Cleared',
    unmarkClearedBtn: 'Unmark Cleared Bill',
    confirmMarkCleared: 'Confirm: Mark this bill as CLEARED (color-marked)?',
    confirmUnmarkCleared: 'Confirm: Remove CLEARED color mark from this bill?',
  },
  bn: {
    budgetTitle: 'বাজেট',
    particulars: 'খাত / বিবরণ',
    netSavings: 'নেট সেভিংস',
    totalBudget: 'মোট বাজেট',
    extraGhatti: 'এক্সট্রা / ঘাটতি',
    addCategory: '+ খাত যোগ',
    now: 'বর্তমান',
    settingsTitle: 'ভাষা ও সেটিংস',
    selectLanguage: 'ভাষা নির্বাচন করুন',
    english: 'English',
    bangla: 'বাংলা (Bangla)',
    close: 'বন্ধ করুন',
    cancel: 'বাতিল',
    save: 'সেভ করুন',
    add: 'যোগ করুন',
    confirm: 'নিশ্চিত করুন',
    deleteItem: 'খাত মুছুন',
    deleteConfirm: 'আপনি কি এই বাজেট খাতটি মুছে ফেলতে চান?',
    editItemTitle: 'বাজেট পরিমাণ ও বিল স্ট্যাটাস',
    addItemTitle: 'নতুন বাজেট খাত যোগ করুন',
    itemNameLabel: 'খাতের নাম',
    amountLabel: 'টাকার পরিমাণ',
    applyForwardLabel: 'জুন পর্যন্ত পরবর্তী মাসগুলোতেও প্রযোজ্য হবে',
    missingName: 'অনুগ্রহ করে খাতের নাম লিখুন।',
    shopDebtSyncHint: 'দোকানভিত্তিক Shop Debt খাত যুক্ত • Current ও Next গ্রিড',
    billStatusLabel: 'বিল পরিশোধের অবস্থা',
    clearedBadge: 'Cleared',
    markClearedBtn: 'বিল ক্লিয়ার মার্ক করুন',
    unmarkClearedBtn: 'ক্লিয়ার মার্ক বাতিল করুন',
    confirmMarkCleared: 'নিশ্চিত করুন: এই খাতের বিলটি কি ক্লিয়ার (রঙ মার্ক) হয়েছে?',
    confirmUnmarkCleared: 'নিশ্চিত করুন: এই খাতের ক্লিয়ার রঙ মার্ক কি তুলে নেবেন?',
  },
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

function buildEmptyMonthMap(): { [month: string]: number } {
  const map: { [month: string]: number } = {};
  FISCAL_MONTHS.forEach((m) => {
    map[m] = 0;
  });
  return map;
}

function buildEmptyClearedMap(): { [month: string]: boolean } {
  const map: { [month: string]: boolean } = {};
  FISCAL_MONTHS.forEach((m) => {
    map[m] = false;
  });
  return map;
}

function getShopMonthStorageKey(shopId: string, yearMonth: string): string {
  if (shopId === 'shop-ab-hakim') {
    return `@mybudget_shop_debt_v2_hakim_${yearMonth}`;
  }
  return `@mybudget_shop_debt_v2_${shopId}_${yearMonth}`;
}

function getBudgetRowIdForShop(shopId: string): string {
  if (shopId === 'shop-ab-hakim') return 'cat-hakim-debt';
  return `cat-debt-${shopId}`;
}

const BASE_NON_DEBT_CATEGORIES: BudgetCategoryRow[] = [
  {
    id: 'cat-daily-market',
    enName: 'Daily Market Expense',
    bnName: 'দৈনিক বাজার খরচ',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-other-market',
    enName: 'Other Market Expense',
    bnName: 'অন্যান্য বাজার খরচ',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-bkash-in',
    enName: 'bKash In (Elec, Water, Net & Mob)',
    bnName: 'বিকাশ ইন (বিদ্যুৎ, পানি, ইন্টারনেট ও মোবাইল বিল)',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-bike-fuel',
    enName: 'Bike Fuel',
    bnName: 'বাইকের তেল',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-net-mob',
    enName: 'Internet & Mobile Bill',
    bnName: 'ইন্টারনেট ও মোবাইল বিল',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-mosque',
    enName: 'Monthly Mosque Donation',
    bnName: 'মসজিদের মাসিক দান',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-rika-pocket',
    enName: "Rika's Pocket Money",
    bnName: 'রিকার হাত খরচা',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-children-edu',
    enName: "Children's Education",
    bnName: 'সন্তানদের শিক্ষাব্যয়',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-qurbani-savings',
    enName: 'Qurbani Savings - Office',
    bnName: 'কুরবাণীর সঞ্চয় - অফিস',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-eid-meat',
    enName: 'Eid Meat',
    bnName: 'ঈদের মাংস',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-office-food',
    enName: 'Office Food Bill',
    bnName: 'অফিসে খাবারের বিল',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-water-bill',
    enName: 'Water Bill',
    bnName: 'পানির বিল',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-arabic-tuition',
    enName: 'Arabic Tuition Fee',
    bnName: 'আরবি পড়ার বেতন',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
  {
    id: 'cat-others',
    enName: 'Others',
    bnName: 'অন্যান্য',
    amounts: buildEmptyMonthMap(),
    cleared: buildEmptyClearedMap(),
  },
];

async function getIncomeNetPayForMonth(
  month: string,
  fiscalStartYear: number
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(
      `@income_fy_${fiscalStartYear}_${fiscalStartYear + 1}`
    );
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;

    let basicCents = 0;
    const basicRow = (parsed as any[]).find(
      (r) =>
        r &&
        !r.hidden &&
        (r.isBasic || String(r.description || '').trim().toLowerCase() === 'net basic')
    );
    if (basicRow?.cells?.[month]) {
      basicCents = safeToCents(basicRow.cells[month].value);
    }

    let incomeCents = 0;
    let deductionCents = 0;

    (parsed as any[]).forEach((row) => {
      if (!row || row.hidden) return;
      const cell = row.cells?.[month];
      if (!cell) return;
      const val = Number(cell.value) || 0;
      if (val === 0) return;

      const amtCents =
        cell.mode === 'percent' ? Math.round((basicCents * val) / 100) : safeToCents(val);

      if (row.type === 'deduction') {
        deductionCents += amtCents;
      } else {
        incomeCents += amtCents;
      }
    });

    return safeFromCents(incomeCents - deductionCents);
  } catch {
    return 0;
  }
}

async function getSavingsForYearMonth(yearMonth: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${SAVINGS_MONTH_KEY_PREFIX}${yearMonth}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { totalSavings?: number; amount?: number };
    const val = parsed.totalSavings !== undefined ? parsed.totalSavings : parsed.amount;
    return Math.max(0, safeFromCents(safeToCents(val)));
  } catch {
    return 0;
  }
}

export default function BudgetScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [lang, setLang] = useState<AppLanguage>('en');
  const [settingsModalVisible, setSettingsModalVisible] = useState<boolean>(false);

  const t = UI_TEXT[lang];

  const isMobileScreen = screenWidth < 768;
  const visibleColumnsCount = isMobileScreen
    ? 2
    : Math.max(4, Math.floor((screenWidth - 215) / 114));
  const rawRightWidth = Math.max(200, Math.floor(screenWidth - (isMobileScreen ? 136 : 215)));
  const monthColWidth = Math.floor(rawRightWidth / visibleColumnsCount);
  const exactRightViewportWidth = monthColWidth * visibleColumnsCount;
  const descColWidth = Math.max(130, Math.floor(screenWidth) - exactRightViewportWidth);

  const gridSnapOffsets = useMemo(() => {
    const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
    const offsets: number[] = [];
    for (let i = 0; i <= maxStartIndex; i++) {
      offsets.push(i * monthColWidth);
    }
    return offsets;
  }, [monthColWidth, visibleColumnsCount]);

  const monthScrollRef = useRef<ScrollView | null>(null);
  const initialScrollDoneRef = useRef<boolean>(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeGridIndex, setActiveGridIndex] = useState<number>(0);

  const getInitialFiscalStartYear = () => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const [fiscalStartYear, setFiscalStartYear] = useState<number>(getInitialFiscalStartYear);
  const [rows, setRows] = useState<BudgetCategoryRow[]>([]);

  const [monthNetSavings, setMonthNetSavings] = useState<{ [month: string]: number }>(() => {
    const obj: { [month: string]: number } = {};
    FISCAL_MONTHS.forEach((m) => {
      obj[m] = 0;
    });
    return obj;
  });

  // Add Row Modal
  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [newRowName, setNewRowName] = useState<string>('');
  const [newRowAmount, setNewRowAmount] = useState<string>('');
  const [newRowStartMonth, setNewRowStartMonth] = useState<string>(() =>
    getCurrentFiscalMonthName()
  );

  // Edit Cell Modal
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingRow, setEditingRow] = useState<BudgetCategoryRow | null>(null);
  const [editingMonth, setEditingMonth] = useState<string>('July');
  const [editAmountText, setEditAmountText] = useState<string>('0');
  const [editClearedState, setEditClearedState] = useState<boolean>(false);
  const [applyForward, setApplyForward] = useState<boolean>(false);

  const fiscalLabel = formatFiscalYearLabel(fiscalStartYear);

  useEffect(() => {
    const loadLang = async () => {
      try {
        const savedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLang === 'bn' || savedLang === 'en') {
          setLang(savedLang);
        }
      } catch {
        // default en
      }
    };
    loadLang();
  }, []);

  const handleChangeLanguage = async (nextLang: AppLanguage) => {
    setLang(nextLang);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }
  };

  const getRowDisplayName = (row: BudgetCategoryRow): string => {
    return lang === 'bn' ? row.bnName || row.enName : row.enName || row.bnName;
  };

  const getMonthDisplayLabel = (month: string, calYear: number): string => {
    const mLabel = lang === 'bn' ? BENGALI_MONTH_MAP[month] || month : month.slice(0, 3);
    return `${mLabel} ${String(calYear).slice(-2)}`;
  };

  // Shop Debt-এর সব দোকানের নাম অনুযায়ী বাজেট তালিকায় খাত সিঙ্ক ও লোড করা
  const loadFullYearBudget = useCallback(async (startYr: number) => {
    try {
      const [shopsRaw, metaRaw] = await Promise.all([
        AsyncStorage.getItem(SHOPS_LIST_KEY),
        AsyncStorage.getItem(BUDGET_ROWS_META_KEY),
      ]);

      const shopList: ShopProfile[] = shopsRaw
        ? (JSON.parse(shopsRaw) as ShopProfile[])
        : DEFAULT_SHOPS;

      const validShops =
        Array.isArray(shopList) && shopList.length > 0 ? shopList : DEFAULT_SHOPS;
      const validShopIdsSet = new Set(validShops.map((s) => s.id));

      let baseRows: BudgetCategoryRow[] = [];

      if (metaRaw) {
        const parsedMeta = JSON.parse(metaRaw) as BudgetCategoryRow[];
        if (Array.isArray(parsedMeta) && parsedMeta.length > 0) {
          // মুছে ফেলা দোকানের পুরোনো রো বাদ দিয়ে বাকিগুলো রাখা
          baseRows = parsedMeta
            .filter((m) => {
              if (!m.isShopDebtRow) return true;
              const sId = m.linkedShopId || 'shop-ab-hakim';
              return validShopIdsSet.has(sId);
            })
            .map((m) => ({
              id: m.id,
              enName: m.enName || m.bnName || 'Item',
              bnName: m.bnName || m.enName || 'খাত',
              isShopDebtRow: Boolean(m.isShopDebtRow),
              linkedShopId: m.linkedShopId || (m.isShopDebtRow ? 'shop-ab-hakim' : undefined),
              amounts: buildEmptyMonthMap(),
              cleared: buildEmptyClearedMap(),
            }));
        }
      }

      if (baseRows.length === 0) {
        baseRows = BASE_NON_DEBT_CATEGORIES.map((r) => ({
          ...r,
          amounts: buildEmptyMonthMap(),
          cleared: buildEmptyClearedMap(),
        }));
      }

      // প্রতিটি দোকানের জন্য বাজেট তালিকায় খাত নিশ্চিত করা (না থাকলে যুক্ত হবে, নাম বদলালে আপডেট হবে)
      validShops.forEach((shop) => {
        const rowId = getBudgetRowIdForShop(shop.id);
        const existingIdx = baseRows.findIndex(
          (r) => r.id === rowId || (r.isShopDebtRow && r.linkedShopId === shop.id)
        );
        const enTitle = `${shop.name}'s Debt`;
        const bnTitle = `${shop.name}-এর ধার`;

        if (existingIdx >= 0) {
          baseRows[existingIdx] = {
            ...baseRows[existingIdx],
            id: rowId,
            enName: enTitle,
            bnName: bnTitle,
            isShopDebtRow: true,
            linkedShopId: shop.id,
          };
        } else {
          // ২য় অবস্থানে (Daily Market-এর পর) দোকানের ধার খাতটি যুক্ত করা
          const insertPos = Math.min(2, baseRows.length);
          baseRows.splice(insertPos, 0, {
            id: rowId,
            enName: enTitle,
            bnName: bnTitle,
            isShopDebtRow: true,
            linkedShopId: shop.id,
            amounts: buildEmptyMonthMap(),
            cleared: buildEmptyClearedMap(),
          });
        }
      });

      const netSavMap: { [month: string]: number } = {};

      for (const month of FISCAL_MONTHS) {
        const ym = getYearMonthForFiscalMonth(month, startYr);
        const prevYM = getPrevYearMonth(ym);

        const [netPay, savingsAmt, budgetRaw] = await Promise.all([
          getIncomeNetPayForMonth(month, startYr),
          getSavingsForYearMonth(ym),
          AsyncStorage.getItem(`${BUDGET_MONTH_KEY_PREFIX}${ym}`),
        ]);

        const netSavCents = safeToCents(netPay) - safeToCents(savingsAmt);
        netSavMap[month] = safeFromCents(netSavCents);

        const parsedMonth: Partial<MonthlyBudgetStorage> = budgetRaw
          ? (JSON.parse(budgetRaw) as Partial<MonthlyBudgetStorage>)
          : {};

        for (const row of baseRows) {
          row.cleared[month] = Boolean(parsedMonth.rowCleared?.[row.id]);

          if (row.isShopDebtRow && row.linkedShopId) {
            const [prevShopRaw, curShopRaw, legacyLink] = await Promise.all([
              AsyncStorage.getItem(getShopMonthStorageKey(row.linkedShopId, prevYM)),
              AsyncStorage.getItem(getShopMonthStorageKey(row.linkedShopId, ym)),
              row.linkedShopId === 'shop-ab-hakim'
                ? getBudgetShopDebtLink(ym)
                : Promise.resolve(null),
            ]);

            const prevRec: Partial<MonthlyDebtRecord> = prevShopRaw
              ? (JSON.parse(prevShopRaw) as Partial<MonthlyDebtRecord>)
              : {};
            const curRec: Partial<MonthlyDebtRecord> = curShopRaw
              ? (JSON.parse(curShopRaw) as Partial<MonthlyDebtRecord>)
              : {};

            const carryoverCents =
              safeToCents(prevRec.totalBalanceDue) > 0
                ? safeToCents(prevRec.totalBalanceDue)
                : safeToCents(curRec.prevMonthCarryover) > 0
                ? safeToCents(curRec.prevMonthCarryover)
                : safeToCents(legacyLink?.carryoverDebtFromPrevMonth);

            const savedCellValCents =
              parsedMonth.rowAmounts?.[row.id] !== undefined
                ? safeToCents(parsedMonth.rowAmounts[row.id])
                : 0;

            row.amounts[month] =
              savedCellValCents > 0
                ? safeFromCents(savedCellValCents)
                : safeFromCents(carryoverCents);
          } else {
            row.amounts[month] = safeFromCents(safeToCents(parsedMonth.rowAmounts?.[row.id]));
          }
        }
      }

      setMonthNetSavings(netSavMap);
      setRows(baseRows);
    } catch (e) {
      console.log('Failed to load budget sheet:', e);
    }
  }, []);

  useEffect(() => {
    loadFullYearBudget(fiscalStartYear);
  }, [fiscalStartYear, loadFullYearBudget]);

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
    if (!initialScrollDoneRef.current && monthColWidth > 0 && rows.length > 0) {
      initialScrollDoneRef.current = true;
      const curMonth = getCurrentFiscalMonthName();
      const idx = FISCAL_MONTHS.indexOf(curMonth);
      if (idx >= 0) {
        setTimeout(() => {
          snapToGridIndex(idx, false);
        }, 60);
      }
    }
  }, [monthColWidth, rows.length, snapToGridIndex]);

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
        const targetIdx = Math.max(0, Math.min(maxStartIndex, Math.round(rawRatio)));
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

  const persistRowsAndMonths = useCallback(
    async (updatedRows: BudgetCategoryRow[], touchedMonths: string[]) => {
      setRows(updatedRows);

      const metaPayload = updatedRows.map((r) => ({
        id: r.id,
        enName: r.enName,
        bnName: r.bnName,
        isShopDebtRow: Boolean(r.isShopDebtRow),
        linkedShopId: r.linkedShopId,
        amounts: buildEmptyMonthMap(),
        cleared: buildEmptyClearedMap(),
      }));
      await AsyncStorage.setItem(BUDGET_ROWS_META_KEY, JSON.stringify(metaPayload));

      for (const month of touchedMonths) {
        const ym = getYearMonthForFiscalMonth(month, fiscalStartYear);
        const amountsMap: { [rowId: string]: number } = {};
        const clearedMap: { [rowId: string]: boolean } = {};
        let totalShopDebtVal = 0;

        updatedRows.forEach((r) => {
          const val = safeFromCents(safeToCents(r.amounts[month]));
          amountsMap[r.id] = val;
          clearedMap[r.id] = Boolean(r.cleared[month]);
          if (r.isShopDebtRow) {
            totalShopDebtVal += val;
          }
        });

        const payload: MonthlyBudgetStorage = {
          yearMonth: ym,
          shopDebtPaid: totalShopDebtVal,
          rowAmounts: amountsMap,
          rowCleared: clearedMap,
          updatedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(`${BUDGET_MONTH_KEY_PREFIX}${ym}`, JSON.stringify(payload));
        await saveShopDebtPaymentFromBudget(ym, totalShopDebtVal);
      }
    },
    [fiscalStartYear]
  );

  const monthlySummary = useMemo(() => {
    const map: {
      [month: string]: {
        netSavings: number;
        totalBudget: number;
        extraOrGhatti: number;
      };
    } = {};

    FISCAL_MONTHS.forEach((month) => {
      const netSavCents = safeToCents(monthNetSavings[month]);
      let totalBudgetCents = 0;

      rows.forEach((r) => {
        totalBudgetCents += safeToCents(r.amounts[month]);
      });

      const diffCents = netSavCents - totalBudgetCents;

      map[month] = {
        netSavings: safeFromCents(netSavCents),
        totalBudget: safeFromCents(totalBudgetCents),
        extraOrGhatti: safeFromCents(diffCents),
      };
    });

    return map;
  }, [rows, monthNetSavings]);

  const openEditCellModal = (row: BudgetCategoryRow, month: string) => {
    setEditingRow(row);
    setEditingMonth(month);
    setEditAmountText(String(row.amounts[month] || 0));
    setEditClearedState(Boolean(row.cleared[month]));
    setApplyForward(false);
    setEditModalVisible(true);
  };

  const handleRequestToggleClearedWithConfirm = () => {
    const nextState = !editClearedState;
    const message = nextState ? t.confirmMarkCleared : t.confirmUnmarkCleared;

    const applyToggle = () => {
      setEditClearedState(nextState);
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(message) : true;
      if (ok) applyToggle();
    } else {
      Alert.alert(t.confirm, message, [
        { text: t.cancel, style: 'cancel' },
        { text: t.confirm, onPress: applyToggle },
      ]);
    }
  };

  const handleSaveCell = async () => {
    if (!editingRow) return;
    const val = safeFromCents(Math.max(0, safeToCents(editAmountText)));
    const startIdx = FISCAL_MONTHS.indexOf(editingMonth);
    const affectedMonths: string[] = [];

    const updated = rows.map((r) => {
      if (r.id !== editingRow.id) return r;
      const nextAmounts = { ...r.amounts };
      const nextCleared = { ...r.cleared };

      if (applyForward && startIdx >= 0) {
        for (let i = startIdx; i < FISCAL_MONTHS.length; i++) {
          const m = FISCAL_MONTHS[i];
          nextAmounts[m] = val;
          nextCleared[m] = editClearedState;
          affectedMonths.push(m);
        }
      } else {
        nextAmounts[editingMonth] = val;
        nextCleared[editingMonth] = editClearedState;
        affectedMonths.push(editingMonth);
      }

      return { ...r, amounts: nextAmounts, cleared: nextCleared };
    });

    setEditModalVisible(false);
    await persistRowsAndMonths(updated, affectedMonths);
  };

  const handleAddRow = async () => {
    const cleanName = newRowName.trim();
    if (!cleanName) {
      Alert.alert(t.missingName);
      return;
    }

    const amt = safeFromCents(Math.max(0, safeToCents(newRowAmount)));
    const newRow: BudgetCategoryRow = {
      id: `b-item-${Date.now()}`,
      enName: cleanName,
      bnName: cleanName,
      amounts: buildEmptyMonthMap(),
      cleared: buildEmptyClearedMap(),
    };
    newRow.amounts[newRowStartMonth] = amt;

    const updated = [...rows, newRow];
    setNewRowName('');
    setNewRowAmount('');
    setAddModalVisible(false);
    await persistRowsAndMonths(updated, [newRowStartMonth]);
  };

  const handleDeleteRow = async (rowId: string) => {
    const confirmDelete = async () => {
      const updated = rows.filter((r) => r.id !== rowId);
      await persistRowsAndMonths(updated, FISCAL_MONTHS);
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(t.deleteConfirm) : true;
      if (ok) await confirmDelete();
    } else {
      Alert.alert(t.deleteItem, t.deleteConfirm, [
        { text: t.cancel, style: 'cancel' },
        { text: t.deleteItem, style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const renderMonthCellsForRow = (row: BudgetCategoryRow) => {
    return FISCAL_MONTHS.map((month) => {
      const val = safeFromCents(safeToCents(row.amounts[month]));
      const isCleared = Boolean(row.cleared[month]);

      return (
        <TouchableOpacity
          key={month}
          activeOpacity={0.75}
          onPress={() => openEditCellModal(row, month)}
          style={[
            styles.cell,
            { width: monthColWidth },
            row.isShopDebtRow && !isCleared && styles.debtHighlightCell,
            isCleared && styles.clearedCellMark,
          ]}
        >
          <Text
            style={[
              styles.cellValueText,
              isCleared && { color: '#14532D', fontWeight: '700' },
            ]}
          >
            {val > 0 ? formatMoney(val) : '0.00'}
          </Text>
          {isCleared && (
            <View style={styles.clearedPill}>
              <Ionicons name="checkmark-circle" size={10} color="#15803D" />
              <Text style={styles.clearedPillText}>{t.clearedBadge}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {t.budgetTitle} ({fiscalLabel})
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {t.shopDebtSyncHint}
          </Text>
        </View>

        <TouchableOpacity style={styles.nowBtn} onPress={handleJumpToCurrentMonth}>
          <Text style={styles.nowBtnText}>{t.now}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setSettingsModalVisible(true)}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={18} color="#1E293B" />
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

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setNewRowStartMonth(getCurrentFiscalMonthName());
            setAddModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
          <Text style={styles.addBtnText}>{t.addCategory}</Text>
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

      {/* Fixed Description + Exact Grid-Snap Months */}
      <ScrollView style={styles.verticalScroll}>
        <View style={styles.sheetWrapper}>
          {/* Left Fixed Column */}
          <View style={[styles.fixedColumn, { width: descColWidth }]}>
            <View style={[styles.headerCell, { width: descColWidth }]}>
              <Text style={styles.headerCellText}>{t.particulars}</Text>
            </View>

            {/* 1. Net Savings */}
            <View style={[styles.summaryCell, styles.netSavingsBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#1E3A8A' }]}>{t.netSavings}</Text>
            </View>

            {/* 2. Total Budget */}
            <View style={[styles.summaryCell, styles.totalBudgetBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#0F172A' }]}>{t.totalBudget}</Text>
            </View>

            {/* 3. Extra / Ghatti */}
            <View style={[styles.summaryCell, styles.extraBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#15803D' }]}>{t.extraGhatti}</Text>
            </View>

            {/* Category Rows (দোকানভিত্তিক Shop Debt খাতসহ) */}
            {rows.map((row) => (
              <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.descText} numberOfLines={2}>
                    {getRowDisplayName(row)}
                  </Text>
                  {row.isShopDebtRow && (
                    <Text style={styles.linkedShopBadge}>Shop Debt Sync</Text>
                  )}
                </View>

                {!row.isShopDebtRow && (
                  <TouchableOpacity
                    onPress={() => handleDeleteRow(row.id)}
                    accessibilityLabel="Delete row"
                    style={{ paddingLeft: 4 }}
                  >
                    <Ionicons name="trash-outline" size={15} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Right Exact Grid-Snap Viewport */}
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
                    const calYear = getMonthCalendarYear(month, fiscalStartYear);
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
                          {getMonthDisplayLabel(month, calYear)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[styles.summaryCell, styles.netSavingsBg, { width: monthColWidth }]}
                    >
                      <Text style={[styles.summaryValue, { color: '#1E3A8A' }]}>
                        {formatMoney(monthlySummary[month]?.netSavings || 0)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[styles.summaryCell, styles.totalBudgetBg, { width: monthColWidth }]}
                    >
                      <Text style={[styles.summaryValue, { color: '#0F172A' }]}>
                        {formatMoney(monthlySummary[month]?.totalBudget || 0)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => {
                    const diff = monthlySummary[month]?.extraOrGhatti || 0;
                    const isGhatti = diff < 0;
                    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
                    return (
                      <View
                        key={month}
                        style={[
                          styles.summaryCell,
                          isGhatti ? styles.ghattiBg : styles.extraBg,
                          { width: monthColWidth },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryValue,
                            { color: isGhatti ? '#B91C1C' : '#15803D' },
                          ]}
                        >
                          {sign}
                          {formatMoney(Math.abs(diff))}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {rows.map((row) => (
                  <View key={row.id} style={styles.row}>
                    {renderMonthCellsForRow(row)}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      {/* Settings & Language Modal */}
      <Modal visible={settingsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t.settingsTitle}</Text>
            <Text style={styles.inputLabel}>{t.selectLanguage}</Text>

            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 8 }}>
              <TouchableOpacity
                style={[styles.langOptionBtn, lang === 'en' && styles.langOptionBtnActive]}
                onPress={() => handleChangeLanguage('en')}
              >
                <Text style={[styles.langOptionText, lang === 'en' && styles.langOptionTextActive]}>
                  {t.english}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.langOptionBtn, lang === 'bn' && styles.langOptionBtnActive]}
                onPress={() => handleChangeLanguage('bn')}
              >
                <Text style={[styles.langOptionText, lang === 'bn' && styles.langOptionTextActive]}>
                  {t.bangla}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => setSettingsModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Cell + Bill Clear Confirmation Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRow ? getRowDisplayName(editingRow) : ''} — {editingMonth} ({fiscalLabel})
            </Text>
            <Text style={styles.inputLabel}>{t.amountLabel}</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={editAmountText}
              onChangeText={setEditAmountText}
              autoFocus
            />

            <Text style={styles.inputLabel}>{t.billStatusLabel}</Text>
            <TouchableOpacity
              style={[
                styles.clearStatusBtn,
                editClearedState ? styles.clearStatusBtnActive : styles.clearStatusBtnInactive,
              ]}
              onPress={handleRequestToggleClearedWithConfirm}
            >
              <Ionicons
                name={editClearedState ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={editClearedState ? '#15803D' : '#475569'}
              />
              <Text
                style={[
                  styles.clearStatusBtnText,
                  { color: editClearedState ? '#14532D' : '#334155' },
                ]}
              >
                {editClearedState ? t.unmarkClearedBtn : t.markClearedBtn}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setApplyForward(!applyForward)}
            >
              <Ionicons
                name={applyForward ? 'checkbox' : 'square-outline'}
                size={22}
                color="#2563EB"
              />
              <Text style={styles.checkboxLabel}>{t.applyForwardLabel}</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveCell}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Budget Item Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t.addItemTitle}</Text>
            <Text style={styles.inputLabel}>{t.itemNameLabel}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. House Rent, Medical..."
              value={newRowName}
              onChangeText={setNewRowName}
            />
            <Text style={styles.inputLabel}>{t.amountLabel}</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="0.00"
              value={newRowAmount}
              onChangeText={setNewRowAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                onPress={handleAddRow}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t.add}</Text>
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
  settingsBtn: {
    backgroundColor: '#F1F5F9',
    padding: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
  netSavingsBg: {
    backgroundColor: '#DBEAFE',
  },
  totalBudgetBg: {
    backgroundColor: '#F1F5F9',
  },
  extraBg: {
    backgroundColor: '#DCFCE7',
  },
  ghattiBg: {
    backgroundColor: '#FEE2E2',
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
  descCell: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  descText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  linkedShopBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 1,
  },
  cell: {
    height: 52,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
  },
  debtHighlightCell: {
    backgroundColor: '#FEFCE8',
  },
  clearedCellMark: {
    backgroundColor: '#BBF7D0',
    borderColor: '#16A34A',
  },
  cellValueText: {
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  clearedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 2,
  },
  clearedPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  clearStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  clearStatusBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  clearStatusBtnInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  clearStatusBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  langOptionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  langOptionBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  langOptionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  langOptionTextActive: {
    color: '#FFFFFF',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
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
    gap: 8,
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