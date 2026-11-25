import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { AppState, AppStateStatus } from 'react-native';
import { auth } from '../firebase';

const db = getFirestore();

const STATIC_SYNC_KEYS = [
  '@mybudget_app_language_v1',
  '@mybudget_dashboard_modules_v1',
  '@mybudget_debt_shops_v2',
  '@mybudget_budget_rows_meta_v3',
  '@mybudget_budget_rows_meta_v4',
  '@mybudget_savings_plans_v1',
  '@mybudget_welfare_fund_v1',
  '@vehicle_logsheet_table_v7',
  '@vehicle_saved_items_v1',
  '@mybudget_shop_product_catalog_v2',
  '@mybudget_shop_unit_usage_v1',
];

const SYNC_PREFIXES = [
  '@income_fy_',
  '@mybudget_budget_v3_',
  '@mybudget_budget_shop_debt_link_',
  '@mybudget_savings_monthly_v1_',
  '@mybudget_savings_',
  '@mybudget_shop_debt_v2_',
  '@mybudget_shop_debt_v3_',
  '@mybudget_welfare_',
  '@vehicle_',
  '@MyBudgetApp_SocialReligious_',
];

const PENDING_PREFIX = '@mybudget_sync_pending_v1_';
const META_TIME_PREFIX = '@mybudget_sync_ts_v1_';
const LOCAL_DATA_OWNER_KEY = '@mybudget_local_data_owner_v1';

const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const syncQueues = new Map<string, Promise<void>>();
let unsubscribeSnapshot: (() => void) | null = null;
let unsubscribeAppState: { remove: () => void } | null = null;
let activeSyncUid: string | null = null;
let syncSessionToken = 0;

function toSafeDocId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function pendingKey(uid: string, key: string): string {
  return `${PENDING_PREFIX}${uid}_${encodeURIComponent(key)}`;
}

function isPendingKeyForUid(value: string, uid: string): boolean {
  return value.startsWith(`${PENDING_PREFIX}${uid}_`);
}

function localTimestampKey(uid: string, key: string): string {
  return `${META_TIME_PREFIX}${uid}_${encodeURIComponent(key)}`;
}

export function isSyncKey(key: string): boolean {
  return (
    STATIC_SYNC_KEYS.includes(key) ||
    SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function parseStoredValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toEpochMs(ts: unknown): number {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

async function getLocalUpdatedAt(uid: string, key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(localTimestampKey(uid, key));
  return raw ? Number(raw) || 0 : 0;
}

async function setLocalUpdatedAt(
  uid: string,
  key: string,
  ts: number
): Promise<void> {
  await AsyncStorage.setItem(localTimestampKey(uid, key), String(ts));
}

export async function collectLocalSyncData(): Promise<Record<string, unknown>> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter(isSyncKey);
  const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const data: Record<string, unknown> = {};

  for (const [key, raw] of pairs) {
    if (raw !== null) data[key] = parseStoredValue(raw);
  }

  return data;
}

export async function getPendingLocalChangesForUser(
  uid: string
): Promise<Record<string, unknown>> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter((key) => isPendingKeyForUid(key, uid));
  const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const changes: Record<string, unknown> = {};

  for (const [, raw] of pairs) {
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as { key?: string; value?: unknown };
      if (entry.key && isSyncKey(entry.key) && entry.value !== undefined) {
        changes[entry.key] = entry.value;
      }
    } catch (error) {
      console.error('Unable to read a pending Firebase change:', error);
    }
  }

  return changes;
}

export async function fetchAllFirebaseData(
  targetUid: string
): Promise<Record<string, unknown>> {
  if (auth.currentUser?.uid !== targetUid) {
    throw new Error('Cannot read cloud data for a different signed-in user.');
  }

  const snap = await getDocs(
    collection(db, 'users', targetUid, 'mybudget_backup')
  );
  if (auth.currentUser?.uid !== targetUid) {
    throw new Error('Signed-in user changed while loading cloud data.');
  }
  const data: Record<string, unknown> = {};

  for (const item of snap.docs) {
    const payload = item.data() as { key?: string; value?: unknown };
    if (payload.key && payload.value !== undefined && isSyncKey(payload.key)) {
      data[payload.key] = payload.value;
    }
  }

  return data;
}

export async function saveSnapshotToFirebase(
  targetUid: string,
  data: Record<string, unknown>
): Promise<number> {
  if (auth.currentUser?.uid !== targetUid) {
    throw new Error('Cannot write cloud data for a different signed-in user.');
  }

  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (auth.currentUser?.uid !== targetUid) {
      throw new Error('Signed-in user changed while saving cloud data.');
    }
    if (!isSyncKey(key) || value === undefined || value === null) continue;

    const nowMs = Date.now();
    await setLocalUpdatedAt(targetUid, key, nowMs);
    await setDoc(
      doc(db, 'users', targetUid, 'mybudget_backup', toSafeDocId(key)),
      {
        key,
        value,
        updatedAt: new Date(nowMs).toISOString(),
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    count++;
  }

  return count;
}

async function queuePendingChange(
  uid: string,
  key: string,
  value: unknown,
  updatedAtMs: number
): Promise<void> {
  await AsyncStorage.setItem(
    pendingKey(uid, key),
    JSON.stringify({ key, value, updatedAtMs })
  );
}

export async function saveLocalData(
  storageKey: string,
  value: unknown
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const parsed = parseStoredValue(serialized);
  const nowMs = Date.now();

  await AsyncStorage.setItem(storageKey, serialized);

  if (!uid || !isSyncKey(storageKey) || auth.currentUser?.uid !== uid) return;

  const owner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
  if (owner === 'guest' || (owner && owner !== uid)) {
    return;
  }
  if (!owner) {
    await AsyncStorage.setItem(LOCAL_DATA_OWNER_KEY, uid);
  }

  if (auth.currentUser?.uid !== uid) return;

  await setLocalUpdatedAt(uid, storageKey, nowMs);
  await queuePendingChange(uid, storageKey, parsed, nowMs);
  if (auth.currentUser?.uid !== uid) return;

  void syncLocalToFirebaseSafely(uid);
}

export async function pushAllLocalToFirebase(
  targetUid?: string
): Promise<number> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid || auth.currentUser?.uid !== uid) return 0;
  const data = await collectLocalSyncData();
  return saveSnapshotToFirebase(uid, data);
}

export async function restoreAllFromFirebase(
  targetUid?: string
): Promise<number> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid || auth.currentUser?.uid !== uid) return 0;

  const cloudData = await fetchAllFirebaseData(uid);
  if (auth.currentUser?.uid !== uid) return 0;
  const pending = await getPendingLocalChangesForUser(uid);
  if (auth.currentUser?.uid !== uid) return 0;
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(cloudData)) {
    if (pending[key] !== undefined || value === null) continue;
    entries.push([
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]);
  }

  if (entries.length) await AsyncStorage.multiSet(entries);
  return entries.length;
}

async function flushPendingChanges(uid: string): Promise<void> {
  if (auth.currentUser?.uid !== uid) return;
  const owner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
  if (owner !== uid) return;

  const allKeys = await AsyncStorage.getAllKeys();
  const pendingKeys = allKeys.filter((key) => isPendingKeyForUid(key, uid));
  const pairs = pendingKeys.length
    ? await AsyncStorage.multiGet(pendingKeys)
    : [];

  for (const [queueKey, raw] of pairs) {
    if (!raw || auth.currentUser?.uid !== uid) return;

    const entry = JSON.parse(raw) as {
      key: string;
      value: unknown;
      updatedAtMs?: number;
    };
    if (!isSyncKey(entry.key)) {
      await AsyncStorage.removeItem(queueKey);
      continue;
    }

    const tsMs =
      entry.updatedAtMs || (await getLocalUpdatedAt(uid, entry.key)) || Date.now();
    await setDoc(
      doc(db, 'users', uid, 'mybudget_backup', toSafeDocId(entry.key)),
      {
        key: entry.key,
        value: entry.value,
        updatedAt: new Date(tsMs).toISOString(),
        updatedAtMs: tsMs,
      },
      { merge: true }
    );

    if ((await AsyncStorage.getItem(queueKey)) === raw) {
      await AsyncStorage.removeItem(queueKey);
    }
  }
}

export async function syncLocalToFirebaseSafely(
  targetUid?: string
): Promise<void> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid || auth.currentUser?.uid !== uid) return;

  const previousSync = syncQueues.get(uid) || Promise.resolve();
  const currentSync = previousSync
    .catch(() => undefined)
    .then(() => flushPendingChanges(uid));
  syncQueues.set(uid, currentSync);

  try {
    await currentSync;
  } catch (error) {
    console.warn('Firebase sync is waiting for a network connection:', error);
    if (auth.currentUser?.uid === uid && !retryTimers.has(uid)) {
      retryTimers.set(
        uid,
        setTimeout(() => {
          retryTimers.delete(uid);
          void syncLocalToFirebaseSafely(uid);
        }, 15000)
      );
    }
  } finally {
    if (syncQueues.get(uid) === currentSync) {
      syncQueues.delete(uid);
    }
  }
}

export function stopFirebaseSync(): void {
  syncSessionToken++;
  unsubscribeSnapshot?.();
  unsubscribeSnapshot = null;
  unsubscribeAppState?.remove();
  unsubscribeAppState = null;
  if (activeSyncUid) {
    const timer = retryTimers.get(activeSyncUid);
    if (timer) clearTimeout(timer);
    retryTimers.delete(activeSyncUid);
  }
  activeSyncUid = null;
}

export async function startFirebaseSync(uid: string): Promise<void> {
  if (auth.currentUser?.uid !== uid) return;
  const owner = await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY);
  if (owner !== uid) return;

  if (activeSyncUid === uid && unsubscribeSnapshot) {
    void syncLocalToFirebaseSafely(uid);
    return;
  }

  stopFirebaseSync();
  const currentToken = syncSessionToken;
  activeSyncUid = uid;

  // Firestore-এ কোনো ডকুমেন্ট না থাকলে লোকাল (AsyncStorage) থেকে পূরণ করা
  const localData = await collectLocalSyncData();
  if (
    currentToken !== syncSessionToken ||
    auth.currentUser?.uid !== uid ||
    (await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY)) !== uid
  ) {
    return;
  }

  const localEntries = Object.entries(localData);
  if (localEntries.length) {
    const cloudSnap = await getDocs(
      collection(db, 'users', uid, 'mybudget_backup')
    );
    if (
      currentToken !== syncSessionToken ||
      auth.currentUser?.uid !== uid ||
      (await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY)) !== uid
    ) {
      return;
    }

    const existingKeys = new Set<string>();
    for (const d of cloudSnap.docs) {
      const p = d.data() as { key?: string };
      if (p.key) existingKeys.add(p.key);
    }
    for (const [key, value] of localEntries) {
      if (!existingKeys.has(key) && value !== undefined && value !== null) {
        const tsMs = (await getLocalUpdatedAt(uid, key)) || Date.now();
        await setDoc(
          doc(db, 'users', uid, 'mybudget_backup', toSafeDocId(key)),
          {
            key,
            value,
            updatedAt: new Date(tsMs).toISOString(),
            updatedAtMs: tsMs,
          },
          { merge: true }
        );
      }
    }
  }

  if (
    currentToken !== syncSessionToken ||
    auth.currentUser?.uid !== uid ||
    (await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY)) !== uid
  ) {
    return;
  }

  unsubscribeSnapshot = onSnapshot(
    collection(db, 'users', uid, 'mybudget_backup'),
    { includeMetadataChanges: true },
    async (snapshot) => {
      if (
        currentToken !== syncSessionToken ||
        snapshot.metadata.fromCache ||
        auth.currentUser?.uid !== uid ||
        (await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY)) !== uid
      ) {
        return;
      }

      const pending = await getPendingLocalChangesForUser(uid);
      const entries: [string, string][] = [];

      for (const document of snapshot.docs) {
        if (document.metadata.hasPendingWrites) continue;
        const payload = document.data() as {
          key?: string;
          value?: unknown;
          updatedAt?: unknown;
          updatedAtMs?: unknown;
        };
        if (
          !payload.key ||
          !isSyncKey(payload.key) ||
          payload.value === undefined ||
          pending[payload.key] !== undefined
        ) {
          continue;
        }

        const remoteTs = toEpochMs(payload.updatedAtMs ?? payload.updatedAt);
        const localTs = await getLocalUpdatedAt(uid, payload.key);

        if (remoteTs >= localTs) {
          await setLocalUpdatedAt(uid, payload.key, remoteTs || Date.now());
          entries.push([
            payload.key,
            typeof payload.value === 'string'
              ? payload.value
              : JSON.stringify(payload.value),
          ]);
        }
      }

      if (
        currentToken !== syncSessionToken ||
        auth.currentUser?.uid !== uid ||
        (await AsyncStorage.getItem(LOCAL_DATA_OWNER_KEY)) !== uid
      ) {
        return;
      }
      if (entries.length) await AsyncStorage.multiSet(entries);
      void syncLocalToFirebaseSafely(uid);
    },
    (error) => {
      console.error('Firebase account listener failed:', error);
    }
  );

  const onAppStateChange = (state: AppStateStatus) => {
    if (
      state === 'active' &&
      currentToken === syncSessionToken &&
      auth.currentUser?.uid === uid
    ) {
      void syncLocalToFirebaseSafely(uid);
    }
  };
  unsubscribeAppState = AppState.addEventListener('change', onAppStateChange);
  if (AppState.currentState === 'active') onAppStateChange('active');
}