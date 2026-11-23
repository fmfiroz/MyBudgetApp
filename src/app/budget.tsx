import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { getCombinedIncomeForMonth } from '../utils/incomeSyncHelper';
import {
  getBudgetShopDebtLink,
  getPrevYearMonth,
  MonthlyDebtRecord,
  saveShopDebtPaymentFromBudget,
} from '../utils/shopDebtBudgetSync';

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

interface SuggestionCategory {
  id: string;
  name: string;
}

interface BudgetCategoryRow {
  id: string;
  name: string;
  isShopDebtRow?: boolean;
  linkedShopId?: string;
  isVehicleRow?: boolean;
  linkedVehicleId?: string;
  isWelfareRow?: boolean;
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
const BUDGET_ROWS_META_KEY = '@mybudget_budget_rows_meta_v4';
const SAVINGS_MONTH_KEY_PREFIX = '@mybudget_savings_monthly_v1_';
const SHOPS_LIST_KEY = '@mybudget_debt_shops_v2';
const VEHICLE_STORAGE_KEY = '@vehicle_logsheet_table_v7';
const WELFARE_ROW_ID = 'cat-welfare-fund';

const CATEGORY_SUGGESTIONS: SuggestionCategory[] = [
  { id: 'sug-daily-market', name: 'Daily Market Expense' },
  { id: 'sug-other-market', name: 'Other Market Expense' },
  { id: 'sug-bkash-in', name: 'bKash In (Elec, Water, Net & Mob)' },
  { id: 'sug-net-mob', name: 'Internet & Mobile Bill' },
  { id: 'sug-mosque', name: 'Monthly Mosque Donation' },
  { id: 'sug-rika-pocket', name: "Rika's Pocket Money" },
  { id: 'sug-children-edu', name: "Children's Education" },
  { id: 'sug-qurbani-savings', name: 'Qurbani Savings - Office' },
  { id: 'sug-eid-meat', name: 'Eid Meat' },
  { id: 'sug-office-food', name: 'Office Food Bill' },
  { id: 'sug-water-bill', name: 'Water Bill' },
  { id: 'sug-arabic-tuition', name: 'Arabic Tuition Fee' },
  { id: 'sug-others', name: 'Others' },
];

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

/**
 * Budget-এর কোনো মাস `month` (যেমন November)-এর জন্য
 * Income যে মাস থেকে আসবে (যেমন October) সেই মাসের নাম ও fiscal startYear নির্ণয় করে।
 */
function getPreviousFiscalMonthSource(
  month: string,
  startYear: number
): { sourceMonth: string; sourceStartYear: number } {
  const idx = FISCAL_MONTHS.indexOf(month);
  if (idx > 0) {
    return {
      sourceMonth: FISCAL_MONTHS[idx - 1],
      sourceStartYear: startYear,
    };
  }
  // July হলে আগের অর্থবছরের June থেকে Income আসবে
  return {
    sourceMonth: 'June',
    sourceStartYear: startYear - 1,
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

function parseAnyDateToYearMonth(dateStr?: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    return `${yyyy}-${mm}`;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`;
  }

  return null;
}

interface VehicleMonthExpenseResult {
  vehicles: { vehicleId: string; vehicleName: string }[];
  byYearMonth: Record<string, Record<string, number>>;
}

async function getVehicleExpensesByYearMonth(): Promise<VehicleMonthExpenseResult> {
  try {
    const raw = await AsyncStorage.getItem(VEHICLE_STORAGE_KEY);
    if (!raw) {
      return { vehicles: [], byYearMonth: {} };
    }

    const parsed = JSON.parse(raw) as {
      vehicles?: { id: string; name: string }[];
      entries?: {
        vehicleId: string;
        kind: 'fuel' | 'maintenance';
        date: string;
        finishDate?: string;
        taka?: number;
        serviceCharge?: number;
        purchasedItems?: { price?: number }[];
      }[];
    };

    const rawVehicles = Array.isArray(parsed?.vehicles) ? parsed.vehicles : [];
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

    const vehicles = rawVehicles
      .filter((v) => v && v.id && v.name && v.name.trim().length > 0)
      .map((v) => ({
        vehicleId: v.id,
        vehicleName: v.name.trim(),
      }));

    const validIds = new Set(vehicles.map((v) => v.vehicleId));
    const centsByYM = new Map<string, Map<string, number>>();

    entries.forEach((entry) => {
      if (!entry || !entry.vehicleId || !validIds.has(entry.vehicleId)) return;

      const effectiveDate =
        entry.kind === 'fuel' && entry.finishDate ? entry.finishDate : entry.date;
      const entryYM = parseAnyDateToYearMonth(effectiveDate);
      if (!entryYM) return;

      let entryCostCents = 0;
      if (entry.kind === 'fuel') {
        entryCostCents = safeToCents(entry.taka);
      } else {
        const srvCents = safeToCents(entry.serviceCharge);
        const partsCents = Array.isArray(entry.purchasedItems)
          ? entry.purchasedItems.reduce((sum, p) => sum + safeToCents(p?.price), 0)
          : 0;
        entryCostCents = srvCents + partsCents;
      }

      if (!centsByYM.has(entryYM)) {
        centsByYM.set(entryYM, new Map<string, number>());
      }
      const vehMap = centsByYM.get(entryYM)!;
      vehMap.set(entry.vehicleId, (vehMap.get(entry.vehicleId) || 0) + entryCostCents);
    });

    const byYearMonth: Record<string, Record<string, number>> = {};
    centsByYM.forEach((vehMap, ym) => {
      const obj: Record<string, number> = {};
      vehMap.forEach((c, vId) => {
        obj[vId] = safeFromCents(c);
      });
      byYearMonth[ym] = obj;
    });

    return { vehicles, byYearMonth };
  } catch {
    return { vehicles: [], byYearMonth: {} };
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

  const monthScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
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

  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [newRowName, setNewRowName] = useState<string>('');
  const [newRowAmount, setNewRowAmount] = useState<string>('');
  const [newRowStartMonth, setNewRowStartMonth] = useState<string>(() =>
    getCurrentFiscalMonthName()
  );

  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingRow, setEditingRow] = useState<BudgetCategoryRow | null>(null);
  const [editingMonth, setEditingMonth] = useState<string>('July');
  const [editAmountText, setEditAmountText] = useState<string>('0');
  const [editClearedState, setEditClearedState] = useState<boolean>(false);
  const [applyForward, setApplyForward] = useState<boolean>(false);

  const fiscalLabel = formatFiscalYearLabel(fiscalStartYear);

  const loadFullYearBudget = useCallback(async (startYr: number) => {
    try {
      const currentMonthName = getCurrentFiscalMonthName();

      const [shopsRaw, metaRaw, vehicleData] = await Promise.all([
        AsyncStorage.getItem(SHOPS_LIST_KEY),
        AsyncStorage.getItem(BUDGET_ROWS_META_KEY),
        getVehicleExpensesByYearMonth(),
      ]);

      const shopList: ShopProfile[] = shopsRaw ? (JSON.parse(shopsRaw) as ShopProfile[]) : [];
      const validShops = Array.isArray(shopList) ? shopList : [];
      const validShopIdsSet = new Set(validShops.map((s) => s.id));
      const validVehicleIdsSet = new Set(vehicleData.vehicles.map((v) => v.vehicleId));

      let baseRows: BudgetCategoryRow[] = [];

      if (metaRaw) {
        const parsedMeta = JSON.parse(metaRaw) as any[];
        if (Array.isArray(parsedMeta)) {
          baseRows = parsedMeta
            .filter((m) => {
              if (m.id === WELFARE_ROW_ID || m.isWelfareRow) return true;
              if (m.isShopDebtRow) {
                return validShopIdsSet.has(m.linkedShopId || '');
              }
              if (m.isVehicleRow) {
                return validVehicleIdsSet.has(m.linkedVehicleId || '');
              }
              return Boolean(m.isUserAdded);
            })
            .map((m) => ({
              id: m.id,
              name: m.name || m.enName || m.bnName || 'Item',
              isShopDebtRow: Boolean(m.isShopDebtRow),
              linkedShopId: m.linkedShopId,
              isVehicleRow: Boolean(m.isVehicleRow),
              linkedVehicleId: m.linkedVehicleId,
              isWelfareRow: m.id === WELFARE_ROW_ID || Boolean(m.isWelfareRow),
              amounts: buildEmptyMonthMap(),
              cleared: buildEmptyClearedMap(),
            }));
        }
      }

      const hasWelfare = baseRows.some(
        (r) => r.id === WELFARE_ROW_ID || r.isWelfareRow
      );
      if (!hasWelfare) {
        baseRows.unshift({
          id: WELFARE_ROW_ID,
          name: 'Welfare Fund',
          isWelfareRow: true,
          amounts: buildEmptyMonthMap(),
          cleared: buildEmptyClearedMap(),
        });
      }

      validShops.forEach((shop) => {
        const rowId = getBudgetRowIdForShop(shop.id);
        const existingIdx = baseRows.findIndex(
          (r) => r.id === rowId || (r.isShopDebtRow && r.linkedShopId === shop.id)
        );
        const title = `${shop.name}'s Debt`;

        if (existingIdx >= 0) {
          baseRows[existingIdx] = {
            ...baseRows[existingIdx],
            id: rowId,
            name: title,
            isShopDebtRow: true,
            linkedShopId: shop.id,
          };
        } else {
          baseRows.push({
            id: rowId,
            name: title,
            isShopDebtRow: true,
            linkedShopId: shop.id,
            amounts: buildEmptyMonthMap(),
            cleared: buildEmptyClearedMap(),
          });
        }
      });

      vehicleData.vehicles.forEach((veh) => {
        const vRowId = `cat-veh-${veh.vehicleId}`;
        const existingIdx = baseRows.findIndex(
          (r) => r.id === vRowId || (r.isVehicleRow && r.linkedVehicleId === veh.vehicleId)
        );
        const title = `${veh.vehicleName} Expense`;

        if (existingIdx >= 0) {
          baseRows[existingIdx] = {
            ...baseRows[existingIdx],
            id: vRowId,
            name: title,
            isVehicleRow: true,
            linkedVehicleId: veh.vehicleId,
          };
        } else {
          baseRows.push({
            id: vRowId,
            name: title,
            isVehicleRow: true,
            linkedVehicleId: veh.vehicleId,
            amounts: buildEmptyMonthMap(),
            cleared: buildEmptyClearedMap(),
          });
        }
      });

      const netSavMap: { [month: string]: number } = {};

      for (const month of FISCAL_MONTHS) {
        const ym = getYearMonthForFiscalMonth(month, startYr);
        const prevYM = getPrevYearMonth(ym);
        const { sourceMonth, sourceStartYear } = getPreviousFiscalMonthSource(month, startYr);

        // উদাহরণ: Budget-এর November কলামে October-এর Income থেকে November-এর Savings বাদ যাবে
        const [prevMonthIncome, currentMonthSavingsAmt, budgetRaw] = await Promise.all([
          getCombinedIncomeForMonth(sourceMonth, sourceStartYear),
          getSavingsForYearMonth(ym),
          AsyncStorage.getItem(`${BUDGET_MONTH_KEY_PREFIX}${ym}`),
        ]);

        const netSavCents =
          safeToCents(prevMonthIncome) - safeToCents(currentMonthSavingsAmt);
        netSavMap[month] = safeFromCents(netSavCents);

        const parsedMonth: Partial<MonthlyBudgetStorage> = budgetRaw
          ? (JSON.parse(budgetRaw) as Partial<MonthlyBudgetStorage>)
          : {};

        const monthVehicleMap = vehicleData.byYearMonth[ym] || {};

        for (const row of baseRows) {
          if (row.isVehicleRow && row.linkedVehicleId) {
            const vehMonthAmt = safeFromCents(safeToCents(monthVehicleMap[row.linkedVehicleId]));
            row.amounts[month] = vehMonthAmt;
            row.cleared[month] = vehMonthAmt > 0;
          } else if (row.isShopDebtRow && row.linkedShopId) {
            row.cleared[month] = Boolean(parsedMonth.rowCleared?.[row.id]);

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

            const curShopExpenseCents =
              safeToCents(curRec.totalBalanceDue) > 0
                ? safeToCents(curRec.totalBalanceDue)
                : safeToCents(prevRec.totalBalanceDue) > 0
                  ? safeToCents(prevRec.totalBalanceDue)
                  : safeToCents(curRec.prevMonthCarryover) > 0
                    ? safeToCents(curRec.prevMonthCarryover)
                    : safeToCents(legacyLink?.carryoverDebtFromPrevMonth);

            const savedCellValCents =
              parsedMonth.rowAmounts?.[row.id] !== undefined
                ? safeToCents(parsedMonth.rowAmounts[row.id])
                : 0;

            if (month === currentMonthName && curShopExpenseCents > 0) {
              row.amounts[month] = safeFromCents(curShopExpenseCents);
            } else {
              row.amounts[month] =
                savedCellValCents > 0
                  ? safeFromCents(savedCellValCents)
                  : safeFromCents(curShopExpenseCents);
            }
          } else {
            row.cleared[month] = Boolean(parsedMonth.rowCleared?.[row.id]);
            row.amounts[month] = safeFromCents(safeToCents(parsedMonth.rowAmounts?.[row.id]));
          }
        }
      }

      const metaPayload = baseRows.map((r) => ({
        id: r.id,
        name: r.name,
        isShopDebtRow: Boolean(r.isShopDebtRow),
        linkedShopId: r.linkedShopId,
        isVehicleRow: Boolean(r.isVehicleRow),
        linkedVehicleId: r.linkedVehicleId,
        isWelfareRow: r.id === WELFARE_ROW_ID || Boolean(r.isWelfareRow),
        isUserAdded: !r.isShopDebtRow && !r.isVehicleRow && r.id !== WELFARE_ROW_ID,
      }));
      await AsyncStorage.setItem(BUDGET_ROWS_META_KEY, JSON.stringify(metaPayload));

      setMonthNetSavings(netSavMap);
      setRows(baseRows);
    } catch (e) {
      console.log('Failed to load budget sheet:', e);
    }
  }, []);

  useEffect(() => {
    loadFullYearBudget(fiscalStartYear);
  }, [fiscalStartYear, loadFullYearBudget]);

  useFocusEffect(
    useCallback(() => {
      loadFullYearBudget(fiscalStartYear);
    }, [fiscalStartYear, loadFullYearBudget])
  );

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
        name: r.name,
        isShopDebtRow: Boolean(r.isShopDebtRow),
        linkedShopId: r.linkedShopId,
        isVehicleRow: Boolean(r.isVehicleRow),
        linkedVehicleId: r.linkedVehicleId,
        isWelfareRow: r.id === WELFARE_ROW_ID || Boolean(r.isWelfareRow),
        isUserAdded: !r.isShopDebtRow && !r.isVehicleRow && r.id !== WELFARE_ROW_ID,
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
          clearedMap[r.id] = r.isVehicleRow ? val > 0 : Boolean(r.cleared[month]);
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
    const currentVal = safeFromCents(safeToCents(row.amounts[month]));
    setEditingRow(row);
    setEditingMonth(month);
    setEditAmountText(String(currentVal));
    setEditClearedState(row.isVehicleRow ? currentVal > 0 : Boolean(row.cleared[month]));
    setApplyForward(false);
    setEditModalVisible(true);
  };

  const handleRequestToggleClearedWithConfirm = () => {
    if (editingRow?.isVehicleRow) return;
    const nextState = !editClearedState;
    const message = nextState
      ? 'নিশ্চিত করুন: এই খাতের বিলটি কি ক্লিয়ার (রঙ মার্ক) হয়েছে?'
      : 'নিশ্চিত করুন: এই খাতের ক্লিয়ার রঙ মার্ক কি তুলে নেবেন?';

    const applyToggle = () => {
      setEditClearedState(nextState);
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(message) : true;
      if (ok) applyToggle();
    } else {
      Alert.alert('নিশ্চিত করুন', message, [
        { text: 'বাতিল', style: 'cancel' },
        { text: 'নিশ্চিত করুন', onPress: applyToggle },
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
          nextCleared[m] = r.isVehicleRow ? val > 0 : editClearedState;
          affectedMonths.push(m);
        }
      } else {
        nextAmounts[editingMonth] = val;
        nextCleared[editingMonth] = r.isVehicleRow ? val > 0 : editClearedState;
        affectedMonths.push(editingMonth);
      }

      return { ...r, amounts: nextAmounts, cleared: nextCleared };
    });

    setEditModalVisible(false);
    await persistRowsAndMonths(updated, affectedMonths);
  };

  const handleAddRow = async (overrideName?: string) => {
    const cleanName = (overrideName !== undefined ? overrideName : newRowName).trim();
    if (!cleanName) {
      Alert.alert('খাতের নাম লিখুন বা Suggestion নির্বাচন করুন।');
      return;
    }

    const amt = safeFromCents(Math.max(0, safeToCents(newRowAmount)));
    const newRow: BudgetCategoryRow = {
      id: `b-item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
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
      const ok =
        typeof window !== 'undefined'
          ? window.confirm('আপনি কি এই বাজেট খাতটি মুছে ফেলতে চান?')
          : true;
      if (ok) await confirmDelete();
    } else {
      Alert.alert('খাত মুছুন', 'আপনি কি এই বাজেট খাতটি মুছে ফেলতে চান?', [
        { text: 'বাতিল', style: 'cancel' },
        { text: 'মুছুন', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const renderMonthCellsForRow = (row: BudgetCategoryRow) => {
    return FISCAL_MONTHS.map((month) => {
      const val = safeFromCents(safeToCents(row.amounts[month]));
      const isCleared = row.isVehicleRow ? val > 0 : Boolean(row.cleared[month]);

      return (
        <TouchableOpacity
          key={month}
          activeOpacity={0.75}
          onPress={() => openEditCellModal(row, month)}
          style={[
            styles.cell,
            { width: monthColWidth },
            row.isShopDebtRow && !isCleared && styles.debtHighlightCell,
            row.isVehicleRow && !isCleared && styles.vehicleHighlightCell,
            (row.id === WELFARE_ROW_ID || row.isWelfareRow) && !isCleared && styles.welfareHighlightCell,
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
              <Text style={styles.clearedPillText}>Cleared</Text>
            </View>
          )}
        </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Budget ({fiscalLabel})</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Prev Month Income − Current Month Savings
          </Text>
        </View>

        <TouchableOpacity style={styles.nowBtn} onPress={handleJumpToCurrentMonth}>
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
            setNewRowName('');
            setNewRowAmount('');
            setNewRowStartMonth(getCurrentFiscalMonthName());
            setAddModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
          <Text style={styles.addBtnText}>+ Add Item</Text>
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
              <Text style={styles.headerCellText}>Particulars</Text>
            </View>

            <View style={[styles.summaryCell, styles.netSavingsBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#1E3A8A' }]}>Net Savings</Text>
            </View>

            <View style={[styles.summaryCell, styles.totalBudgetBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#0F172A' }]}>Total Budget</Text>
            </View>

            <View style={[styles.summaryCell, styles.extraBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#15803D' }]}>Extra / Ghatti</Text>
            </View>

            {rows.map((row) => {
              const isWelfare = row.id === WELFARE_ROW_ID || Boolean(row.isWelfareRow);
              return (
                <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.descText} numberOfLines={2}>
                      {row.name}
                    </Text>
                    {isWelfare && (
                      <Text style={styles.linkedWelfareBadge}>Welfare Fund Sync</Text>
                    )}
                    {row.isShopDebtRow && (
                      <Text style={styles.linkedShopBadge}>Shop Debt Sync</Text>
                    )}
                    {row.isVehicleRow && (
                      <Text style={styles.linkedVehicleBadge}>Vehicle Sync • Cash Paid</Text>
                    )}
                  </View>

                  {!row.isShopDebtRow && !row.isVehicleRow && !isWelfare && (
                    <TouchableOpacity
                      onPress={() => handleDeleteRow(row.id)}
                      accessibilityLabel="Delete row"
                      style={{ paddingLeft: 4 }}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
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
                          {month.slice(0, 3)} {String(calYear).slice(-2)}
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

      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRow?.name || ''} — {editingMonth} ({fiscalLabel})
            </Text>
            <Text style={styles.inputLabel}>Amount (Tk.)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={editAmountText}
              onChangeText={setEditAmountText}
              autoFocus
            />

            {editingRow?.isVehicleRow ? (
              <View style={styles.vehicleClearedInfoBox}>
                <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                <Text style={styles.vehicleClearedInfoText}>
                  নগদ খরচ হিসেবে Vehicle খাতে স্বয়ংক্রিয়ভাবে Cleared মার্ক সক্রিয় আছে।
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>Bill Payment Status</Text>
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
                    {editClearedState ? 'Unmark Cleared Bill' : 'Mark Bill Cleared'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setApplyForward(!applyForward)}
            >
              <Ionicons
                name={applyForward ? 'checkbox' : 'square-outline'}
                size={22}
                color="#2563EB"
              />
              <Text style={styles.checkboxLabel}>Apply to remaining months up to June</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveCell}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add New Budget Item</Text>

              <Text style={styles.inputLabel}>Custom Item Name (নিজের মতো নাম লিখুন)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. House Rent, Medical, Gas..."
                value={newRowName}
                onChangeText={setNewRowName}
              />

              <Text style={styles.inputLabel}>Amount (Tk.) (ঐচ্ছিক)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="0.00"
                value={newRowAmount}
                onChangeText={setNewRowAmount}
              />

              <Text style={styles.inputLabel}>
                Suggestions (চাপলে সরাসরি খাত হিসেবে যুক্ত হবে):
              </Text>
              <View style={styles.suggestionsWrap}>
                {CATEGORY_SUGGESTIONS.map((sug) => (
                  <TouchableOpacity
                    key={sug.id}
                    style={styles.suggestionChip}
                    onPress={() => handleAddRow(sug.name)}
                  >
                    <Ionicons name="add" size={14} color="#1D4ED8" />
                    <Text style={styles.suggestionChipText}>{sug.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                  onPress={() => handleAddRow()}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Add Custom</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
    gap: 6,
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
    paddingHorizontal: 8,
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
  linkedWelfareBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#0369A1',
    marginTop: 1,
  },
  linkedShopBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 1,
  },
  linkedVehicleBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#047857',
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
  welfareHighlightCell: {
    backgroundColor: '#F0F9FF',
  },
  debtHighlightCell: {
    backgroundColor: '#FEFCE8',
  },
  vehicleHighlightCell: {
    backgroundColor: '#ECFDF5',
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
  vehicleClearedInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  vehicleClearedInfoText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#14532D',
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
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  suggestionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E3A8A',
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