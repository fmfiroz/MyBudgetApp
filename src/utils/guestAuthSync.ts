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
// লোকাল স্টোরেজে থাকা বর্তমান ডেটার মালিক কে ('guest' নাকি নির্দিষ্ট Firebase UID)
const LOCAL_DATA_OWNER_KEY = '@mybudget_local_data_owner_v1';

const APP_DATA_PREFIXES = [
  '@income_fy_',
  '@mybudget_budget_v3_',
  '@mybudget_budget_rows_meta_',
  '@mybudget_savings_',
  '@mybudget_shop_debt_',
  '@mybudget_debt_shops_',
  '@mybudget_welfare_',
  '@vehicle_',
  '@mybudget_app_language_',
];

export async function getAuthSession(): Promise<AuthSessionState> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return { mode: null, userId: null, updatedAt: new Date().toISOString() };
    }
    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;
    return {
      mode: parsed.mode === 'guest' || parsed.mode === 'registered' ? parsed.mode : null,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      email: parsed.email ?? null,
      displayName: parsed.displayName ?? null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return { mode: null, userId: null, updatedAt: new Date().toISOString() };
  }
}

export async function clearAllLocalUserFinanceData(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      (k) =>
        k === PENDING_MIGRATION_KEY ||
        k === LOCAL_DATA_OWNER_KEY ||
        APP_DATA_PREFIXES.some((prefix) => k.startsWith(prefix))
    );
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (e) {
    console.log('Failed to clear local user finance data:', e);
  }
}

export async function startGuestSession(): Promise<AuthSessionState> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  // যদি আগে কোনো রেজিস্টার্ড ইউজারের ডেটা লোকালে থেকে থাকে, তবে গেস্ট শুরু করার আগে তা মুছে ফেলা হবে
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
  const relevantKeys = allKeys.filter((k) =>
    APP_DATA_PREFIXES.some((prefix) => k.startsWith(prefix))
  );

  if (relevantKeys.length === 0) return {};

  const pairs = await AsyncStorage.multiGet(relevantKeys);
  const snapshot: Record<string, unknown> = {};

  for (const [key, rawVal] of pairs) {
    if (!rawVal) continue;
    try {
      snapshot[key] = JSON.parse(rawVal);
    } catch {
      snapshot[key] = rawVal;
    }
  }

  return snapshot;
}

/**
 * Login বা Registration-এর পর কল হবে:
 * - যদি লোকাল ডেটা 'guest'-এর হয় (অথবা মালিক সেট না থাকে), তবে নতুন অ্যাকাউন্টে সিঙ্ক করবে।
 * - যদি লোকাল ডেটা অন্য কোনো রেজিস্টার্ড ইউজারের হয় (owner !== userId), তবে আগের ইউজারের ডেটা মুছে ফেলবে যাতে মিশে না যায়।
 */
export async function syncGuestLocalDataOnRegistration(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  cloudSyncFn?: (userId: string, localData: Record<string, unknown>) => Promise<void>;
}): Promise<{ syncedCount: number; clearedOtherUser: boolean; queuedForRetry: boolean }> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  // অন্য কোনো রেজিস্টার্ড অ্যাকাউন্টের ডেটা লোকালে থাকলে তা পরিষ্কার করে দেওয়া
  if (currentOwner && currentOwner !== 'guest' && currentOwner !== params.userId) {
    await clearAllLocalUserFinanceData();
    await setRegisteredSession({
      userId: params.userId,
      email: params.email,
      displayName: params.displayName,
    });
    return { syncedCount: 0, clearedOtherUser: true, queuedForRetry: false };
  }

  const localData = await collectAllLocalAppData();
  const syncedCount = Object.keys(localData).length;

  await setRegisteredSession({
    userId: params.userId,
    email: params.email,
    displayName: params.displayName,
  });

  if (syncedCount === 0) {
    return { syncedCount: 0, clearedOtherUser: false, queuedForRetry: false };
  }

  if (params.cloudSyncFn) {
    try {
      await params.cloudSyncFn(params.userId, localData);
      await AsyncStorage.removeItem(PENDING_MIGRATION_KEY);
      return { syncedCount, clearedOtherUser: false, queuedForRetry: false };
    } catch {
      await AsyncStorage.setItem(
        PENDING_MIGRATION_KEY,
        JSON.stringify({
          userId: params.userId,
          localData,
          savedAt: new Date().toISOString(),
        })
      );
      return { syncedCount, clearedOtherUser: false, queuedForRetry: true };
    }
  }

  return { syncedCount, clearedOtherUser: false, queuedForRetry: false };
}