import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveLocalData } from './firebaseSync';

export type MeasurementUnit =
  | 'kg'
  | 'pcs'
  | 'hali'
  | 'gm'
  | 'ltr'
  | 'pkt'
  | 'dozen'
  | 'box'
  | 'ml'
  | 'bag'
  | 'bosta'
  | 'pair';

export const ALL_UNITS: MeasurementUnit[] = [
  'kg',
  'pcs',
  'hali',
  'gm',
  'ltr',
  'pkt',
  'dozen',
  'box',
  'ml',
  'bag',
  'bosta',
  'pair',
];

export interface ShopProductCatalogItem {
  id: string;
  name: string;
  defaultUnitPrice: number;
  defaultQuantity: number;
  defaultUnit: MeasurementUnit;
}

export interface DebtLedgerEntry {
  id: string;
  date: string; // "DD/MM/YYYY"
  yearMonth: string; // "YYYY-MM"
  description: string;
  quantity: number;
  unit: MeasurementUnit;
  unitPrice: number;
  amount: number;
}

export interface MonthlyDebtRecord {
  yearMonth: string;
  prevMonthCarryover: number;
  paidAmount: number;
  entries: DebtLedgerEntry[];
  currentMonthDebt: number;
  totalBalanceDue: number;
  updatedAt: string;
}

export interface MonthlyBudgetShopDebtLink {
  yearMonth: string;
  carryoverDebtFromPrevMonth: number;
  paidAmount: number;
  updatedAt: string;
}

const DEBT_KEY_PREFIX = '@mybudget_shop_debt_v3_';
const BUDGET_DEBT_LINK_PREFIX = '@mybudget_budget_shop_debt_link_';
const PRODUCT_CATALOG_KEY = '@mybudget_shop_product_catalog_v2';
const UNIT_USAGE_KEY = '@mybudget_shop_unit_usage_v1';

export function toCents(val: unknown): number {
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

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function normalizeUnit(unit: unknown): MeasurementUnit {
  if (typeof unit === 'string') {
    const lower = unit.trim().toLowerCase() as MeasurementUnit;
    if (ALL_UNITS.includes(lower)) {
      return lower;
    }
  }
  return 'pcs';
}

export function getDebtStorageKey(yearMonth: string): string {
  return `${DEBT_KEY_PREFIX}${yearMonth}`;
}

export function getBudgetShopDebtLinkKey(yearMonth: string): string {
  return `${BUDGET_DEBT_LINK_PREFIX}${yearMonth}`;
}

export function formatYearMonth(year: number, month1To12: number): string {
  return `${year}-${String(month1To12).padStart(2, '0')}`;
}

export function getAllYearMonthsForYear(year: number): string[] {
  const list: string[] = [];
  for (let m = 1; m <= 12; m++) {
    list.push(formatYearMonth(year, m));
  }
  return list;
}

export function parseDateToYearMonth(dateStr: string): string | null {
  const slashMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    if (month >= 1 && month <= 12 && year > 1900) {
      return formatYearMonth(year, month);
    }
  }

  const dashMatch = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const year = parseInt(dashMatch[1], 10);
    const month = parseInt(dashMatch[2], 10);
    if (month >= 1 && month <= 12 && year > 1900) {
      return formatYearMonth(year, month);
    }
  }
  return null;
}

export function getTodayDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// "DD/MM/YYYY" থেকে ঠিক ১ দিন আগের তারিখ বের করা
export function getPreviousDDMMYYYY(dateStr: string): string {
  const match = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    const prev = new Date(Date.now() - 86400000);
    return `${String(prev.getDate()).padStart(2, '0')}/${String(prev.getMonth() + 1).padStart(
      2,
      '0'
    )}/${prev.getFullYear()}`;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const year = parseInt(match[3], 10);

  const dt = new Date(year, month, day);
  if (Number.isNaN(dt.getTime())) {
    return getTodayDDMMYYYY();
  }
  dt.setDate(dt.getDate() - 1);

  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

export function getNextYearMonth(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (!year || !month) return yearMonth;
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getPrevYearMonth(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (!year || !month) return yearMonth;
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

const BENGALI_MONTH_NAMES: Record<string, string> = {
  '01': 'জানুয়ারী',
  '02': 'ফেব্রুয়ারি',
  '03': 'মার্চ',
  '04': 'এপ্রিল',
  '05': 'মে',
  '06': 'জুন',
  '07': 'জুলাই',
  '08': 'আগস্ট',
  '09': 'সেপ্টেম্বর',
  '10': 'অক্টোবর',
  '11': 'নভেম্বর',
  '12': 'ডিসেম্বর',
};

export function formatBengaliYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  const bnMonth = BENGALI_MONTH_NAMES[m] || m;
  return `${bnMonth} ${y}`;
}

// ঘনঘন ব্যবহৃত Unit অনুযায়ী সব ইউনিট সাজিয়ে রিটার্ন করা (সবচেয়ে বেশি ব্যবহৃত ইউনিট সবার আগে)
export async function getSortedUnitsByFrequency(): Promise<MeasurementUnit[]> {
  try {
    const raw = await AsyncStorage.getItem(UNIT_USAGE_KEY);
    const counts: Partial<Record<MeasurementUnit, number>> = raw ? JSON.parse(raw) : {};

    return [...ALL_UNITS].sort((a, b) => {
      const countA = counts[a] || 0;
      const countB = counts[b] || 0;
      if (countB !== countA) return countB - countA;
      return ALL_UNITS.indexOf(a) - ALL_UNITS.indexOf(b);
    });
  } catch {
    return [...ALL_UNITS];
  }
}

export async function recordUnitUsage(unit: MeasurementUnit): Promise<MeasurementUnit[]> {
  const cleanUnit = normalizeUnit(unit);
  try {
    const raw = await AsyncStorage.getItem(UNIT_USAGE_KEY);
    const counts: Partial<Record<MeasurementUnit, number>> = raw ? JSON.parse(raw) : {};
    counts[cleanUnit] = (counts[cleanUnit] || 0) + 1;
    await saveLocalData(UNIT_USAGE_KEY, counts);
  } catch (e) {
    console.log('Failed to record unit usage:', e);
  }
  return getSortedUnitsByFrequency();
}

export async function getProductCatalog(): Promise<ShopProductCatalogItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCT_CATALOG_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return (parsed as ShopProductCatalogItem[]).map((item) => ({
          ...item,
          defaultUnit: normalizeUnit(item.defaultUnit),
          defaultQuantity: Number(item.defaultQuantity) > 0 ? Number(item.defaultQuantity) : 1,
          defaultUnitPrice: fromCents(toCents(item.defaultUnitPrice)),
        }));
      }
    }
  } catch (e) {
    console.log('Failed to load product catalog:', e);
  }
  return [];
}

export async function upsertProductCatalogItem(
  name: string,
  unitPrice: number,
  quantity: number,
  unit: MeasurementUnit
): Promise<ShopProductCatalogItem[]> {
  const cleanName = name.trim();
  const cleanPrice = fromCents(toCents(unitPrice));
  const cleanQty = Number(quantity) > 0 ? Number(quantity) : 1;
  const cleanUnit = normalizeUnit(unit);

  if (!cleanName || cleanPrice <= 0) return getProductCatalog();

  const current = await getProductCatalog();
  const idx = current.findIndex(
    (item) => item.name.trim().toLowerCase() === cleanName.toLowerCase()
  );

  let updated: ShopProductCatalogItem[];
  if (idx >= 0) {
    updated = [...current];
    updated[idx] = {
      ...updated[idx],
      name: cleanName,
      defaultUnitPrice: cleanPrice,
      defaultQuantity: cleanQty,
      defaultUnit: cleanUnit,
    };
  } else {
    const newItem: ShopProductCatalogItem = {
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      defaultUnitPrice: cleanPrice,
      defaultQuantity: cleanQty,
      defaultUnit: cleanUnit,
    };
    updated = [newItem, ...current];
  }

  try {
    await saveLocalData(PRODUCT_CATALOG_KEY, updated);
  } catch (e) {
    console.log('Failed to save product catalog:', e);
  }
  return updated;
}

export async function syncDebtToNextMonthBudget(
  currentYearMonth: string,
  totalBalanceDue: number
): Promise<void> {
  const nextYM = getNextYearMonth(currentYearMonth);
  const linkKey = getBudgetShopDebtLinkKey(nextYM);
  const cleanTotal = fromCents(toCents(totalBalanceDue));

  try {
    const existingRaw = await AsyncStorage.getItem(linkKey);
    const existing: MonthlyBudgetShopDebtLink = existingRaw
      ? (JSON.parse(existingRaw) as MonthlyBudgetShopDebtLink)
      : {
          yearMonth: nextYM,
          carryoverDebtFromPrevMonth: 0,
          paidAmount: 0,
          updatedAt: new Date().toISOString(),
        };

    const updated: MonthlyBudgetShopDebtLink = {
      ...existing,
      yearMonth: nextYM,
      carryoverDebtFromPrevMonth: cleanTotal,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalData(linkKey, updated);
  } catch (error) {
    console.log('Failed to sync shop debt to next month budget:', error);
  }
}

export async function saveShopDebtPaymentFromBudget(
  yearMonth: string,
  paidAmount: number
): Promise<void> {
  const linkKey = getBudgetShopDebtLinkKey(yearMonth);
  const cleanPaid = Math.max(0, fromCents(toCents(paidAmount)));
  try {
    const existingRaw = await AsyncStorage.getItem(linkKey);
    const existing: MonthlyBudgetShopDebtLink = existingRaw
      ? (JSON.parse(existingRaw) as MonthlyBudgetShopDebtLink)
      : {
          yearMonth,
          carryoverDebtFromPrevMonth: 0,
          paidAmount: 0,
          updatedAt: new Date().toISOString(),
        };

    const updated: MonthlyBudgetShopDebtLink = {
      ...existing,
      yearMonth,
      paidAmount: cleanPaid,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalData(linkKey, updated);
  } catch (error) {
    console.log('Failed to save shop debt payment from budget:', error);
  }
}

export async function getBudgetShopDebtLink(
  yearMonth: string
): Promise<MonthlyBudgetShopDebtLink> {
  const linkKey = getBudgetShopDebtLinkKey(yearMonth);
  try {
    const raw = await AsyncStorage.getItem(linkKey);
    if (raw) {
      return JSON.parse(raw) as MonthlyBudgetShopDebtLink;
    }
  } catch (error) {
    console.log('Failed to read budget shop debt link:', error);
  }
  return {
    yearMonth,
    carryoverDebtFromPrevMonth: 0,
    paidAmount: 0,
    updatedAt: new Date().toISOString(),
  };
}