
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
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
];

const SYNC_PREFIXES = [
  '@income_fy_',
  '@mybudget_budget_v3_',
  '@mybudget_savings_monthly_v1_',
  '@mybudget_savings_',
  '@mybudget_shop_debt_v2_',
  '@mybudget_welfare_',
  '@vehicle_',
];

function toSafeDocId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isSyncKey(key: string): boolean {
  return (
    STATIC_SYNC_KEYS.includes(key) ||
    SYNC_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

// Collect all supported local data
export async function collectLocalSyncData(): Promise<
  Record<string, unknown>
> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter(isSyncKey);

  if (keys.length === 0) return {};

  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, unknown> = {};

  for (const [key, raw] of pairs) {
    if (raw === null) continue;

    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }

  return data;
}

// Fetch Firebase data without modifying local storage
export async function fetchAllFirebaseData(
  targetUid: string
): Promise<Record<string, unknown>> {
  const snap = await getDocs(
    collection(db, 'users', targetUid, 'mybudget_backup')
  );

  const data: Record<string, unknown> = {};

  for (const item of snap.docs) {
    const payload = item.data() as {
      key?: string;
      value?: unknown;
    };

    if (
      payload.key &&
      payload.value !== undefined &&
      payload.value !== null &&
      isSyncKey(payload.key)
    ) {
      data[payload.key] = payload.value;
    }
  }

  return data;
}

// Save Guest or local snapshot to a Firebase account
export async function saveSnapshotToFirebase(
  targetUid: string,
  data: Record<string, unknown>
): Promise<number> {
  let count = 0;

  for (const [key, value] of Object.entries(data)) {
    if (!isSyncKey(key) || value === undefined || value === null) {
      continue;
    }

    await setDoc(
      doc(
        db,
        'users',
        targetUid,
        'mybudget_backup',
        toSafeDocId(key)
      ),
      {
        key,
        value,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    count++;
  }

  return count;
}

// Push all supported local data to Firebase
export async function pushAllLocalToFirebase(
  targetUid?: string
): Promise<number> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid) return 0;

  const data = await collectLocalSyncData();

  return saveSnapshotToFirebase(uid, data);
}

// Restore Firebase data to local storage
export async function restoreAllFromFirebase(
  targetUid?: string
): Promise<number> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid) return 0;

  const cloudData = await fetchAllFirebaseData(uid);
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(cloudData)) {
    if (!isSyncKey(key) || value === undefined || value === null) {
      continue;
    }

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

let isSyncingToCloud = false;
let pendingSyncAgain = false;

/**
 * Call after saving local data.
 * Runs background Firebase sync serially.
 */
export async function syncLocalToFirebaseSafely(
  targetUid?: string
): Promise<void> {
  const uid = targetUid || auth.currentUser?.uid;
  if (!uid) return;

  if (isSyncingToCloud) {
    pendingSyncAgain = true;
    return;
  }

  isSyncingToCloud = true;

  try {
    do {
      pendingSyncAgain = false;
      await pushAllLocalToFirebase(uid);
    } while (pendingSyncAgain);
  } catch (e) {
    console.log('Background cloud sync skipped/failed:', e);
  } finally {
    isSyncingToCloud = false;
  }
}
