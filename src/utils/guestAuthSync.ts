
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import {
  getPendingLocalChangesForUser,
  startFirebaseSync,
} from './firebaseSync';

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
const LOCAL_ACCOUNT_SNAPSHOT_PREFIX = '@mybudget_local_account_v1_';
const UNASSIGNED_LEGACY_DATA_KEY = '@mybudget_legacy_unassigned_v1';

export type ConfirmLegacyDataImport = (dataGroupCount: number) => Promise<boolean>;

const APP_DATA_PREFIXES = [
  '@income_fy_',
  '@mybudget_budget_v3_',
  '@mybudget_budget_rows_meta_',
  '@mybudget_savings_',
  '@mybudget_savings_monthly_v1_',
  '@mybudget_shop_debt_',
  '@mybudget_shop_debt_v2_',
  '@mybudget_shop_debt_v3_',
  '@mybudget_budget_shop_debt_link_',
  '@mybudget_shop_product_catalog_v2',
  '@mybudget_shop_unit_usage_v1',
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

function getLocalAccountSnapshotKey(userId: string): string {
  return `${LOCAL_ACCOUNT_SNAPSHOT_PREFIX}${encodeURIComponent(userId)}`;
}

async function saveLocalAccountSnapshot(
  userId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  if (Object.keys(snapshot).length === 0) return;

  await AsyncStorage.setItem(
    getLocalAccountSnapshotKey(userId),
    JSON.stringify(snapshot)
  );
}

async function getLocalAccountSnapshot(
  userId: string
): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem(getLocalAccountSnapshotKey(userId));
  if (!raw) return {};

  try {
    const snapshot = JSON.parse(raw) as Record<string, unknown>;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Local account snapshot has an invalid format.');
    }
    return snapshot;
  } catch (error) {
    console.error('Unable to read the local account snapshot:', error);
    throw error;
  }
}

async function readUnassignedLegacyData(): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem(UNASSIGNED_LEGACY_DATA_KEY);
  if (!raw) return {};

  try {
    const snapshot = JSON.parse(raw) as Record<string, unknown>;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Unassigned local data has an invalid format.');
    }
    return snapshot;
  } catch (error) {
    console.error('Unable to read unassigned local data:', error);
    throw error;
  }
}

async function quarantineUnownedLocalData(): Promise<Record<string, unknown>> {
  const currentData = await collectAllLocalAppData();
  if (Object.keys(currentData).length === 0) {
    return readUnassignedLegacyData();
  }

  const existingData = await readUnassignedLegacyData();
  const quarantinedData = { ...existingData, ...currentData };
  await AsyncStorage.setItem(
    UNASSIGNED_LEGACY_DATA_KEY,
    JSON.stringify(quarantinedData)
  );
  return quarantinedData;
}

async function claimUnassignedLegacyData(
  userId: string,
  confirmImport?: ConfirmLegacyDataImport
): Promise<number> {
  const unassignedData = await readUnassignedLegacyData();
  const dataGroupCount = Object.keys(unassignedData).length;
  if (dataGroupCount === 0 || !confirmImport) return 0;

  const confirmed = await confirmImport(dataGroupCount);
  if (!confirmed) return 0;

  const existingSnapshot = await getLocalAccountSnapshot(userId);
  await saveLocalAccountSnapshot(userId, {
    ...existingSnapshot,
    ...unassignedData,
  });
  await AsyncStorage.removeItem(UNASSIGNED_LEGACY_DATA_KEY);
  return dataGroupCount;
}

export async function startGuestSession(
  confirmLegacyDataImport?: ConfirmLegacyDataImport
): Promise<AuthSessionState> {
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);

  if (currentOwner && currentOwner !== 'guest') {
    const previousUserData = await collectAllLocalAppData();
    await saveLocalAccountSnapshot(currentOwner, previousUserData);
    await clearAllLocalUserFinanceData();
  } else if (!currentOwner) {
    const unassignedData = await quarantineUnownedLocalData();
    if (Object.keys(unassignedData).length > 0) {
      await clearAllLocalUserFinanceData();
    }
  }

  const existing = await getAuthSession();

  const guestId =
    existing.mode === 'guest' && existing.userId
      ? existing.userId
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const importedCount = await claimUnassignedLegacyData(
    guestId,
    confirmLegacyDataImport
  );
  if (importedCount > 0) {
    await hydrateLocalDataFromCloud(await getLocalAccountSnapshot(guestId));
  }

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
  cloudData: Record<string, unknown> | null | undefined,
  userId?: string
): Promise<number> {
  if (!cloudData || typeof cloudData !== 'object') return 0;
  if (userId && auth.currentUser?.uid !== userId) {
    throw new Error('Cannot restore data for a different signed-in user.');
  }

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

let accountInitializationQueue: Promise<void> = Promise.resolve();
let accountInitializationGeneration = 0;

function assertCurrentInitialization(userId: string, generation: number): void {
  if (
    accountInitializationGeneration !== generation ||
    auth.currentUser?.uid !== userId
  ) {
    throw new Error('Signed-in user changed while initializing account data.');
  }
}

async function initializeUserAccount(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  confirmLegacyDataImport?: ConfirmLegacyDataImport;
  fetchCloudDataFn?: (
    userId: string
  ) => Promise<Record<string, unknown> | null>;
  saveCloudDataFn?: (
    userId: string,
    data: Record<string, unknown>
  ) => Promise<void>;
}, generation: number): Promise<{
  hydratedCount: number;
  syncedGuestCount: number;
  clearedOtherUser: boolean;
}> {
  assertCurrentInitialization(params.userId, generation);
  const currentOwner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
  assertCurrentInitialization(params.userId, generation);

  let clearedOtherUser = false;

  if (
    currentOwner &&
    currentOwner !== 'guest' &&
    currentOwner !== params.userId
  ) {
    const previousUserData = await collectAllLocalAppData();
    assertCurrentInitialization(params.userId, generation);
    await saveLocalAccountSnapshot(currentOwner, previousUserData);
    assertCurrentInitialization(params.userId, generation);
  }

  const [guestSnapshot, accountSnapshot] = await Promise.all([
    currentOwner === 'guest' ? collectAllLocalAppData() : Promise.resolve({}),
    !currentOwner
      ? quarantineUnownedLocalData()
      : Promise.resolve({}),
  ]);
  assertCurrentInitialization(params.userId, generation);

  if (!currentOwner && Object.keys(accountSnapshot).length > 0) {
    await clearAllLocalUserFinanceData();
    assertCurrentInitialization(params.userId, generation);
  }

  await claimUnassignedLegacyData(
    params.userId,
    params.confirmLegacyDataImport
  );
  assertCurrentInitialization(params.userId, generation);
  const userAccountSnapshot = await getLocalAccountSnapshot(params.userId);
  assertCurrentInitialization(params.userId, generation);

  const cloudData = params.fetchCloudDataFn
    ? await params.fetchCloudDataFn(params.userId)
    : null;
  assertCurrentInitialization(params.userId, generation);
  const pendingChanges = await getPendingLocalChangesForUser(params.userId);
  assertCurrentInitialization(params.userId, generation);

  const cloudHasData = Boolean(cloudData && Object.keys(cloudData).length > 0);
  const activeUserSnapshot =
    currentOwner === params.userId
      ? await collectAllLocalAppData()
      : {};
  assertCurrentInitialization(params.userId, generation);

  const localFallback = {
    ...userAccountSnapshot,
    ...activeUserSnapshot,
    ...(!cloudHasData && currentOwner === 'guest' ? guestSnapshot : {}),
  };

  const restoredData = {
    ...localFallback,
    ...(cloudData ?? {}),
    ...pendingChanges,
  };

  if (currentOwner && currentOwner !== params.userId) {
    await clearAllLocalUserFinanceData();
    assertCurrentInitialization(params.userId, generation);
    clearedOtherUser = true;
  }

  const shouldUploadSnapshot =
    Object.keys(restoredData).length > 0 &&
    (!cloudHasData ||
      Object.keys(localFallback).length > 0 ||
      Object.keys(pendingChanges).length > 0);
  if (shouldUploadSnapshot && params.saveCloudDataFn) {
    assertCurrentInitialization(params.userId, generation);
    await params.saveCloudDataFn(params.userId, restoredData);
    assertCurrentInitialization(params.userId, generation);
  }

  const hydratedCount = await hydrateLocalDataFromCloud(
    restoredData,
    params.userId
  );
  assertCurrentInitialization(params.userId, generation);
  const syncedGuestCount =
    currentOwner === 'guest' ? Object.keys(guestSnapshot).length : 0;
  await setRegisteredSession({
    userId: params.userId,
    email: params.email,
    displayName: params.displayName,
  });
  assertCurrentInitialization(params.userId, generation);
  await startFirebaseSync(params.userId);

  return {
    hydratedCount,
    syncedGuestCount,
    clearedOtherUser,
  };
}

export function syncUserAccountOnLogin(params: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  confirmLegacyDataImport?: ConfirmLegacyDataImport;
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
  const generation = ++accountInitializationGeneration;
  const initialization = accountInitializationQueue.then(() =>
    initializeUserAccount(params, generation)
  );
  accountInitializationQueue = initialization.then(
    () => undefined,
    () => undefined
  );
  return initialization;
}
