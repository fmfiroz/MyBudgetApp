
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SessionMode = 'guest' | 'registered' | null;

export interface AuthSessionState {
  mode: SessionMode;
  userId: string | null;
  email?: string | null;
  displayName?: string | null;
  updatedAt: string;
}

const SESSION_STORAGE_KEY = '@mybudget_auth_session_v1';
const PENDING_MIGRATION_KEY = '@mybudget_pending_guest_migration_v1';
const LOCAL_DATA_OWNER_KEY = '@mybudget_local_data_owner_v1';

const APP_DATA_PREFIXES = [
  '@income_fy_',
  '@mybudget_budget_v3_',
  '@mybudget_budget_rows_meta_',
  '@mybudget_savings_',
  '@mybudget_savings_monthly_v1_',
  '@mybudget_shop_debt_',
  '@mybudget_shop_debt_v2_',
  '@mybudget_debt_shops_',
  '@mybudget_welfare_',
  '@vehicle_',
  '@mybudget_dashboard_modules_',
  '@mybudget_app_language_',

  // Firebase static sync keys
  '@mybudget_app_language_v1',
  '@mybudget_dashboard_modules_v1',
  '@mybudget_debt_shops_v2',
  '@mybudget_budget_rows_meta_v3',
  '@mybudget_budget_rows_meta_v4',
  '@mybudget_savings_plans_v1',
  '@mybudget_welfare_fund_v1',
  '@vehicle_logsheet_table_v7',
];

export async function getAuthSession(): Promise<AuthSessionState> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return {
        mode: null,
        userId: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;

    return {
      mode:
        parsed.mode === 'guest' || parsed.mode === 'registered'
          ? parsed.mode
          : null,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      email: parsed.email ?? null,
      displayName: parsed.displayName ?? null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      mode: null,
      userId: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function clearAllLocalUserFinanceData(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();

    const keysToRemove = allKeys.filter(
      (key) =>
        key === PENDING_MIGRATION_KEY ||
        key === LOCAL_DATA_OWNER_KEY ||
        APP_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))
    );

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.log('Failed to clear local user finance data:', error);
    throw error;
  }
}

export async function startGuestSession(): Promise<AuthSessionState> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  if (currentOwner && currentOwner !== 'guest') {
    await clearAllLocalUserFinanceData();
  }

  const existing = await getAuthSession();

  const guestId =
    existing.mode === 'guest' && existing.userId
      ? existing.userId
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const nextState: AuthSessionState = {
    mode: 'guest',
    userId: guestId,
    displayName: 'Guest User',
    email: null,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.multiSet([
    [SESSION_STORAGE_KEY, JSON.stringify(nextState)],
    [LOCAL_DATA_OWNER_KEY, 'guest'],
  ]);

  return nextState;
}

export async function setRegisteredSession(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<AuthSessionState> {
  const nextState: AuthSessionState = {
    mode: 'registered',
    userId: params.userId,
    email: params.email ?? null,
    displayName: params.displayName ?? null,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.multiSet([
    [SESSION_STORAGE_KEY, JSON.stringify(nextState)],
    [LOCAL_DATA_OWNER_KEY, params.userId],
  ]);

  return nextState;
}

export async function collectAllLocalAppData(): Promise<Record<string, unknown>> {
  const allKeys = await AsyncStorage.getAllKeys();

  const relevantKeys = allKeys.filter((key) =>
    APP_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))
  );

  if (relevantKeys.length === 0) return {};

  const pairs = await AsyncStorage.multiGet(relevantKeys);
  const snapshot: Record<string, unknown> = {};

  for (const [key, rawValue] of pairs) {
    if (rawValue === null) continue;

    try {
      snapshot[key] = JSON.parse(rawValue);
    } catch {
      snapshot[key] = rawValue;
    }
  }

  return snapshot;
}

export async function hydrateLocalDataFromCloud(
  cloudData: Record<string, unknown> | null | undefined
): Promise<number> {
  if (!cloudData || typeof cloudData !== 'object') return 0;

  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(cloudData)) {
    if (!APP_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      continue;
    }

    if (value === undefined || value === null) continue;

    entries.push([
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]);
  }

  if (entries.length > 0) {
    await AsyncStorage.multiSet(entries);
  }

  return entries.length;
}

/**
 * Login / Account Switch-এর পর কল হবে:
 * - অন্য রেজিস্টার্ড ইউজারের লোকাল ডেটা থাকলে মুছে ফেলবে।
 * - Guest ডেটা থাকলে নতুন অ্যাকাউন্টের ক্লাউড ডেটা পরীক্ষা করবে।
 * - ক্লাউডে ডেটা থাকলে Guest ডেটা সরিয়ে ক্লাউড ডেটা Restore করবে।
 * - ক্লাউডে ডেটা না থাকলে Guest ডেটা ক্লাউডে Upload করবে।
 */
export async function syncUserAccountOnLogin(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  fetchCloudDataFn?: (
    userId: string
  ) => Promise<Record<string, unknown> | null>;
  saveCloudDataFn?: (
    userId: string,
    data: Record<string, unknown>
  ) => Promise<void>;
}): Promise<{
  hydratedCount: number;
  syncedGuestCount: number;
  clearedOtherUser: boolean;
}> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  let clearedOtherUser = false;

  // অন্য রেজিস্টার্ড ইউজারের ডেটা থাকলে সরিয়ে ফেলবে
  if (
    currentOwner &&
    currentOwner !== 'guest' &&
    currentOwner !== params.userId
  ) {
    await clearAllLocalUserFinanceData();
    clearedOtherUser = true;
  }

  // Guest ডেটা আগে সংগ্রহ করে রাখবে
  const guestSnapshot =
    currentOwner === 'guest'
      ? await collectAllLocalAppData()
      : {};

  const guestKeysCount = Object.keys(guestSnapshot).length;

  let hydratedCount = 0;
  let syncedGuestCount = 0;

  // প্রথমে নতুন অ্যাকাউন্টের Cloud Data পরীক্ষা করবে
  const cloudData = params.fetchCloudDataFn
    ? await params.fetchCloudDataFn(params.userId)
    : null;

  if (cloudData && Object.keys(cloudData).length > 0) {
    // Cloud Data থাকলে পুরোনো Local Data সরিয়ে Restore করবে
    await clearAllLocalUserFinanceData();

    hydratedCount = await hydrateLocalDataFromCloud(cloudData);
  } else if (guestKeysCount > 0 && params.saveCloudDataFn) {
    // Cloud Data না থাকলে Guest Data Upload করবে
    await params.saveCloudDataFn(params.userId, guestSnapshot);

    syncedGuestCount = guestKeysCount;
  }

  // সব কাজ সফল হওয়ার পর Registered Session সেট করবে
  await setRegisteredSession({
    userId: params.userId,
    email: params.email,
    displayName: params.displayName,
  });

  return {
    hydratedCount,
    syncedGuestCount,
    clearedOtherUser,
  };
}
