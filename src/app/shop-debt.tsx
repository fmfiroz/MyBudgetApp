import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
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
  ALL_UNITS,
  DebtLedgerEntry,
  formatBengaliYearMonth,
  getBudgetShopDebtLink,
  getCurrentYearMonth,
  getDebtStorageKey,
  getNextYearMonth,
  getPreviousDDMMYYYY,
  getPrevYearMonth,
  getProductCatalog,
  getSortedUnitsByFrequency,
  getTodayDDMMYYYY,
  MeasurementUnit,
  MonthlyDebtRecord,
  normalizeUnit,
  parseDateToYearMonth,
  recordUnitUsage,
  ShopProductCatalogItem,
  syncDebtToNextMonthBudget,
  upsertProductCatalogItem,
} from '../utils/shopDebtBudgetSync';

interface ShopProfile {
  id: string;
  name: string;
}

interface DraftBatchItem {
  localId: string;
  description: string;
  quantityText: string;
  unit: MeasurementUnit;
  unitPriceText: string;
}

const SHOPS_LIST_KEY = '@mybudget_debt_shops_v2';
const BUDGET_MONTH_KEY_PREFIX = '@mybudget_budget_v3_';

const DEFAULT_SHOPS: ShopProfile[] = [
  { id: 'shop-ab-hakim', name: 'Ab. Hakim' },
  { id: 'shop-ab-karim', name: 'Ab. Karim' },
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

function getContinuousYearMonths(startYM: string, count = 16): string[] {
  const list: string[] = [];
  let cursor = startYM;
  for (let i = 0; i < count; i++) {
    list.push(cursor);
    cursor = getNextYearMonth(cursor);
  }
  return list;
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

const formatMoney = (val: number): string => {
  const num = Number.isFinite(val) ? val : 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const createEmptyDraftItem = (
  defaultUnit: MeasurementUnit = 'pcs',
  preset?: ShopProductCatalogItem
): DraftBatchItem => ({
  localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  description: preset ? preset.name : '',
  quantityText: preset ? String(preset.defaultQuantity || 1) : '1',
  unit: preset ? normalizeUnit(preset.defaultUnit) : defaultUnit,
  unitPriceText: preset ? String(preset.defaultUnitPrice || '') : '',
});

export default function ShopDebtScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const cardHorizontalMargin = 10;
  const cardWidth = Math.max(300, Math.min(screenWidth - cardHorizontalMargin * 2, 520));
  const snapInterval = cardWidth + 12;

  const horizontalScrollRef = useRef<ScrollView | null>(null);
  const initialScrollDoneRef = useRef<boolean>(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const systemCurrentYM = getCurrentYearMonth();

  const [shops, setShops] = useState<ShopProfile[]>(DEFAULT_SHOPS);
  const [selectedShopId, setSelectedShopId] = useState<string>('shop-ab-hakim');

  const [timelineStartYM, setTimelineStartYM] = useState<string>(() => {
    let cursor = systemCurrentYM;
    for (let i = 0; i < 3; i++) {
      cursor = getPrevYearMonth(cursor);
    }
    return cursor;
  });

  const [activeSlideYM, setActiveSlideYM] = useState<string>(() => systemCurrentYM);
  const [continuousRecords, setContinuousRecords] = useState<MonthlyDebtRecord[]>([]);
  const [catalog, setCatalog] = useState<ShopProductCatalogItem[]>([]);
  const [sortedUnits, setSortedUnits] = useState<MeasurementUnit[]>(() => [...ALL_UNITS]);

  const [activeDropdownRow, setActiveDropdownRow] = useState<number | null>(null);
  const [activeSuggestionRow, setActiveSuggestionRow] = useState<number | null>(null);

  const [entryModalVisible, setEntryModalVisible] = useState<boolean>(false);
  const [entryDate, setEntryDate] = useState<string>(() => getTodayDDMMYYYY());
  const [draftItems, setDraftItems] = useState<DraftBatchItem[]>([createEmptyDraftItem('pcs')]);

  const [paymentModalVisible, setPaymentModalVisible] = useState<boolean>(false);
  const [paymentTargetYM, setPaymentTargetYM] = useState<string>(() => systemCurrentYM);
  const [paymentInput, setPaymentInput] = useState<string>('0');

  // Strict Delete Entry স্টেট
  const [pendingDeleteItem, setPendingDeleteItem] = useState<{
    ym: string;
    entry: DebtLedgerEntry;
  } | null>(null);
  const [deleteChecked, setDeleteChecked] = useState<boolean>(false);
  const [deleteTypedConfirm, setDeleteTypedConfirm] = useState<string>('');

  const snapOffsets = useMemo(() => {
    return continuousRecords.map((_, idx) => idx * snapInterval);
  }, [continuousRecords.length, snapInterval]);

  const loadShopsList = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SHOPS_LIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ShopProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setShops(parsed);
          setSelectedShopId((prevId) =>
            parsed.some((s) => s.id === prevId) ? prevId : parsed[0].id
          );
          return;
        }
      }
      await AsyncStorage.setItem(SHOPS_LIST_KEY, JSON.stringify(DEFAULT_SHOPS));
      setShops(DEFAULT_SHOPS);
    } catch {
      // fallback default shops
    }
  }, []);

  useEffect(() => {
    loadShopsList();
  }, [loadShopsList]);

  useFocusEffect(
    useCallback(() => {
      loadShopsList();
    }, [loadShopsList])
  );

  const getClearedPaymentFromBudgetForShop = useCallback(
    async (shopId: string, ym: string): Promise<number | null> => {
      try {
        const rawBudget = await AsyncStorage.getItem(`${BUDGET_MONTH_KEY_PREFIX}${ym}`);
        if (!rawBudget) return null;

        const parsed = JSON.parse(rawBudget) as {
          rowAmounts?: { [rowId: string]: number };
          rowCleared?: { [rowId: string]: boolean };
        };

        const budgetRowId = getBudgetRowIdForShop(shopId);
        if (parsed.rowCleared?.[budgetRowId]) {
          const clearedVal = safeFromCents(safeToCents(parsed.rowAmounts?.[budgetRowId]));
          if (clearedVal > 0) {
            return clearedVal;
          }
        }
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  const recalculateShopChainFromMonth = useCallback(
    async (shopId: string, startYM: string, maxSteps = 20): Promise<void> => {
      let currentYM = startYM;

      for (let step = 0; step < maxSteps; step++) {
        const prevYM = getPrevYearMonth(currentYM);
        const prevRaw = await AsyncStorage.getItem(getShopMonthStorageKey(shopId, prevYM));
        let prevCarryoverCents = 0;

        if (prevRaw) {
          const prevParsed = JSON.parse(prevRaw) as Partial<MonthlyDebtRecord>;
          prevCarryoverCents = safeToCents(prevParsed.totalBalanceDue);
        }

        const budgetLink = await getBudgetShopDebtLink(currentYM);
        if (
          prevCarryoverCents === 0 &&
          shopId === 'shop-ab-hakim' &&
          safeToCents(budgetLink.carryoverDebtFromPrevMonth) > 0
        ) {
          prevCarryoverCents = safeToCents(budgetLink.carryoverDebtFromPrevMonth);
        }

        const raw = await AsyncStorage.getItem(getShopMonthStorageKey(shopId, currentYM));
        const parsed: Partial<MonthlyDebtRecord> = raw
          ? (JSON.parse(raw) as Partial<MonthlyDebtRecord>)
          : {};

        const entries: DebtLedgerEntry[] = Array.isArray(parsed.entries)
          ? parsed.entries.map((e) => {
              const qty = Number(e.quantity) > 0 ? Number(e.quantity) : 1;
              const uPriceCents = safeToCents(e.unitPrice);
              const amtCents =
                safeToCents(e.amount) > 0 ? safeToCents(e.amount) : Math.round(qty * uPriceCents);
              return {
                ...e,
                unit: normalizeUnit(e.unit),
                quantity: qty,
                unitPrice: safeFromCents(uPriceCents),
                amount: safeFromCents(amtCents),
              };
            })
          : [];

        const budgetClearedPaid = await getClearedPaymentFromBudgetForShop(shopId, currentYM);

        let paidCents =
          parsed.paidAmount !== undefined ? Math.max(0, safeToCents(parsed.paidAmount)) : 0;

        if (budgetClearedPaid !== null && safeToCents(budgetClearedPaid) > 0) {
          paidCents = safeToCents(budgetClearedPaid);
        } else if (
          parsed.paidAmount === undefined &&
          shopId === 'shop-ab-hakim' &&
          safeToCents(budgetLink.paidAmount) > 0
        ) {
          paidCents = safeToCents(budgetLink.paidAmount);
        }

        const jerCents = prevCarryoverCents - paidCents;
        const currentDebtCents = entries.reduce((sum, item) => sum + safeToCents(item.amount), 0);
        const totalDueCents = jerCents + currentDebtCents;

        const computed: MonthlyDebtRecord = {
          yearMonth: currentYM,
          prevMonthCarryover: safeFromCents(prevCarryoverCents),
          paidAmount: safeFromCents(paidCents),
          entries,
          currentMonthDebt: safeFromCents(currentDebtCents),
          totalBalanceDue: safeFromCents(totalDueCents),
          updatedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem(
          getShopMonthStorageKey(shopId, currentYM),
          JSON.stringify(computed)
        );

        if (shopId === 'shop-ab-hakim') {
          await AsyncStorage.setItem(getDebtStorageKey(currentYM), JSON.stringify(computed));
          await syncDebtToNextMonthBudget(currentYM, computed.totalBalanceDue);
        }

        currentYM = getNextYearMonth(currentYM);
      }
    },
    [getClearedPaymentFromBudgetForShop]
  );

  const currentShop = useMemo(
    () => shops.find((s) => s.id === selectedShopId) || shops[0] || DEFAULT_SHOPS[0],
    [shops, selectedShopId]
  );

  const loadContinuousStream = useCallback(
    async (shopId: string, startYM: string) => {
      try {
        const months = getContinuousYearMonths(startYM, 16);
        const prevYM = getPrevYearMonth(startYM);
        await recalculateShopChainFromMonth(shopId, prevYM, 18);

        const [recordsList, catList, unitsList] = await Promise.all([
          Promise.all(
            months.map(async (ym) => {
              const raw = await AsyncStorage.getItem(getShopMonthStorageKey(shopId, ym));
              if (raw) {
                return JSON.parse(raw) as MonthlyDebtRecord;
              }
              return {
                yearMonth: ym,
                prevMonthCarryover: 0,
                paidAmount: 0,
                entries: [],
                currentMonthDebt: 0,
                totalBalanceDue: 0,
                updatedAt: new Date().toISOString(),
              };
            })
          ),
          getProductCatalog(),
          getSortedUnitsByFrequency(),
        ]);

        setContinuousRecords(recordsList);
        setCatalog(catList);
        setSortedUnits(unitsList);
      } catch (e) {
        console.log('Failed to load shop debt stream:', e);
      }
    },
    [recalculateShopChainFromMonth]
  );

  useEffect(() => {
    if (currentShop) {
      loadContinuousStream(currentShop.id, timelineStartYM);
    }
  }, [currentShop, timelineStartYM, loadContinuousStream]);

  const scrollToMonth = useCallback(
    (targetYM: string, animated = true) => {
      const idx = continuousRecords.findIndex((r) => r.yearMonth === targetYM);
      if (idx >= 0 && horizontalScrollRef.current) {
        horizontalScrollRef.current.scrollTo({
          x: idx * snapInterval,
          animated,
        });
        setActiveSlideYM(targetYM);
      }
    },
    [continuousRecords, snapInterval]
  );

  useEffect(() => {
    if (continuousRecords.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      setTimeout(() => {
        scrollToMonth(getCurrentYearMonth(), false);
      }, 60);
    }
  }, [continuousRecords, scrollToMonth]);

  const settleAtNearestCard = useCallback(
    (offsetX: number) => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
      }
      snapTimerRef.current = setTimeout(() => {
        if (continuousRecords.length === 0 || snapInterval <= 0) return;
        const maxIdx = Math.max(0, continuousRecords.length - 1);
        const rawIdx = Math.round(offsetX / snapInterval);
        const targetIdx = Math.max(0, Math.min(maxIdx, rawIdx));
        const exactX = targetIdx * snapInterval;

        const landedRecord = continuousRecords[targetIdx];
        if (landedRecord) {
          setActiveSlideYM(landedRecord.yearMonth);
        }

        if (Math.abs(offsetX - exactX) > 0.5 && horizontalScrollRef.current) {
          horizontalScrollRef.current.scrollTo({
            x: exactX,
            animated: true,
          });
        }
      }, 80);
    },
    [continuousRecords, snapInterval]
  );

  const handleHorizontalScroll = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x || 0;
    settleAtNearestCard(offsetX);
  };

  const handleHorizontalScrollEnd = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x || 0;
    settleAtNearestCard(offsetX);
  };

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, []);

  const handleJumpToCurrentMonth = () => {
    const nowYM = getCurrentYearMonth();
    const exists = continuousRecords.some((r) => r.yearMonth === nowYM);
    if (exists) {
      scrollToMonth(nowYM, true);
    } else {
      let start = nowYM;
      for (let i = 0; i < 3; i++) start = getPrevYearMonth(start);
      initialScrollDoneRef.current = false;
      setTimelineStartYM(start);
      setActiveSlideYM(nowYM);
    }
  };

  const handleSlideByStep = (delta: -1 | 1) => {
    const currentIdx = continuousRecords.findIndex((r) => r.yearMonth === activeSlideYM);
    if (currentIdx >= 0) {
      const nextIdx = currentIdx + delta;
      if (nextIdx >= 0 && nextIdx < continuousRecords.length) {
        scrollToMonth(continuousRecords[nextIdx].yearMonth, true);
        return;
      }
    }
    setTimelineStartYM((prev) => (delta < 0 ? getPrevYearMonth(prev) : getNextYearMonth(prev)));
  };

  const openNewEntryModal = (targetYM?: string) => {
    const target = targetYM || activeSlideYM || getCurrentYearMonth();
    const [yStr, mStr] = target.split('-');
    const isCurrentMonth = target === getCurrentYearMonth();
    const defaultDateStr = isCurrentMonth ? getTodayDDMMYYYY() : `01/${mStr}/${yStr}`;

    const topUnit = sortedUnits[0] || 'pcs';
    setEntryDate(defaultDateStr);
    setDraftItems([createEmptyDraftItem(topUnit)]);
    setActiveDropdownRow(null);
    setActiveSuggestionRow(null);
    setEntryModalVisible(true);
  };

  const handleStepPreviousDate = () => {
    setEntryDate((prevDate) => getPreviousDDMMYYYY(prevDate));
  };

  const handleAddDraftRow = () => {
    const topUnit = sortedUnits[0] || 'pcs';
    setDraftItems((prev) => [...prev, createEmptyDraftItem(topUnit)]);
    setActiveDropdownRow(null);
    setActiveSuggestionRow(null);
  };

  const handleRemoveDraftRow = (index: number) => {
    setDraftItems((prev) => {
      if (prev.length <= 1) return [createEmptyDraftItem(sortedUnits[0] || 'pcs')];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleUpdateDraftField = (
    index: number,
    field: keyof DraftBatchItem,
    value: string | MeasurementUnit
  ) => {
    setDraftItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSelectUnitFromDropdown = async (index: number, unit: MeasurementUnit) => {
    handleUpdateDraftField(index, 'unit', unit);
    setActiveDropdownRow(null);
    const updatedOrder = await recordUnitUsage(unit);
    setSortedUnits(updatedOrder);
  };

  const handleApplyCatalogSuggestion = (index: number, item: ShopProductCatalogItem) => {
    setDraftItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        description: item.name,
        quantityText: String(item.defaultQuantity || 1),
        unit: normalizeUnit(item.defaultUnit),
        unitPriceText: String(item.defaultUnitPrice || ''),
      };
      return copy;
    });
    setActiveSuggestionRow(null);
  };

  const handleSaveBatchEntries = async () => {
    const targetYM = parseDateToYearMonth(entryDate);
    if (!targetYM) {
      Alert.alert(
        'তারিখের ফরম্যাট ভুল',
        'তারিখ DD/MM/YYYY ফরম্যাটে লিখুন (যেমন: 01/12/2026 বা 20/11/2026)।'
      );
      return;
    }

    const validEntries: DebtLedgerEntry[] = [];
    let latestCatalog = catalog;
    let latestUnits = sortedUnits;

    for (let i = 0; i < draftItems.length; i++) {
      const d = draftItems[i];
      const cleanDesc = d.description.trim();
      const qty = parseFloat(d.quantityText.replace(/[^0-9.]/g, ''));
      const priceCents = safeToCents(d.unitPriceText);

      if (!cleanDesc && (!d.unitPriceText || priceCents === 0)) {
        continue;
      }

      if (!cleanDesc) {
        Alert.alert('তথ্য অসম্পূর্ণ', `সারি #${i + 1}-এ পণ্যের নাম লিখুন।`);
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('সঠিক Quantity দিন', `সারি #${i + 1}-এ Quantity ০-এর বেশি হতে হবে।`);
        return;
      }
      if (priceCents <= 0) {
        Alert.alert('সঠিক মূল্য দিন', `সারি #${i + 1}-এ Price ০-এর বেশি হতে হবে।`);
        return;
      }

      const cleanUnit = normalizeUnit(d.unit);
      const unitPrice = safeFromCents(priceCents);
      const lineTotalCents = Math.round(qty * priceCents);

      validEntries.push({
        id: `entry-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        date: entryDate.trim(),
        yearMonth: targetYM,
        description: cleanDesc,
        quantity: qty,
        unit: cleanUnit,
        unitPrice,
        amount: safeFromCents(lineTotalCents),
      });

      latestUnits = await recordUnitUsage(cleanUnit);
      latestCatalog = await upsertProductCatalogItem(cleanDesc, unitPrice, qty, cleanUnit);
    }

    if (validEntries.length === 0) {
      Alert.alert('কোনো পণ্য নেই', 'অন্তত একটি পণ্যের নাম ও Price লিখুন।');
      return;
    }

    setCatalog(latestCatalog);
    setSortedUnits(latestUnits);

    const targetRaw = await AsyncStorage.getItem(getShopMonthStorageKey(currentShop.id, targetYM));
    const targetParsed: Partial<MonthlyDebtRecord> = targetRaw
      ? (JSON.parse(targetRaw) as Partial<MonthlyDebtRecord>)
      : {};

    const existingEntries: DebtLedgerEntry[] = Array.isArray(targetParsed.entries)
      ? targetParsed.entries
      : [];

    const updatedTarget: MonthlyDebtRecord = {
      yearMonth: targetYM,
      prevMonthCarryover: safeFromCents(safeToCents(targetParsed.prevMonthCarryover)),
      paidAmount: safeFromCents(safeToCents(targetParsed.paidAmount)),
      entries: [...existingEntries, ...validEntries],
      currentMonthDebt: 0,
      totalBalanceDue: 0,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      getShopMonthStorageKey(currentShop.id, targetYM),
      JSON.stringify(updatedTarget)
    );
    setEntryModalVisible(false);

    const earliestYM = targetYM < timelineStartYM ? targetYM : timelineStartYM;
    await recalculateShopChainFromMonth(currentShop.id, earliestYM, 20);
    await loadContinuousStream(currentShop.id, timelineStartYM);
  };

  const canConfirmStrictEntryDelete = useMemo(() => {
    if (!pendingDeleteItem || !deleteChecked) return false;
    const typed = deleteTypedConfirm.trim().toLowerCase();
    const targetDesc = pendingDeleteItem.entry.description.trim().toLowerCase();
    return typed === 'delete' || (targetDesc.length > 0 && typed === targetDesc);
  }, [pendingDeleteItem, deleteChecked, deleteTypedConfirm]);

  const handleConfirmStrictEntryDelete = async () => {
    if (!pendingDeleteItem || !canConfirmStrictEntryDelete) return;
    const { ym, entry } = pendingDeleteItem;

    const raw = await AsyncStorage.getItem(getShopMonthStorageKey(currentShop.id, ym));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MonthlyDebtRecord>;
      const filtered = (Array.isArray(parsed.entries) ? parsed.entries : []).filter(
        (e) => e.id !== entry.id
      );

      const updated: MonthlyDebtRecord = {
        yearMonth: ym,
        prevMonthCarryover: safeFromCents(safeToCents(parsed.prevMonthCarryover)),
        paidAmount: safeFromCents(safeToCents(parsed.paidAmount)),
        entries: filtered,
        currentMonthDebt: 0,
        totalBalanceDue: 0,
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(getShopMonthStorageKey(currentShop.id, ym), JSON.stringify(updated));
    }

    setPendingDeleteItem(null);
    setDeleteChecked(false);
    setDeleteTypedConfirm('');

    const earliestYM = ym < timelineStartYM ? ym : timelineStartYM;
    await recalculateShopChainFromMonth(currentShop.id, earliestYM, 20);
    await loadContinuousStream(currentShop.id, timelineStartYM);
  };

  const openPaymentEditor = (ym: string, currentPaid: number) => {
    setPaymentTargetYM(ym);
    setPaymentInput(String(currentPaid || 0));
    setPaymentModalVisible(true);
  };

  const handleSavePayment = async () => {
    const paidCents = Math.max(0, safeToCents(paymentInput));
    const raw = await AsyncStorage.getItem(
      getShopMonthStorageKey(currentShop.id, paymentTargetYM)
    );
    const parsed: Partial<MonthlyDebtRecord> = raw
      ? (JSON.parse(raw) as Partial<MonthlyDebtRecord>)
      : {};

    const updated: MonthlyDebtRecord = {
      yearMonth: paymentTargetYM,
      prevMonthCarryover: safeFromCents(safeToCents(parsed.prevMonthCarryover)),
      paidAmount: safeFromCents(paidCents),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      currentMonthDebt: 0,
      totalBalanceDue: 0,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      getShopMonthStorageKey(currentShop.id, paymentTargetYM),
      JSON.stringify(updated)
    );
    setPaymentModalVisible(false);

    const earliestYM = paymentTargetYM < timelineStartYM ? paymentTargetYM : timelineStartYM;
    await recalculateShopChainFromMonth(currentShop.id, earliestYM, 20);
    await loadContinuousStream(currentShop.id, timelineStartYM);
  };

  const activeMonthBengaliLabel = useMemo(
    () => formatBengaliYearMonth(activeSlideYM),
    [activeSlideYM]
  );

  const renderMobileMonthCard = (record: MonthlyDebtRecord) => {
    const jerCents = safeToCents(record.prevMonthCarryover) - safeToCents(record.paidAmount);
    const jerAmount = safeFromCents(jerCents);
    const isActualCurrentMonth = record.yearMonth === getCurrentYearMonth();

    const dueOrAdvanceLabel =
      jerCents > 0 ? 'জের (বাকি)' : jerCents < 0 ? 'জের (অগ্রিম)' : 'জের';

    return (
      <View
        key={record.yearMonth}
        style={[
          styles.monthColumnCard,
          { width: cardWidth },
          isActualCurrentMonth && styles.currentMonthBorder,
        ]}
      >
        {/* টেবিল/কার্ডের টাইটেল থেকে দোকানের নাম তুলে দিয়ে শুধু মাস ও সাল রাখা হয়েছে */}
        <View style={[styles.monthBanner, isActualCurrentMonth && styles.currentMonthBanner]}>
          <Text style={styles.monthBannerTitle}>
            {formatBengaliYearMonth(record.yearMonth)}
            {isActualCurrentMonth ? ' • বর্তমান' : ''}
          </Text>
          <TouchableOpacity
            style={styles.cardAddSmallBtn}
            onPress={() => openNewEntryModal(record.yearMonth)}
            accessibilityLabel="Add entry for this month"
          >
            <Ionicons name="add-circle" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryTable}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>গত মাসের ধার</Text>
            <Text style={styles.summaryVal}>{formatMoney(record.prevMonthCarryover)}</Text>
          </View>

          <TouchableOpacity
            style={styles.summaryRow}
            onPress={() => openPaymentEditor(record.yearMonth, record.paidAmount)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.summaryKey, { color: '#15803D' }]}>প্রদান</Text>
              <Ionicons name="create-outline" size={14} color="#15803D" />
            </View>
            <Text style={[styles.summaryVal, { color: '#15803D' }]}>
              {formatMoney(record.paidAmount)}
            </Text>
          </TouchableOpacity>

          <View style={styles.summaryRow}>
            <Text
              style={[
                styles.summaryKey,
                jerCents < 0 ? { color: '#7E22CE' } : { color: '#B91C1C' },
              ]}
            >
              {dueOrAdvanceLabel}
            </Text>
            <Text
              style={[
                styles.summaryVal,
                jerCents < 0 ? { color: '#7E22CE' } : { color: '#B91C1C' },
              ]}
            >
              {formatMoney(Math.abs(jerAmount))}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>বর্তমান ধার</Text>
            <Text style={styles.summaryVal}>{formatMoney(record.currentMonthDebt)}</Text>
          </View>

          <View style={[styles.summaryRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalKey}>সর্বমোট বাঁকী</Text>
            <Text style={styles.grandTotalVal}>{formatMoney(record.totalBalanceDue)}</Text>
          </View>
        </View>

        <View style={styles.detailHeaderRow}>
          <Text style={[styles.detailHeaderCell, { flex: 1.15 }]}>তারিখ</Text>
          <Text style={[styles.detailHeaderCell, { flex: 1.4 }]}>বিবরণ</Text>
          <Text style={[styles.detailHeaderCell, { flex: 0.95, textAlign: 'center' }]}>Qty & Unit</Text>
          <Text style={[styles.detailHeaderCell, { flex: 1, textAlign: 'right' }]}>মূল্য</Text>
        </View>

        <ScrollView style={styles.cardEntriesScroll} nestedScrollEnabled>
          {record.entries.length === 0 ? (
            <View style={styles.emptyDetailBox}>
              <Text style={styles.emptyDetailText}>কোনো পণ্য এন্ট্রি নেই</Text>
            </View>
          ) : (
            record.entries.map((item) => (
              <View key={item.id} style={styles.detailRow}>
                <Text style={[styles.detailCell, { flex: 1.15 }]} numberOfLines={1}>
                  {item.date}
                </Text>
                <Text style={[styles.detailCell, { flex: 1.4, fontWeight: '600' }]} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={[styles.detailCell, { flex: 0.95, textAlign: 'center' }]} numberOfLines={1}>
                  {item.quantity} {item.unit}
                </Text>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                  }}
                >
                  <Text style={[styles.detailCell, { textAlign: 'right', fontWeight: '600' }]}>
                    {formatMoney(item.amount)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setPendingDeleteItem({ ym: record.yearMonth, entry: item });
                      setDeleteChecked(false);
                      setDeleteTypedConfirm('');
                    }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  const draftGrandTotalCents = draftItems.reduce((sum, d) => {
    const q = parseFloat(d.quantityText.replace(/[^0-9.]/g, '')) || 0;
    const pCents = safeToCents(d.unitPriceText);
    return sum + (q > 0 && pCents > 0 ? Math.round(q * pCents) : 0);
  }, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shop Debt</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {activeMonthBengaliLabel}
          </Text>
        </View>

        <TouchableOpacity style={styles.currentMonthBtn} onPress={handleJumpToCurrentMonth}>
          <Text style={styles.currentMonthBtnText}>Current</Text>
        </TouchableOpacity>

        <View style={styles.stepNav}>
          <TouchableOpacity onPress={() => handleSlideByStep(-1)}>
            <Ionicons name="chevron-back" size={18} color="#2563EB" />
          </TouchableOpacity>
          <Text style={styles.stepNavText}>{activeSlideYM}</Text>
          <TouchableOpacity onPress={() => handleSlideByStep(1)}>
            <Ionicons name="chevron-forward" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Shop Selector Strip (Add/Delete বাটন সরিয়ে Settings-এ নেওয়া হয়েছে) */}
      <View style={styles.shopSelectorBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
          style={{ flex: 1 }}
        >
          {shops.map((shop) => {
            const active = shop.id === currentShop.id;
            return (
              <TouchableOpacity
                key={shop.id}
                style={[styles.shopChip, active && styles.shopChipActive]}
                onPress={() => {
                  initialScrollDoneRef.current = false;
                  setSelectedShopId(shop.id);
                }}
              >
                <Ionicons
                  name="storefront-outline"
                  size={14}
                  color={active ? '#FFFFFF' : '#1E3A8A'}
                />
                <Text style={[styles.shopChipText, active && styles.shopChipTextActive]}>
                  {shop.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.settingsShortcutBtn}
          onPress={() => router.push('/settings' as any)}
          accessibilityLabel="Manage Shops in Settings"
        >
          <Ionicons name="settings-outline" size={17} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {/* Strict Card-Snapped Swipeable Month Cards */}
      <ScrollView
        ref={horizontalScrollRef}
        horizontal
        snapToOffsets={snapOffsets}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        onScroll={handleHorizontalScroll}
        onMomentumScrollEnd={handleHorizontalScrollEnd}
        onScrollEndDrag={handleHorizontalScrollEnd}
        contentContainerStyle={styles.swipeContainer}
      >
        {continuousRecords.map(renderMobileMonthCard)}
      </ScrollView>

      {/* Strict Delete Entry Modal */}
      <Modal visible={Boolean(pendingDeleteItem)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>
              কঠিন ডিলিট নিশ্চিতকরণ
            </Text>
            {pendingDeleteItem && (
              <View style={styles.strictBox}>
                <Text style={{ fontWeight: '700', color: '#991B1B', fontSize: 13 }}>
                  পণ্য: {pendingDeleteItem.entry.description}
                </Text>
                <Text style={{ color: '#7F1D1D', fontSize: 12 }}>
                  তারিখ: {pendingDeleteItem.entry.date} • মূল্য:{' '}
                  {formatMoney(pendingDeleteItem.entry.amount)} Tk.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.strictCheckRow}
              onPress={() => setDeleteChecked((v) => !v)}
            >
              <Ionicons
                name={deleteChecked ? 'checkbox' : 'square-outline'}
                size={22}
                color="#DC2626"
              />
              <Text style={styles.strictCheckText}>
                আমি নিশ্চিত যে এই এন্ট্রিটি স্থায়ীভাবে মুছে ফেলতে চাই।
              </Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>
              নিশ্চিত করতে "DELETE" অথবা পণ্যের নাম লিখুন:
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder='Type "DELETE" to confirm'
              value={deleteTypedConfirm}
              onChangeText={setDeleteTypedConfirm}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => {
                  setPendingDeleteItem(null);
                  setDeleteChecked(false);
                  setDeleteTypedConfirm('');
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canConfirmStrictEntryDelete}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: canConfirmStrictEntryDelete ? '#DC2626' : '#FCA5A5',
                  },
                ]}
                onPress={handleConfirmStrictEntryDelete}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>ডিলিট করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inline Multi-Row Add Modal */}
      <Modal visible={entryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ধারের পণ্য এন্ট্রি — {currentShop.name}</Text>

            <Text style={styles.inputLabel}>তারিখ (বাম পাশের &lt; চাপলে আগের তারিখ আসবে)</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.prevDateBtn}
                onPress={handleStepPreviousDate}
                accessibilityLabel="Previous Date"
              >
                <Ionicons name="chevron-back" size={20} color="#1E3A8A" />
              </TouchableOpacity>

              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                placeholder="DD/MM/YYYY"
                value={entryDate}
                onChangeText={setEntryDate}
              />
            </View>

            <View style={styles.inlineHeaderRow}>
              <Text style={[styles.inlineHeaderText, { flex: 1.8 }]}>পণ্যের নাম</Text>
              <Text style={[styles.inlineHeaderText, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
              <Text style={[styles.inlineHeaderText, { flex: 0.95, textAlign: 'center' }]}>Unit</Text>
              <Text style={[styles.inlineHeaderText, { flex: 0.95, textAlign: 'right' }]}>Price</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView style={{ maxHeight: 320, marginTop: 6, marginBottom: 8 }}>
              {draftItems.map((draft, index) => {
                const qNum = parseFloat(draft.quantityText.replace(/[^0-9.]/g, '')) || 0;
                const rowAmt = safeFromCents(
                  qNum > 0 && safeToCents(draft.unitPriceText) > 0
                    ? Math.round(qNum * safeToCents(draft.unitPriceText))
                    : 0
                );

                const query = draft.description.trim().toLowerCase();
                const suggestions =
                  activeSuggestionRow === index
                    ? catalog
                        .filter((c) => (!query ? true : c.name.toLowerCase().includes(query)))
                        .slice(0, 5)
                    : [];

                return (
                  <View key={draft.localId} style={styles.inlineItemContainer}>
                    <View style={styles.inlineInputRow}>
                      <TextInput
                        style={[styles.inlineInput, { flex: 1.8 }]}
                        placeholder="নাম"
                        value={draft.description}
                        onChangeText={(txt) => {
                          handleUpdateDraftField(index, 'description', txt);
                          setActiveSuggestionRow(index);
                          setActiveDropdownRow(null);
                        }}
                        onFocus={() => {
                          setActiveSuggestionRow(index);
                          setActiveDropdownRow(null);
                        }}
                      />

                      <TextInput
                        style={[styles.inlineInput, { flex: 0.7, textAlign: 'center' }]}
                        keyboardType="numeric"
                        placeholder="1"
                        value={draft.quantityText}
                        onChangeText={(txt) => handleUpdateDraftField(index, 'quantityText', txt)}
                      />

                      <TouchableOpacity
                        style={[styles.unitDropdownBtn, { flex: 0.95 }]}
                        onPress={() => {
                          setActiveSuggestionRow(null);
                          setActiveDropdownRow((prev) => (prev === index ? null : index));
                        }}
                      >
                        <Text style={styles.unitDropdownBtnText} numberOfLines={1}>
                          {draft.unit}
                        </Text>
                        <Ionicons name="chevron-down" size={13} color="#1E293B" />
                      </TouchableOpacity>

                      <TextInput
                        style={[styles.inlineInput, { flex: 0.95, textAlign: 'right' }]}
                        keyboardType="numeric"
                        placeholder="0.00"
                        value={draft.unitPriceText}
                        onChangeText={(txt) => handleUpdateDraftField(index, 'unitPriceText', txt)}
                      />

                      <TouchableOpacity
                        style={styles.plusLineBtn}
                        onPress={handleAddDraftRow}
                        accessibilityLabel="Add next item line"
                      >
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>

                    {activeDropdownRow === index && (
                      <View style={styles.dropdownMenuBox}>
                        <Text style={styles.dropdownHintText}>বেশি ব্যবহৃত Unit সবার আগে:</Text>
                        <View style={styles.dropdownChipsWrap}>
                          {sortedUnits.map((u) => {
                            const selected = draft.unit === u;
                            return (
                              <TouchableOpacity
                                key={u}
                                style={[
                                  styles.dropdownOptionChip,
                                  selected && styles.dropdownOptionChipActive,
                                ]}
                                onPress={() => handleSelectUnitFromDropdown(index, u)}
                              >
                                <Text
                                  style={[
                                    styles.dropdownOptionText,
                                    selected && styles.dropdownOptionTextActive,
                                  ]}
                                >
                                  {u}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {suggestions.length > 0 && (
                      <View style={styles.suggestionBox}>
                        {suggestions.map((prod) => (
                          <TouchableOpacity
                            key={prod.id}
                            style={styles.suggestionItem}
                            onPress={() => handleApplyCatalogSuggestion(index, prod)}
                          >
                            <Text style={styles.suggestionName}>{prod.name}</Text>
                            <Text style={styles.suggestionMeta}>
                              {formatMoney(prod.defaultUnitPrice)} / {prod.defaultQuantity}{' '}
                              {prod.defaultUnit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.rowFooterMeta}>
                      {draftItems.length > 1 ? (
                        <TouchableOpacity onPress={() => handleRemoveDraftRow(index)}>
                          <Text style={styles.removeRowLink}>এই লাইন বাদ দিন</Text>
                        </TouchableOpacity>
                      ) : (
                        <View />
                      )}
                      <Text style={styles.rowSubTotal}>মোট: {formatMoney(rowAmt)} Tk.</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={styles.previewTotalText}>
              সব পণ্যের সর্বমোট মূল্য: {formatMoney(safeFromCents(draftGrandTotalCents))} Tk.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setEntryModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveBatchEntries}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Edit Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              প্রদান (Payment) — {currentShop.name} ({paymentTargetYM})
            </Text>
            <Text style={styles.inputLabel}>প্রদত্ত টাকার পরিমাণ (Tk.)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="0.00"
              value={paymentInput}
              onChangeText={setPaymentInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setPaymentModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                onPress={handleSavePayment}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>প্রদান সেভ করুন</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
  },
  currentMonthBtn: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  currentMonthBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  stepNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  stepNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  shopSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  shopChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  shopChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  shopChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  shopChipTextActive: {
    color: '#FFFFFF',
  },
  settingsShortcutBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  swipeContainer: {
    padding: 10,
    gap: 12,
  },
  monthColumnCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    flex: 1,
  },
  currentMonthBorder: {
    borderColor: '#2563EB',
    borderWidth: 2,
  },
  monthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: 'relative',
  },
  currentMonthBanner: {
    backgroundColor: '#1D4ED8',
  },
  monthBannerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  cardAddSmallBtn: {
    position: 'absolute',
    right: 12,
    padding: 2,
  },
  summaryTable: {
    borderBottomWidth: 2,
    borderBottomColor: '#94A3B8',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryKey: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  summaryVal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  grandTotalRow: {
    backgroundColor: '#FEF2F2',
  },
  grandTotalKey: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#991B1B',
  },
  grandTotalVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  detailHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardEntriesScroll: {
    maxHeight: 340,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailCell: {
    fontSize: 12,
    color: '#0F172A',
  },
  emptyDetailBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyDetailText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  prevDateBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#93C5FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  strictBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 3,
  },
  strictCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  strictCheckText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  inlineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  inlineHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  inlineItemContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6,
    marginBottom: 8,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  unitDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
  },
  unitDropdownBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  plusLineBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownMenuBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  dropdownHintText: {
    fontSize: 10.5,
    color: '#475569',
    marginBottom: 6,
    fontWeight: '600',
  },
  dropdownChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dropdownOptionChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  dropdownOptionChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  dropdownOptionText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  dropdownOptionTextActive: {
    color: '#FFFFFF',
  },
  suggestionBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  suggestionName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  suggestionMeta: {
    fontSize: 10.5,
    color: '#2563EB',
  },
  rowFooterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    paddingHorizontal: 2,
  },
  removeRowLink: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  rowSubTotal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewTotalText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#15803D',
    textAlign: 'right',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});