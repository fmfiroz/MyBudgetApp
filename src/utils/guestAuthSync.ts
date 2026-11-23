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
  '@mybudget_shop_debt_',
  '@mybudget_debt_shops_',
  '@mybudget_welfare_',
  '@vehicle_',
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

export async function syncGuestLocalDataOnRegistration(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  cloudSyncFn?: (userId: string, localData: Record<string, unknown>) => Promise<void>;
  cloudPullAndMergeFn?: (
    userId: string,
    localData: Record<string, unknown>
  ) => Promise<Record<string, unknown> | void>;
}): Promise<{ syncedCount: number; clearedOtherUser: boolean; queuedForRetry: boolean }> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  if (currentOwner && currentOwner !== 'guest' && currentOwner !== params.userId) {
    await clearAllLocalUserFinanceData();
    await setRegisteredSession({
      userId: params.userId,
      email: params.email,
      displayName: params.displayName,
    });
    if (params.cloudPullAndMergeFn) {
      await params.cloudPullAndMergeFn(params.userId, {});
    }
    return { syncedCount: 0, clearedOtherUser: true, queuedForRetry: false };
  }

  const localData = await collectAllLocalAppData();
  const syncedCount = Object.keys(localData).length;

  await setRegisteredSession({
    userId: params.userId,
    email: params.email,
    displayName: params.displayName,
  });

  if (syncedCount > 0 && params.cloudSyncFn) {
    try {
      await params.cloudSyncFn(params.userId, localData);
      await AsyncStorage.removeItem(PENDING_MIGRATION_KEY);
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

  if (params.cloudPullAndMergeFn) {
    try {
      const mergedData = await params.cloudPullAndMergeFn(params.userId, localData);
      if (mergedData && Object.keys(mergedData).length > 0) {
        const entries: [string, string][] = Object.entries(mergedData).map(([k, v]) => [
          k,
          typeof v === 'string' ? v : JSON.stringify(v),
        ]);
        await AsyncStorage.multiSet(entries);
      }
    } catch (e) {
      console.log('Cloud pull/merge failed:', e);
    }
  }

  return { syncedCount, clearedOtherUser: false, queuedForRetry: false };
}