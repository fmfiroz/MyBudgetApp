import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  useWindowDimensions,
  View,
} from 'react-native';

// Income Year: July থেকে Next Year June পর্যন্ত ১২ মাস
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

const SECOND_HALF_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June'];

type ItemType = 'income' | 'deduction';
type CellMode = 'fixed' | 'percent';
type IncomeProfileKind = 'salary' | 'daily' | 'business' | 'custom';

interface CellConfig {
  mode: CellMode;
  value: number;
}

interface IncomeRow {
  id: string;
  description: string;
  type: ItemType;
  isBasic?: boolean;
  hidden?: boolean;
  cells: { [month: string]: CellConfig };
}

interface DailyIncomeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // Fiscal Month name
  source: string;
  amount: number;
  note?: string;
}

interface IncomeSheetProfile {
  id: string;
  title: string;
  kind: IncomeProfileKind;
  rows: IncomeRow[];
  dailyEntries?: DailyIncomeEntry[];
}

interface FiscalYearStore {
  initialized: boolean;
  activeSheetId: string | null;
  sheets: IncomeSheetProfile[];
}

const parseNumericValue = (val: unknown): number => {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatFiscalYearLabel = (startYear: number) => {
  const nextTwoDigits = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${nextTwoDigits}`;
};

const getMonthCalendarYear = (month: string, startYear: number) => {
  const idx = FISCAL_MONTHS.indexOf(month);
  return idx >= 0 && idx <= 5 ? startYear : startYear + 1;
};

const getCurrentFiscalMonthName = (): string => {
  const jsMonth = new Date().getMonth();
  const monthNames = [
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
  return monthNames[jsMonth] || 'July';
};

const getTodayIsoDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildDefaultCells = (mode: CellMode, val: number): { [month: string]: CellConfig } => {
  const obj: { [month: string]: CellConfig } = {};
  FISCAL_MONTHS.forEach((m) => {
    obj[m] = { mode, value: parseNumericValue(val) };
  });
  return obj;
};

const createSalarySheetRows = (
  initialBasic = 0,
  applyAllMonths = true,
  startMonth = 'July'
): IncomeRow[] => {
  const baseRows: IncomeRow[] = [
    {
      id: 'row-incentives',
      description: 'Incentives',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-eid-bonus',
      description: 'Eid Bonus',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-boishakhi-vata',
      description: 'Boishakhi Vata',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-net-basic',
      description: 'Net Basic',
      type: 'income',
      isBasic: true,
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-house-rent',
      description: 'House Rent',
      type: 'income',
      cells: buildDefaultCells('percent', 50),
    },
    {
      id: 'row-medical-allow',
      description: 'Medical Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-education-allow',
      description: 'Education Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-incentive-allow',
      description: 'Incentive Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-tiffin-allow',
      description: 'Tiffin Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-pf-inst-contrib',
      description: 'P.F (Institutional Contribution)',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-bishes-vata',
      description: 'Bishes Vata',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-arrear-allow',
      description: 'Arrear Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },

    // Deductions
    {
      id: 'row-pf-self-inst',
      description: 'P.F (Self+Institute Contribution)',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-family-security',
      description: 'Family Security Subs.',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-welfare-fund',
      description: 'Welfare Fund',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-prev-paid-allowance',
      description: 'Previous Paid Allowance',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'row-stamp',
      description: 'Stamp',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
  ];

  if (initialBasic > 0) {
    return baseRows.map((row) => {
      if (!row.isBasic) return row;
      const updatedCells = { ...row.cells };
      if (applyAllMonths) {
        FISCAL_MONTHS.forEach((m) => {
          updatedCells[m] = { mode: 'fixed', value: initialBasic };
        });
      } else {
        updatedCells[startMonth] = { mode: 'fixed', value: initialBasic };
      }
      return { ...row, cells: updatedCells };
    });
  }

  return baseRows;
};

const createBusinessSheetRows = (initialAmount = 0): IncomeRow[] => {
  const currentMonth = getCurrentFiscalMonthName();
  const rows: IncomeRow[] = [
    {
      id: 'biz-main-income',
      description: 'Primary Income / Sales',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'biz-other-income',
      description: 'Extra / Other Income',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'biz-operating-cost',
      description: 'Operating / Direct Cost',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: 'biz-tax-misc',
      description: 'Tax / Misc. Expense',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
  ];

  if (initialAmount > 0) {
    rows[0].cells[currentMonth] = { mode: 'fixed', value: initialAmount };
  }

  return rows;
};

const createCustomSheetRows = (
  customItemLabel: string,
  initialAmount = 0
): IncomeRow[] => {
  const currentMonth = getCurrentFiscalMonthName();
  const label = customItemLabel.trim() || 'Main Income';
  const rows: IncomeRow[] = [
    {
      id: `custom-main-${Date.now()}`,
      description: label,
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    },
    {
      id: `custom-ded-${Date.now()}`,
      description: 'Deduction / Expense',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    },
  ];

  if (initialAmount > 0) {
    rows[0].cells[currentMonth] = { mode: 'fixed', value: initialAmount };
  }

  return rows;
};

const normalizeRow = (r: any): IncomeRow => {
  const { isOneTime, oneTimeMonth, ...cleanRow } = r || {};
  const normalizedCells: { [month: string]: CellConfig } = {};
  FISCAL_MONTHS.forEach((m) => {
    const rawCell = cleanRow.cells?.[m];
    const mode: CellMode = rawCell?.mode === 'percent' ? 'percent' : 'fixed';
    normalizedCells[m] = {
      mode,
      value: parseNumericValue(rawCell?.value),
    };
  });
  return {
    id: String(cleanRow.id || `row-${Math.random().toString(36).slice(2, 8)}`),
    description: String(cleanRow.description || 'Item'),
    type: cleanRow.type === 'deduction' ? 'deduction' : 'income',
    isBasic: Boolean(cleanRow.isBasic),
    hidden: Boolean(cleanRow.hidden),
    cells: normalizedCells,
  };
};

// পুরোনো সেভ করা Salary শিটে নতুন Arrear Allow. ও Previous Paid Allowance না থাকলে যুক্ত করে নেওয়া
const ensureSalarySystemRows = (rows: IncomeRow[]): IncomeRow[] => {
  const hasArrear = rows.some((r) => r.id === 'row-arrear-allow');
  const hasPrevPaid = rows.some((r) => r.id === 'row-prev-paid-allowance');
  const next = [...rows];
  if (!hasArrear) {
    next.push({
      id: 'row-arrear-allow',
      description: 'Arrear Allow.',
      type: 'income',
      cells: buildDefaultCells('fixed', 0),
    });
  }
  if (!hasPrevPaid) {
    next.push({
      id: 'row-prev-paid-allowance',
      description: 'Previous Paid Allowance',
      type: 'deduction',
      cells: buildDefaultCells('fixed', 0),
    });
  }
  return next;
};

const EMPTY_YEAR_STORE: FiscalYearStore = {
  initialized: false,
  activeSheetId: null,
  sheets: [],
};

const parseYearStore = (raw: string | null): FiscalYearStore => {
  if (!raw) return EMPTY_YEAR_STORE;
  try {
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sheets)) {
      const sheets: IncomeSheetProfile[] = parsed.sheets.map((s: any) => {
        const kind = (['salary', 'daily', 'business', 'custom'].includes(s.kind)
          ? s.kind
          : 'salary') as IncomeProfileKind;
        const baseRows = Array.isArray(s.rows) ? s.rows.map(normalizeRow) : [];
        return {
          id: String(s.id || `sheet-${Math.random().toString(36).slice(2, 7)}`),
          title: String(s.title || 'Income Sheet'),
          kind,
          rows: kind === 'salary' ? ensureSalarySystemRows(baseRows) : baseRows,
          dailyEntries: Array.isArray(s.dailyEntries) ? s.dailyEntries : [],
        };
      });

      if (sheets.length === 0) {
        return EMPTY_YEAR_STORE;
      }

      const activeId =
        typeof parsed.activeSheetId === 'string' &&
        sheets.some((s) => s.id === parsed.activeSheetId)
          ? parsed.activeSheetId
          : sheets[0].id;

      return {
        initialized: true,
        activeSheetId: activeId,
        sheets,
      };
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const defaultId = 'sheet-salary-legacy';
      return {
        initialized: true,
        activeSheetId: defaultId,
        sheets: [
          {
            id: defaultId,
            title: 'Salary & Allowances',
            kind: 'salary',
            rows: ensureSalarySystemRows(parsed.map(normalizeRow)),
          },
        ],
      };
    }
  } catch (e) {
    console.log('Failed to parse income year store:', e);
  }
  return EMPTY_YEAR_STORE;
};

/**
 * একাধিক আয়ের উৎস থাকলে নির্দিষ্ট অর্থবছরের সব শিটের সম্মিলিত মাসিক ও বার্ষিক আয় বের করার হেল্পার
 * (Budget ও Savings পেজের সাথে সমন্বয়ের জন্য)
 */
export async function getCombinedIncomeSummaryForFiscalYear(startYear: number): Promise<{
  byMonth: { [month: string]: number };
  yearlyTotal: number;
}> {
  const byMonth: { [month: string]: number } = {};
  FISCAL_MONTHS.forEach((m) => {
    byMonth[m] = 0;
  });

  try {
    const raw = await AsyncStorage.getItem(`@income_fy_${startYear}_${startYear + 1}`);
    const parsedStore = parseYearStore(raw);

    for (const sheet of parsedStore.sheets) {
      if (sheet.kind === 'daily') {
        (sheet.dailyEntries || []).forEach((entry) => {
          if (byMonth[entry.month] !== undefined) {
            byMonth[entry.month] += parseNumericValue(entry.amount);
          }
        });
      } else {
        const basicRow = sheet.rows.find(
          (r) => !r.hidden && (r.isBasic || r.description.trim().toLowerCase() === 'net basic')
        );
        FISCAL_MONTHS.forEach((m) => {
          const basicVal = basicRow ? parseNumericValue(basicRow.cells?.[m]?.value) : 0;
          let monthNet = 0;
          sheet.rows.forEach((row) => {
            if (row.hidden) return;
            const cell = row.cells?.[m];
            if (!cell) return;
            const v = parseNumericValue(cell.value);
            const resolved =
              cell.mode === 'percent' ? Math.round((basicVal * v) / 100) : v;
            if (row.type === 'income') {
              monthNet += resolved;
            } else {
              monthNet -= resolved;
            }
          });
          byMonth[m] += monthNet;
        });
      }
    }
  } catch (e) {
    console.log('Combined income summary error:', e);
  }

  const yearlyTotal = FISCAL_MONTHS.reduce((sum, m) => sum + (byMonth[m] || 0), 0);
  return { byMonth, yearlyTotal };
}

export default function IncomeSheetScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const isMobileScreen = screenWidth < 768;
  const visibleColumnsCount = isMobileScreen
    ? 2
    : Math.max(4, Math.floor((screenWidth - 215) / 114));
  const rawRightWidth = Math.max(200, Math.floor(screenWidth - (isMobileScreen ? 136 : 215)));
  const monthColWidth = Math.floor(rawRightWidth / visibleColumnsCount);
  const exactRightViewportWidth = monthColWidth * visibleColumnsCount;
  const descColWidth = Math.max(120, Math.floor(screenWidth) - exactRightViewportWidth);

  const gridSnapOffsets = useMemo(() => {
    const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
    const offsets: number[] = [];
    for (let i = 0; i <= maxStartIndex; i++) {
      offsets.push(i * monthColWidth);
    }
    return offsets;
  }, [monthColWidth, visibleColumnsCount]);

  const monthScrollRef = useRef<any>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeGridIndex, setActiveGridIndex] = useState<number>(0);

  const getInitialFiscalStartYear = () => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const [fiscalStartYear, setFiscalStartYear] = useState<number>(getInitialFiscalStartYear);
  const [store, setStore] = useState<FiscalYearStore>(EMPTY_YEAR_STORE);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const [pdfActionModalVisible, setPdfActionModalVisible] = useState<boolean>(false);
  const [generatedHtml, setGeneratedHtml] = useState<string>('');
  const [hiddenModalVisible, setHiddenModalVisible] = useState(false);

  // প্রশ্নমালা / Add Income Sheet Wizard Modal স্টেট
  const [incomeWizardVisible, setIncomeWizardVisible] = useState<boolean>(false);
  const [wizardKind, setWizardKind] = useState<IncomeProfileKind>('salary');
  const [wizardTitle, setWizardTitle] = useState<string>('');
  const [wizardCustomField, setWizardCustomField] = useState<string>('');
  const [wizardInitialAmount, setWizardInitialAmount] = useState<string>('');
  const [wizardApplyAllMonths, setWizardApplyAllMonths] = useState<boolean>(true);
  const [wizardStartMonth, setWizardStartMonth] = useState<string>('July');

  // Strict Sheet Delete Confirmation Modal স্টেট
  const [deleteSheetTarget, setDeleteSheetTarget] = useState<IncomeSheetProfile | null>(null);
  const [deleteSheetChecked, setDeleteSheetChecked] = useState<boolean>(false);
  const [deleteSheetTypedText, setDeleteSheetTypedText] = useState<string>('');

  // Daily Income এন্ট্রি ফর্ম স্টেট
  const [dailySelectedMonth, setDailySelectedMonth] = useState<string>(getCurrentFiscalMonthName());
  const [dailyDateInput, setDailyDateInput] = useState<string>(getTodayIsoDate());
  const [dailySourceInput, setDailySourceInput] = useState<string>('');
  const [dailyAmountInput, setDailyAmountInput] = useState<string>('');
  const [dailyNoteInput, setDailyNoteInput] = useState<string>('');

  // নতুন খাত যোগ করার মোডাল স্টেট
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<ItemType>('income');
  const [newMode, setNewMode] = useState<CellMode>('fixed');
  const [newDefaultVal, setNewDefaultVal] = useState('');
  const [applyToAllMonths, setApplyToAllMonths] = useState(false);
  const [selectedStartMonth, setSelectedStartMonth] = useState<string>('July');

  // Cell Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRow, setEditingRow] = useState<IncomeRow | null>(null);
  const [editingMonth, setEditingMonth] = useState<string>('July');
  const [editMode, setEditMode] = useState<CellMode>('fixed');
  const [editValue, setEditValue] = useState<string>('0');
  const [applyForward, setApplyForward] = useState<boolean>(false);

  const fiscalLabel = formatFiscalYearLabel(fiscalStartYear);
  const getStorageKey = (startYr: number) => `@income_fy_${startYr}_${startYr + 1}`;

  const activeSheet = useMemo<IncomeSheetProfile | null>(() => {
    if (!store.initialized || store.sheets.length === 0) return null;
    return store.sheets.find((s) => s.id === store.activeSheetId) || store.sheets[0];
  }, [store]);

  const rows = useMemo<IncomeRow[]>(() => activeSheet?.rows || [], [activeSheet]);

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
    const loadData = async () => {
      try {
        const saved = await AsyncStorage.getItem(getStorageKey(fiscalStartYear));
        setStore(parseYearStore(saved));
        // অর্থবছর লোড হলে সবসময় July (index 0) থেকে শুরু দেখাবে
        setTimeout(() => snapToGridIndex(0, false), 50);
      } catch (e) {
        console.log('Failed to load income year sheet:', e);
        setStore(EMPTY_YEAR_STORE);
      }
    };
    loadData();
  }, [fiscalStartYear, snapToGridIndex]);

  const persistStore = useCallback(
    async (startYr: number, nextStore: FiscalYearStore) => {
      if (startYr === fiscalStartYear) {
        setStore(nextStore);
      }
      try {
        await AsyncStorage.setItem(getStorageKey(startYr), JSON.stringify(nextStore));
      } catch (e) {
        console.log('Failed to save income year store:', e);
      }
    },
    [fiscalStartYear]
  );

  const saveRowsForActiveSheet = useCallback(
    async (startYr: number, updatedRows: IncomeRow[]) => {
      const currentRaw = await AsyncStorage.getItem(getStorageKey(startYr));
      const baseStore =
        startYr === fiscalStartYear ? store : parseYearStore(currentRaw);

      if (!baseStore.sheets.length) return;
      const targetSheetId = baseStore.activeSheetId || baseStore.sheets[0].id;

      const updatedSheets = baseStore.sheets.map((s) =>
        s.id === targetSheetId ? { ...s, rows: updatedRows } : s
      );

      await persistStore(startYr, {
        ...baseStore,
        initialized: true,
        activeSheetId: targetSheetId,
        sheets: updatedSheets,
      });
    },
    [fiscalStartYear, persistStore, store]
  );

  const handleJumpToStartOrCurrentMonth = () => {
    if (activeSheet?.kind === 'daily') {
      setDailySelectedMonth(getCurrentFiscalMonthName());
      return;
    }
    snapToGridIndex(0, true); // সবসময় July (July-June ক্রমের শুরু)-তে নিয়ে যাবে
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

  const getBasicForMonth = useCallback(
    (month: string): number => {
      const basicRow = rows.find(
        (r) => r.isBasic || r.description.trim().toLowerCase() === 'net basic'
      );
      if (!basicRow || basicRow.hidden) return 0;
      return parseNumericValue(basicRow.cells?.[month]?.value);
    },
    [rows]
  );

  const getResolvedAmount = useCallback(
    (row: IncomeRow, month: string): number => {
      if (row.hidden) return 0;
      const cell = row.cells?.[month];
      if (!cell) return 0;

      const val = parseNumericValue(cell.value);
      if (val === 0) return 0;

      if (cell.mode === 'percent') {
        const basic = getBasicForMonth(month);
        const cents = Math.round(Math.round(basic * 100) * val) / 100;
        return Math.round(cents) / 100;
      }
      return Math.round(val * 100) / 100;
    },
    [getBasicForMonth]
  );

  const { monthlySummary, yearlyTotals } = useMemo(() => {
    const summary: {
      [month: string]: {
        totalPayable: number;
        totalDeduction: number;
        netPay: number;
      };
    } = {};

    let annualPayableCents = 0;
    let annualDeductionCents = 0;
    let annualNetPayCents = 0;

    FISCAL_MONTHS.forEach((month) => {
      let monthPayableCents = 0;
      let monthDeductionCents = 0;

      rows.forEach((row) => {
        if (row.hidden) return;
        const amount = getResolvedAmount(row, month);
        const amountCents = Math.round(amount * 100);
        if (row.type === 'income') {
          monthPayableCents += amountCents;
        } else if (row.type === 'deduction') {
          monthDeductionCents += amountCents;
        }
      });

      const monthNetPayCents = monthPayableCents - monthDeductionCents;

      summary[month] = {
        totalPayable: monthPayableCents / 100,
        totalDeduction: monthDeductionCents / 100,
        netPay: monthNetPayCents / 100,
      };

      annualPayableCents += monthPayableCents;
      annualDeductionCents += monthDeductionCents;
      annualNetPayCents += monthNetPayCents;
    });

    return {
      monthlySummary: summary,
      yearlyTotals: {
        annualPayable: annualPayableCents / 100,
        annualDeduction: annualDeductionCents / 100,
        annualNetPay: annualNetPayCents / 100,
      },
    };
  }, [rows, getResolvedAmount]);

  const openIncomeSetupWizard = () => {
    setWizardKind('salary');
    setWizardTitle('');
    setWizardCustomField('');
    setWizardInitialAmount('');
    setWizardApplyAllMonths(true);
    setWizardStartMonth('July');
    setIncomeWizardVisible(true);
  };

  const handleCreateIncomeSheetFromWizard = async () => {
    const parsedInitial = parseNumericValue(wizardInitialAmount);

    let generatedRows: IncomeRow[] = [];
    let defaultTitle = 'Salary & Allowances';

    if (wizardKind === 'salary') {
      defaultTitle = 'Salary & Allowances';
      generatedRows = createSalarySheetRows(
        parsedInitial,
        wizardApplyAllMonths,
        wizardStartMonth
      );
    } else if (wizardKind === 'daily') {
      defaultTitle = 'Daily Income';
      generatedRows = [];
    } else if (wizardKind === 'business') {
      defaultTitle = 'Business / Freelance';
      generatedRows = createBusinessSheetRows(parsedInitial);
    } else {
      defaultTitle = 'Custom Income';
      generatedRows = createCustomSheetRows(wizardCustomField, parsedInitial);
    }

    const finalTitle = wizardTitle.trim() || defaultTitle;
    const newSheetId = `sheet-${wizardKind}-${Date.now()}`;
    const newSheet: IncomeSheetProfile = {
      id: newSheetId,
      title: finalTitle,
      kind: wizardKind,
      rows: generatedRows,
      dailyEntries: wizardKind === 'daily' ? [] : undefined,
    };

    const nextSheets = [...store.sheets, newSheet];
    const nextStore: FiscalYearStore = {
      initialized: true,
      activeSheetId: newSheetId,
      sheets: nextSheets,
    };

    await persistStore(fiscalStartYear, nextStore);
    setIncomeWizardVisible(false);

    // Salary বা যেকোনো টেবিল শিট তৈরির পর সবসময় July (index 0) থেকে শুরু হবে
    setTimeout(() => {
      snapToGridIndex(0, false);
    }, 60);
  };

  const handleSelectSheet = async (sheetId: string) => {
    await persistStore(fiscalStartYear, {
      ...store,
      initialized: true,
      activeSheetId: sheetId,
    });
    setTimeout(() => {
      snapToGridIndex(0, false);
    }, 50);
  };

  // Strict Delete Sheet চেক ও এক্সিকিউশন
  const canConfirmStrictSheetDelete = useMemo(() => {
    if (!deleteSheetTarget || !deleteSheetChecked) return false;
    const typed = deleteSheetTypedText.trim().toLowerCase();
    const targetName = deleteSheetTarget.title.trim().toLowerCase();
    return typed === 'delete' || (targetName.length > 0 && typed === targetName);
  }, [deleteSheetTarget, deleteSheetChecked, deleteSheetTypedText]);

  const handleConfirmStrictSheetDelete = async () => {
    if (!deleteSheetTarget || !canConfirmStrictSheetDelete) return;

    const remainingSheets = store.sheets.filter((s) => s.id !== deleteSheetTarget.id);
    const nextActiveId = remainingSheets.length > 0 ? remainingSheets[0].id : null;

    const nextStore: FiscalYearStore = {
      initialized: remainingSheets.length > 0,
      activeSheetId: nextActiveId,
      sheets: remainingSheets,
    };

    await persistStore(fiscalStartYear, nextStore);

    setDeleteSheetTarget(null);
    setDeleteSheetChecked(false);
    setDeleteSheetTypedText('');
  };

  // Daily Income এন্ট্রি যোগ ও ডিলিট
  const handleAddDailyEntry = async () => {
    if (!activeSheet || activeSheet.kind !== 'daily') return;
    const amount = parseNumericValue(dailyAmountInput);
    if (amount <= 0) {
      Alert.alert('সঠিক টাকা দিন', 'দৈনিক আয়ের পরিমাণ ০-এর বেশি হতে হবে।');
      return;
    }

    const newEntry: DailyIncomeEntry = {
      id: `daily-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: dailyDateInput.trim() || getTodayIsoDate(),
      month: dailySelectedMonth,
      source: dailySourceInput.trim() || 'Daily Income',
      amount,
      note: dailyNoteInput.trim() || undefined,
    };

    const nextSheets = store.sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return {
        ...s,
        dailyEntries: [newEntry, ...(s.dailyEntries || [])],
      };
    });

    await persistStore(fiscalStartYear, {
      ...store,
      initialized: true,
      sheets: nextSheets,
    });

    setDailySourceInput('');
    setDailyAmountInput('');
    setDailyNoteInput('');
  };

  const handleDeleteDailyEntry = async (entryId: string) => {
    if (!activeSheet || activeSheet.kind !== 'daily') return;
    const nextSheets = store.sheets.map((s) => {
      if (s.id !== activeSheet.id) return s;
      return {
        ...s,
        dailyEntries: (s.dailyEntries || []).filter((e) => e.id !== entryId),
      };
    });
    await persistStore(fiscalStartYear, {
      ...store,
      initialized: true,
      sheets: nextSheets,
    });
  };

  const handleToggleHideRow = async (rowId: string, hideValue: boolean) => {
    const updated = rows.map((r) => (r.id === rowId ? { ...r, hidden: hideValue } : r));
    await saveRowsForActiveSheet(fiscalStartYear, updated);
  };

  const isSalarySheet = activeSheet?.kind === 'salary';

  const openCellEditor = (row: IncomeRow, month: string) => {
    const currentCell = row.cells?.[month] || { mode: 'fixed', value: 0 };
    setEditingRow(row);
    setEditingMonth(month);
    setEditMode(row.isBasic || !isSalarySheet ? 'fixed' : currentCell.mode);
    setEditValue(currentCell.value ? String(currentCell.value) : '');
    setApplyForward(Boolean(row.isBasic && isSalarySheet));
    setEditModalVisible(true);
  };

  const handleSaveCellEdit = async () => {
    if (!editingRow) return;
    const numVal = parseNumericValue(editValue);
    const startIdx = FISCAL_MONTHS.indexOf(editingMonth);
    const effectiveMode: CellMode = editingRow.isBasic || !isSalarySheet ? 'fixed' : editMode;
    const shouldApplyForward = isSalarySheet && applyForward;

    const updated = rows.map((row) => {
      if (row.id !== editingRow.id) return row;
      const updatedCells = { ...row.cells };

      if (shouldApplyForward && startIdx >= 0) {
        for (let i = startIdx; i < FISCAL_MONTHS.length; i++) {
          updatedCells[FISCAL_MONTHS[i]] = { mode: effectiveMode, value: numVal };
        }
      } else {
        updatedCells[editingMonth] = { mode: effectiveMode, value: numVal };
      }

      return { ...row, cells: updatedCells };
    });

    await saveRowsForActiveSheet(fiscalStartYear, updated);

    // Basic সেলে July থেকে applyForward করলে পরের অর্থবছরের Jan-Jun সিঙ্ক
    if (editingRow.isBasic && editingMonth === 'July' && shouldApplyForward) {
      const nextFiscalStartYear = fiscalStartYear + 1;
      try {
        const nextRaw = await AsyncStorage.getItem(getStorageKey(nextFiscalStartYear));
        const nextStore = parseYearStore(nextRaw);
        if (nextStore.sheets.length > 0) {
          const syncedSheets = nextStore.sheets.map((s) => {
            if (s.kind !== 'salary') return s;
            return {
              ...s,
              rows: s.rows.map((r) => {
                if (!r.isBasic && r.id !== editingRow.id) return r;
                const nextCells = { ...r.cells };
                SECOND_HALF_MONTHS.forEach((m) => {
                  nextCells[m] = { mode: 'fixed', value: numVal };
                });
                return { ...r, cells: nextCells };
              }),
            };
          });
          await AsyncStorage.setItem(
            getStorageKey(nextFiscalStartYear),
            JSON.stringify({ ...nextStore, sheets: syncedSheets })
          );
        }
      } catch (e) {
        console.log('Next income year basic sync error:', e);
      }
    }

    setEditModalVisible(false);
  };

  const handleAddRow = async () => {
    if (!newDesc.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে খাতের বিবরণ (Description) লিখুন।');
      return;
    }

    const numVal = parseNumericValue(newDefaultVal);
    const cells: { [month: string]: CellConfig } = {};
    const effectiveMode: CellMode = isSalarySheet ? newMode : 'fixed';
    const effectiveApplyAll = isSalarySheet && applyToAllMonths;

    FISCAL_MONTHS.forEach((m) => {
      if (effectiveApplyAll) {
        cells[m] = { mode: effectiveMode, value: numVal };
      } else {
        cells[m] = { mode: effectiveMode, value: m === selectedStartMonth ? numVal : 0 };
      }
    });

    const newRow: IncomeRow = {
      id: `custom-${Date.now()}`,
      description: newDesc.trim(),
      type: newType,
      hidden: false,
      cells,
    };

    await saveRowsForActiveSheet(fiscalStartYear, [...rows, newRow]);
    setNewDesc('');
    setNewDefaultVal('');
    setApplyToAllMonths(false);
    setAddModalVisible(false);
  };

  const visibleIncomeRows = rows.filter((r) => r.type === 'income' && !r.hidden);
  const visibleDeductionRows = rows.filter((r) => r.type === 'deduction' && !r.hidden);
  const hiddenRows = rows.filter((r) => r.hidden);

  // Daily Sheet হিসাব
  const dailyEntriesForSheet = useMemo(
    () => (activeSheet?.kind === 'daily' ? activeSheet.dailyEntries || [] : []),
    [activeSheet]
  );

  const dailyMonthEntries = useMemo(
    () => dailyEntriesForSheet.filter((e) => e.month === dailySelectedMonth),
    [dailyEntriesForSheet, dailySelectedMonth]
  );

  const dailyMonthTotal = useMemo(
    () => dailyMonthEntries.reduce((sum, e) => sum + e.amount, 0),
    [dailyMonthEntries]
  );

  const dailyYearTotal = useMemo(
    () => dailyEntriesForSheet.reduce((sum, e) => sum + e.amount, 0),
    [dailyEntriesForSheet]
  );

  const buildReportHtml = () => {
    if (activeSheet?.kind === 'daily') {
      const entryRowsHtml = dailyEntriesForSheet
        .map(
          (e) => `
          <tr>
            <td>${e.date}</td>
            <td>${e.month}</td>
            <td>${e.source}</td>
            <td>${e.note || '-'}</td>
            <td style="text-align:right; font-weight:700;">${e.amount.toLocaleString('en-IN')}</td>
          </tr>
        `
        )
        .join('');

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>${activeSheet.title} (${fiscalLabel})</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0F172A; padding: 12px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
            th, td { border: 1px solid #94A3B8; padding: 6px; text-align: left; }
            th { background: #1E293B; color: #FFFFFF; }
          </style>
        </head>
        <body>
          <h1>${activeSheet.title} (${fiscalLabel})</h1>
          <p>Year Total Daily Income: ${dailyYearTotal.toLocaleString('en-IN')} Tk.</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Month</th>
                <th>Source / বিবরণ</th>
                <th>Note</th>
                <th style="text-align:right;">Amount (Tk.)</th>
              </tr>
            </thead>
            <tbody>${entryRowsHtml}</tbody>
          </table>
        </body>
        </html>
      `;
    }

    const getRowAnnualTotal = (row: IncomeRow) => {
      const totalCents = FISCAL_MONTHS.reduce(
        (sumCents, m) => sumCents + Math.round(getResolvedAmount(row, m) * 100),
        0
      );
      return totalCents / 100;
    };

    const renderTableRowsHtml = (items: IncomeRow[]) =>
      items
        .map((row) => {
          const annualSum = getRowAnnualTotal(row);
          const monthCols = FISCAL_MONTHS.map((m) => {
            const val = getResolvedAmount(row, m);
            return `<td style="text-align:right;">${val > 0 ? val.toLocaleString('en-IN') : '-'}</td>`;
          }).join('');
          return `
            <tr>
              <td style="text-align:left; font-weight:600; white-space:nowrap;">${row.description}</td>
              ${monthCols}
              <td style="text-align:right; font-weight:700; background:#F8FAFC;">${annualSum.toLocaleString('en-IN')}</td>
            </tr>
          `;
        })
        .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Income Year Report (${fiscalLabel})</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0F172A; margin: 0; padding: 8px; }
          .report-header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #1E293B; padding-bottom: 8px; }
          .report-header h1 { margin: 0; font-size: 18px; color: #0F172A; }
          .report-header p { margin: 4px 0 0; font-size: 12px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          th, td { border: 1px solid #94A3B8; padding: 5px 4px; }
          th { background-color: #1E293B; color: #FFFFFF; font-weight: 700; text-align: center; }
          .th-sub { display: block; font-size: 7.5px; font-weight: 400; color: #CBD5E1; }
          .section-row td { background-color: #E2E8F0; font-weight: 700; text-align: left; font-size: 9.5px; }
          .total-payable td { background-color: #DCFCE7; font-weight: 700; color: #14532D; }
          .total-deduction td { background-color: #FEE2E2; font-weight: 700; color: #7F1D1D; }
          .net-pay td { background-color: #DBEAFE; font-weight: 700; color: #1E3A8A; font-size: 9.5px; }
          .footer-note { margin-top: 10px; font-size: 9px; color: #64748B; text-align: right; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>${activeSheet?.title || 'Income Sheet'} (${fiscalLabel}) — July ${fiscalStartYear} to June ${fiscalStartYear + 1}</h1>
          <p>MyBudgetApp • Income Statement • Currency: BDT (Tk.)</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align:left; min-width:140px;">Particulars / খাত</th>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<th>${m.slice(0, 3)}<span class="th-sub">${String(
                    getMonthCalendarYear(m, fiscalStartYear)
                  ).slice(-2)}</span></th>`
              ).join('')}
              <th>Year Total (Tk.)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="section-row"><td colspan="14">INCOME & ALLOWANCES (+)</td></tr>
            ${renderTableRowsHtml(visibleIncomeRows)}
            <tr class="total-payable">
              <td style="text-align:left;">Total Payable (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].totalPayable.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualPayable.toLocaleString('en-IN')}</td>
            </tr>

            <tr class="section-row"><td colspan="14">DEDUCTIONS (-)</td></tr>
            ${renderTableRowsHtml(visibleDeductionRows)}
            <tr class="total-deduction">
              <td style="text-align:left;">Total Deduction (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].totalDeduction.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualDeduction.toLocaleString('en-IN')}</td>
            </tr>

            <tr class="net-pay">
              <td style="text-align:left;">Net Pay (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].netPay.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualNetPay.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer-note">
          Income Year: July ${fiscalStartYear} – June ${fiscalStartYear + 1} • Generated: ${new Date().toLocaleDateString('en-GB')}
        </div>
      </body>
      </html>
    `;
  };

  const triggerWebDownload = (htmlContent: string) => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Income_Year_Report_${fiscalLabel}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const triggerWebPrintPdf = async (htmlContent: string) => {
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
        return;
      }
    }
    await Print.printAsync({ html: htmlContent });
  };

  const triggerWebShare = async () => {
    const shareText = `Income Year Report (${fiscalLabel}) | Net Pay: ${yearlyTotals.annualNetPay.toLocaleString('en-IN')} Tk.`;
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({
          title: `Income Year Report (${fiscalLabel})`,
          text: shareText,
        });
        return;
      } catch {
        // fallback below
      }
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(shareText);
      Alert.alert('কপি হয়েছে', 'রিপোর্টের সারসংক্ষেপ ক্লিপবোর্ডে কপি করা হয়েছে।');
    }
  };

  const handleDownloadAndSharePdf = async () => {
    try {
      setExportingPdf(true);
      const htmlContent = buildReportHtml();

      if (Platform.OS === 'web') {
        triggerWebDownload(htmlContent);
        setGeneratedHtml(htmlContent);
        setPdfActionModalVisible(true);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Income_Year_Report_${fiscalLabel}.pdf`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF ডাউনলোড/সেভ হয়েছে', `ফাইলটি সেভ হয়েছে: ${uri}`);
        }
      }
    } catch (error) {
      console.log('PDF export/share error:', error);
      Alert.alert('সমস্যা হয়েছে', 'PDF রিপোর্ট তৈরি বা ডাউনলোড করা যায়নি।');
    } finally {
      setExportingPdf(false);
    }
  };

  const renderMonthCells = (row: IncomeRow) => {
    return FISCAL_MONTHS.map((month) => {
      const cell = row.cells?.[month] || { mode: 'fixed', value: 0 };
      const cellVal = parseNumericValue(cell.value);
      const resolvedVal = getResolvedAmount(row, month);

      return (
        <TouchableOpacity
          key={month}
          activeOpacity={0.7}
          onPress={() => openCellEditor(row, month)}
          style={[
            styles.cell,
            { width: monthColWidth },
            row.isBasic && styles.basicCellBg,
            !row.isBasic && cell.mode === 'percent' && cellVal > 0 && styles.percentCellBg,
          ]}
        >
          <Text
            style={[
              styles.resolvedAmountText,
              row.isBasic && { fontWeight: '700', color: '#0F172A' },
            ]}
          >
            {resolvedVal > 0 ? resolvedVal.toLocaleString('en-IN') : '0'}
          </Text>
          {!row.isBasic && cell.mode === 'percent' && cellVal > 0 && (
            <Text style={styles.percentBadge}>{cellVal}% of Basic</Text>
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
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeSheet ? `${activeSheet.title} (${fiscalLabel})` : `Income (${fiscalLabel})`}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {activeSheet
              ? activeSheet.kind === 'daily'
                ? 'দৈনিক আয় ও হিসাব'
                : 'July – June অর্থবছর শিট'
              : 'নতুন Income শিট যোগ করুন'}
          </Text>
        </View>

        {activeSheet && (
          <>
            <TouchableOpacity style={styles.nowBtn} onPress={handleJumpToStartOrCurrentMonth}>
              <Text style={styles.nowBtnText}>
                {activeSheet.kind === 'daily' ? 'Now' : 'July'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={handleDownloadAndSharePdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

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

      {/* Sheet Switcher + Strict Delete Sheet Button */}
      {store.sheets.length > 0 && (
        <View style={styles.sheetSwitcherBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: 'center' }}
            style={{ flex: 1 }}
          >
            {store.sheets.map((s) => {
              const selected = activeSheet?.id === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.sheetTabChip, selected && styles.sheetTabChipActive]}
                  onPress={() => handleSelectSheet(s.id)}
                >
                  <Text style={[styles.sheetTabText, selected && styles.sheetTabTextActive]}>
                    {s.title}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.newSheetMiniBtn} onPress={openIncomeSetupWizard}>
              <Ionicons name="add" size={15} color="#1D4ED8" />
              <Text style={styles.newSheetMiniText}>Add Income</Text>
            </TouchableOpacity>
          </ScrollView>

          {activeSheet && (
            <TouchableOpacity
              style={styles.deleteSheetIconBtn}
              onPress={() => {
                setDeleteSheetTarget(activeSheet);
                setDeleteSheetChecked(false);
                setDeleteSheetTypedText('');
              }}
              accessibilityLabel="Delete Active Sheet"
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Action Bar when a tabular sheet is active */}
      {activeSheet && activeSheet.kind !== 'daily' && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#16A34A' }]}
            onPress={() => {
              setNewType('income');
              setNewMode('fixed');
              setApplyToAllMonths(false);
              setAddModalVisible(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>+ Income</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#DC2626' }]}
            onPress={() => {
              setNewType('deduction');
              setNewMode('fixed');
              setApplyToAllMonths(false);
              setAddModalVisible(true);
            }}
          >
            <Ionicons name="remove-circle-outline" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>+ Deduction</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#334155' }]}
            onPress={() => setHiddenModalVisible(true)}
          >
            <Ionicons name="eye-off-outline" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>Hidden ({hiddenRows.length})</Text>
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
      )}

      {/* শুরুতে একদম খালি অবস্থায় শুধু + Add Income বাটন */}
      {!activeSheet ? (
        <View style={styles.emptyStateContainer}>
          <TouchableOpacity style={styles.primaryAddIncomeBtn} onPress={openIncomeSetupWizard}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <Text style={styles.primaryAddIncomeText}>Add Income</Text>
          </TouchableOpacity>
        </View>
      ) : activeSheet.kind === 'daily' ? (
        /* দৈনিক আয় (Daily Income Sheet) ভিউ */
        <ScrollView contentContainerStyle={styles.dailyContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {FISCAL_MONTHS.map((m) => {
                const active = dailySelectedMonth === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthChip, active && styles.monthChipActive]}
                    onPress={() => setDailySelectedMonth(m)}
                  >
                    <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                      {m.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.dailySummaryRow}>
            <View style={[styles.dailySummaryCard, { backgroundColor: '#DCFCE7' }]}>
              <Text style={styles.dailySummaryLabel}>{dailySelectedMonth} মোট দৈনিক আয়</Text>
              <Text style={[styles.dailySummaryVal, { color: '#15803D' }]}>
                {dailyMonthTotal.toLocaleString('en-IN')} Tk.
              </Text>
            </View>
            <View style={[styles.dailySummaryCard, { backgroundColor: '#DBEAFE' }]}>
              <Text style={styles.dailySummaryLabel}>বার্ষিক ({fiscalLabel}) মোট</Text>
              <Text style={[styles.dailySummaryVal, { color: '#1D4ED8' }]}>
                {dailyYearTotal.toLocaleString('en-IN')} Tk.
              </Text>
            </View>
          </View>

          <View style={styles.dailyFormCard}>
            <Text style={styles.dailyFormTitle}>
              নতুন দৈনিক আয় যোগ করুন ({dailySelectedMonth})
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 8 }]}
                placeholder="তারিখ (YYYY-MM-DD)"
                value={dailyDateInput}
                onChangeText={setDailyDateInput}
              />
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 8 }]}
                keyboardType="numeric"
                placeholder="টাকা (Amount)"
                value={dailyAmountInput}
                onChangeText={setDailyAmountInput}
              />
            </View>
            <TextInput
              style={[styles.modalInput, { marginBottom: 8 }]}
              placeholder="আয়ের উৎস / বিবরণ (যেমন: টিউশনি, দোকান বিক্রি, ফ্রিল্যান্স)"
              value={dailySourceInput}
              onChangeText={setDailySourceInput}
            />
            <TextInput
              style={[styles.modalInput, { marginBottom: 10 }]}
              placeholder="নোট (ঐচ্ছিক)"
              value={dailyNoteInput}
              onChangeText={setDailyNoteInput}
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#16A34A', paddingVertical: 11 }]}
              onPress={handleAddDailyEntry}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>দৈনিক আয় সেভ করুন</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dailyListCard}>
            <Text style={styles.dailyFormTitle}>
              {dailySelectedMonth} মাসের দৈনিক আয়ের তালিকা ({dailyMonthEntries.length})
            </Text>
            {dailyMonthEntries.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12.5, paddingVertical: 10 }}>
                এই মাসে এখনো কোনো দৈনিক আয় যোগ করা হয়নি।
              </Text>
            ) : (
              dailyMonthEntries.map((entry) => (
                <View key={entry.id} style={styles.dailyEntryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.descText}>{entry.source}</Text>
                    <Text style={styles.hintSubText}>
                      {entry.date}
                      {entry.note ? ` • ${entry.note}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.dailyEntryAmount}>
                    {entry.amount.toLocaleString('en-IN')} Tk.
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteDailyEntry(entry.id)}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        /* মূল মাসভিত্তিক Income Sheet (Salary / Business / Custom) */
        <ScrollView style={styles.verticalScroll}>
          <View style={styles.sheetWrapper}>
            {/* Left Fixed Description Column */}
            <View style={[styles.fixedColumn, { width: descColWidth }]}>
              <View style={[styles.headerCell, { width: descColWidth }]}>
                <Text style={styles.headerCellText}>খাত / Description</Text>
              </View>

              <View style={[styles.sectionBanner, { width: descColWidth }]}>
                <Text style={styles.sectionBannerText}>INCOME (+)</Text>
              </View>

              {visibleIncomeRows.map((row) => (
                <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                  <View style={{ flex: 1, marginRight: 3 }}>
                    <Text style={styles.descText} numberOfLines={2}>
                      {row.description}
                    </Text>
                    {row.isBasic && (
                      <Text style={styles.hintSubText}>Jul→Jun | Jan→Jun</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleHideRow(row.id, true)}
                    accessibilityLabel="Hide item"
                  >
                    <Ionicons name="eye-off-outline" size={15} color="#64748B" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={[styles.summaryCell, styles.totalIncomeBg, { width: descColWidth }]}>
                <Text style={styles.summaryTitle}>Total Payable (Tk.)</Text>
              </View>

              <View style={[styles.sectionBanner, { width: descColWidth }]}>
                <Text style={[styles.sectionBannerText, { color: '#B91C1C' }]}>
                  DEDUCTIONS (-)
                </Text>
              </View>

              {visibleDeductionRows.map((row) => (
                <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                  <View style={{ flex: 1, marginRight: 3 }}>
                    <Text style={styles.descText} numberOfLines={2}>
                      {row.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleHideRow(row.id, true)}
                    accessibilityLabel="Hide item"
                  >
                    <Ionicons name="eye-off-outline" size={15} color="#64748B" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={[styles.summaryCell, styles.totalDeductionBg, { width: descColWidth }]}>
                <Text style={styles.summaryTitle}>Total Deduction (Tk.)</Text>
              </View>

              <View style={[styles.summaryCell, styles.netIncomeBg, { width: descColWidth }]}>
                <Text style={[styles.summaryTitle, { color: '#1D4ED8' }]}>Net Pay (Tk.)</Text>
              </View>
            </View>

            {/* Right Exact-Grid Viewport (সবসময় July থেকে শুরু) */}
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
                            isCurrent && styles.currentMonthHeaderCell,
                          ]}
                        >
                          <Text style={styles.headerCellText} numberOfLines={1}>
                            {month} {String(calYear).slice(-2)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.row}>
                    {FISCAL_MONTHS.map((m) => (
                      <View key={m} style={[styles.sectionBanner, { width: monthColWidth }]} />
                    ))}
                  </View>

                  {visibleIncomeRows.map((row) => (
                    <View key={row.id} style={styles.row}>
                      {renderMonthCells(row)}
                    </View>
                  ))}

                  <View style={styles.row}>
                    {FISCAL_MONTHS.map((month) => (
                      <View
                        key={month}
                        style={[
                          styles.summaryCell,
                          styles.totalIncomeBg,
                          { width: monthColWidth },
                        ]}
                      >
                        <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                          {monthlySummary[month].totalPayable.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.row}>
                    {FISCAL_MONTHS.map((m) => (
                      <View key={m} style={[styles.sectionBanner, { width: monthColWidth }]} />
                    ))}
                  </View>

                  {visibleDeductionRows.map((row) => (
                    <View key={row.id} style={styles.row}>
                      {renderMonthCells(row)}
                    </View>
                  ))}

                  <View style={styles.row}>
                    {FISCAL_MONTHS.map((month) => (
                      <View
                        key={month}
                        style={[
                          styles.summaryCell,
                          styles.totalDeductionBg,
                          { width: monthColWidth },
                        ]}
                      >
                        <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>
                          {monthlySummary[month].totalDeduction.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.row}>
                    {FISCAL_MONTHS.map((month) => (
                      <View
                        key={month}
                        style={[styles.summaryCell, styles.netIncomeBg, { width: monthColWidth }]}
                      >
                        <Text style={[styles.summaryValue, { color: '#1D4ED8' }]}>
                          {monthlySummary[month].netPay.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      )}

      {/* + Add Income প্রশ্নমালা / Sheet Setup Modal */}
      <Modal visible={incomeWizardVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>আপনার Income সম্পর্কে প্রশ্নমালা</Text>

              <Text style={styles.inputLabel}>১. আপনার আয়ের ধরন কোনটি?</Text>
              <View style={{ gap: 6, marginBottom: 12 }}>
                <TouchableOpacity
                  style={[styles.kindCard, wizardKind === 'salary' && styles.kindCardActive]}
                  onPress={() => setWizardKind('salary')}
                >
                  <Text style={styles.kindTitle}>চাকরি / বেতনভুক্ত (Salary & Allowances)</Text>
                  <Text style={styles.kindSub}>
                    Net Basic, House Rent (%), Medical, Arrear, Previous Paid Allowance সহ পূর্ণাঙ্গ শিট
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.kindCard, wizardKind === 'daily' && styles.kindCardActive]}
                  onPress={() => setWizardKind('daily')}
                >
                  <Text style={styles.kindTitle}>দৈনিক আয় (Daily Income Sheet)</Text>
                  <Text style={styles.kindSub}>
                    প্রতিদিনের তারিখ ও উৎস অনুযায়ী আয় এন্ট্রি এবং মাসিক/বার্ষিক যোগফল
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.kindCard, wizardKind === 'business' && styles.kindCardActive]}
                  onPress={() => setWizardKind('business')}
                >
                  <Text style={styles.kindTitle}>ব্যবসা / ফ্রিল্যান্সিং (Business / Freelance)</Text>
                  <Text style={styles.kindSub}>
                    Primary Income/Sales, Extra Income, Operating Cost ও Tax/Expense
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.kindCard, wizardKind === 'custom' && styles.kindCardActive]}
                  onPress={() => setWizardKind('custom')}
                >
                  <Text style={styles.kindTitle}>নিজের মতো কাস্টম আয় (Custom Sheet)</Text>
                  <Text style={styles.kindSub}>
                    আপনার নিজের আয়ের খাতের নাম দিয়ে শিট তৈরি করুন
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>২. শিটের নাম (ঐচ্ছিক)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={
                  wizardKind === 'salary'
                    ? 'যেমন: Salary & Allowances'
                    : wizardKind === 'daily'
                      ? 'যেমন: Daily Income'
                      : wizardKind === 'business'
                        ? 'যেমন: Business Income'
                        : 'যেমন: Tuition / Rent'
                }
                value={wizardTitle}
                onChangeText={setWizardTitle}
              />

              {wizardKind === 'custom' && (
                <>
                  <Text style={styles.inputLabel}>মূল আয়ের খাতের নাম</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="যেমন: Monthly Rent / Consultancy"
                    value={wizardCustomField}
                    onChangeText={setWizardCustomField}
                  />
                </>
              )}

              {/* শুধু Salary-এর ক্ষেত্রেই প্রাথমিক Basic ও ১২ মাসের অপশন দেখাবে */}
              {wizardKind === 'salary' && (
                <>
                  <Text style={styles.inputLabel}>
                    ৩. প্রাথমিক Net Basic-এর পরিমাণ কত? (টাকায়)
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="যেমন: 25000 (না জানলে 0 বা খালি রাখুন)"
                    value={wizardInitialAmount}
                    onChangeText={setWizardInitialAmount}
                  />

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setWizardApplyAllMonths(!wizardApplyAllMonths)}
                  >
                    <Ionicons
                      name={wizardApplyAllMonths ? 'checkbox' : 'square-outline'}
                      size={22}
                      color="#2563EB"
                    />
                    <Text style={styles.checkboxLabel}>
                      পুরো Income Year (July – June সব ১২ মাসেই) প্রযোজ্য হবে
                    </Text>
                  </TouchableOpacity>

                  {!wizardApplyAllMonths && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.inputLabel}>কোন মাস থেকে শুরু হবে?</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {FISCAL_MONTHS.map((m) => (
                            <TouchableOpacity
                              key={m}
                              onPress={() => setWizardStartMonth(m)}
                              style={[
                                styles.monthChip,
                                wizardStartMonth === m && styles.monthChipActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.monthChipText,
                                  wizardStartMonth === m && styles.monthChipTextActive,
                                ]}
                              >
                                {m.slice(0, 3)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </>
              )}

              {/* Business বা Custom-এ ১২ মাসের অপশন ছাড়াই ঐচ্ছিক প্রাথমিক আয় */}
              {(wizardKind === 'business' || wizardKind === 'custom') && (
                <>
                  <Text style={styles.inputLabel}>
                    ৩. চলতি মাসের প্রাথমিক আয়ের পরিমাণ (ঐচ্ছিক, টাকায়)
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="যেমন: 15000 (না জানলে খালি রাখুন)"
                    value={wizardInitialAmount}
                    onChangeText={setWizardInitialAmount}
                  />
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => setIncomeWizardVisible(false)}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                  onPress={handleCreateIncomeSheetFromWizard}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>শিট তৈরি করুন</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Strict Sheet Delete Confirmation Modal */}
      <Modal visible={Boolean(deleteSheetTarget)} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>
                শিট স্থায়ীভাবে ডিলিট করুন (Strict Delete)
              </Text>

              {deleteSheetTarget && (
                <View style={styles.strictDangerBox}>
                  <Text style={{ fontWeight: '700', color: '#991B1B', fontSize: 13.5 }}>
                    Sheet: {deleteSheetTarget.title} ({fiscalLabel})
                  </Text>
                  <Text style={{ color: '#7F1D1D', fontSize: 12 }}>
                    সতর্কতা: এই শিটটি ডিলিট করলে এর ভেতরের সব মাসের আয়, ভাতা ও ডিডাকশন ডাটা চিরতরে মুছে যাবে।
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setDeleteSheetChecked((v) => !v)}
              >
                <Ionicons
                  name={deleteSheetChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#DC2626"
                />
                <Text style={styles.checkboxLabel}>
                  আমি সব ঝুঁকি জেনে "{deleteSheetTarget?.title}" শিটটি স্থায়ীভাবে মুছে ফেলতে চাই।
                </Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>
                নিশ্চিত করতে "{deleteSheetTarget?.title}" অথবা "DELETE" লিখুন:
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder='Type "DELETE" or exact sheet name'
                value={deleteSheetTypedText}
                onChangeText={setDeleteSheetTypedText}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => {
                    setDeleteSheetTarget(null);
                    setDeleteSheetChecked(false);
                    setDeleteSheetTypedText('');
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!canConfirmStrictSheetDelete}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: canConfirmStrictSheetDelete ? '#DC2626' : '#FCA5A5',
                    },
                  ]}
                  onPress={handleConfirmStrictSheetDelete}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Permanent Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cell Edit Modal — Salary-এ আগের হুবহু পপআপ স্টাইল; Business/Custom-এ শুধু সরল টাকার ইনপুট */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRow?.description} — {editingMonth} ({fiscalLabel})
            </Text>

            {isSalarySheet && !editingRow?.isBasic && (
              <>
                <Text style={styles.inputLabel}>হিসাবের ধরন নির্বাচন করুন</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeBtn, editMode === 'fixed' && styles.modeBtnActive]}
                    onPress={() => setEditMode('fixed')}
                  >
                    <Text
                      style={[styles.modeBtnText, editMode === 'fixed' && styles.modeBtnTextActive]}
                    >
                      নির্দিষ্ট টাকা (Fixed)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, editMode === 'percent' && styles.modeBtnActive]}
                    onPress={() => setEditMode('percent')}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        editMode === 'percent' && styles.modeBtnTextActive,
                      ]}
                    >
                      Basic-এর শতকরা (%)
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>
              {isSalarySheet && !editingRow?.isBasic && editMode === 'percent'
                ? 'শতকরা হার (%) লিখুন'
                : 'টাকার পরিমাণ লিখুন'}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={
                isSalarySheet && !editingRow?.isBasic && editMode === 'percent'
                  ? 'যেমন: 50'
                  : 'যেমন: 15000'
              }
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />

            {/* শুধু Salary শিটেই পরবর্তী সব মাসে প্রযোজ্য হওয়ার অপশন দেখাবে */}
            {isSalarySheet && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setApplyForward(!applyForward)}
              >
                <Ionicons
                  name={applyForward ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#2563EB"
                />
                <Text style={styles.checkboxLabel}>
                  {editingMonth} থেকে June পর্যন্ত পরবর্তী সব মাসেও এটি প্রযোজ্য হবে
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveCellEdit}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Web Download & Share Action Modal */}
      <Modal visible={pdfActionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>রিপোর্ট ডাউনলোড ও শেয়ার ({fiscalLabel})</Text>
            <View style={{ gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#7C3AED', paddingVertical: 11 }]}
                onPress={() => triggerWebPrintPdf(generatedHtml)}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Print / Save as PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#16A34A', paddingVertical: 11 }]}
                onPress={triggerWebShare}
              >
                <Ionicons name="share-social-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Share Summary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#2563EB', paddingVertical: 11 }]}
                onPress={() => triggerWebDownload(generatedHtml)}
              >
                <Ionicons name="download-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Download Again</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setPdfActionModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hidden Items Modal */}
      <Modal visible={hiddenModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>লুকানো খাতসমূহ ({fiscalLabel})</Text>
            {hiddenRows.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                বর্তমানে কোনো খাত লুকানো নেই।
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 280, marginBottom: 12 }}>
                {hiddenRows.map((item) => (
                  <View key={item.id} style={styles.hiddenItemRow}>
                    <View>
                      <Text style={styles.descText}>{item.description}</Text>
                      <Text style={styles.hintSubText}>
                        {item.type === 'income' ? 'Income / Allowance' : 'Deduction'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unhideBtn}
                      onPress={() => handleToggleHideRow(item.id, false)}
                    >
                      <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.unhideBtnText}>Show</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => setHiddenModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add New Item Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {newType === 'income'
                ? 'নতুন Income / Allowance খাত যোগ করুন'
                : 'নতুন Deduction খাত যোগ করুন'}
            </Text>

            <Text style={styles.inputLabel}>খাতের বিবরণ (Description)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="যেমন: Arrear Allow., Festival Allowance, Mobile Bill..."
              value={newDesc}
              onChangeText={setNewDesc}
            />

            {isSalarySheet && (
              <>
                <Text style={styles.inputLabel}>হিসাবের ধরন</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeBtn, newMode === 'fixed' && styles.modeBtnActive]}
                    onPress={() => setNewMode('fixed')}
                  >
                    <Text
                      style={[styles.modeBtnText, newMode === 'fixed' && styles.modeBtnTextActive]}
                    >
                      নির্দিষ্ট টাকা (Fixed)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, newMode === 'percent' && styles.modeBtnActive]}
                    onPress={() => setNewMode('percent')}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        newMode === 'percent' && styles.modeBtnTextActive,
                      ]}
                    >
                      Basic-এর শতকরা (%)
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>
              {isSalarySheet && newMode === 'percent' ? 'শতকরা হার (%)' : 'টাকার পরিমাণ'}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={isSalarySheet && newMode === 'percent' ? 'যেমন: 20' : 'যেমন: 3000'}
              value={newDefaultVal}
              onChangeText={setNewDefaultVal}
            />

            {/* শুধু Salary শিটের ক্ষেত্রেই ১২ মাসের অপশন দেখাবে */}
            {isSalarySheet && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setApplyToAllMonths(!applyToAllMonths)}
              >
                <Ionicons
                  name={applyToAllMonths ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#2563EB"
                />
                <Text style={styles.checkboxLabel}>
                  পুরো Income Year (১২ মাসেই) প্রযোজ্য হবে
                </Text>
              </TouchableOpacity>
            )}

            {(!isSalarySheet || !applyToAllMonths) && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>মাস নির্বাচন করুন</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {FISCAL_MONTHS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setSelectedStartMonth(m)}
                        style={[
                          styles.monthChip,
                          selectedStartMonth === m && styles.monthChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.monthChipText,
                            selectedStartMonth === m && styles.monthChipTextActive,
                          ]}
                        >
                          {m.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleAddRow}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>যোগ করুন</Text>
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
  headerTitleBox: {
    flex: 1,
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
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 3,
  },
  pdfBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
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
  sheetSwitcherBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  sheetTabChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sheetTabChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
  },
  sheetTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  sheetTabTextActive: {
    color: '#FFFFFF',
  },
  newSheetMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  newSheetMiniText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  deleteSheetIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 11.5,
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
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryAddIncomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 11,
  },
  primaryAddIncomeText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  dailyContainer: {
    padding: 12,
    gap: 10,
  },
  dailySummaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dailySummaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
  },
  dailySummaryLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  dailySummaryVal: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  dailyFormCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dailyFormTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  dailyListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dailyEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  dailyEntryAmount: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#15803D',
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
  currentMonthHeaderCell: {
    backgroundColor: '#1D4ED8',
  },
  headerCellText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
    textAlign: 'center',
  },
  sectionBanner: {
    height: 28,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  sectionBannerText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
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
  hintSubText: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  cell: {
    height: 52,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },
  basicCellBg: {
    backgroundColor: '#FEFCE8',
  },
  percentCellBg: {
    backgroundColor: '#F0FDF4',
  },
  resolvedAmountText: {
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  percentBadge: {
    textAlign: 'right',
    fontSize: 9,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 1,
  },
  summaryCell: {
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#94A3B8',
  },
  totalIncomeBg: {
    backgroundColor: '#DCFCE7',
  },
  totalDeductionBg: {
    backgroundColor: '#FEE2E2',
  },
  netIncomeBg: {
    backgroundColor: '#DBEAFE',
  },
  summaryTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  hiddenItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  unhideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unhideBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  kindCard: {
    padding: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  kindCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  kindTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  kindSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  strictDangerBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 3,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  modeBtnActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeBtnTextActive: {
    color: '#1D4ED8',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  monthChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
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