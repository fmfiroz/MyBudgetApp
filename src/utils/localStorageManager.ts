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

export const FIREBASE_SYNC_ENABLED_KEY = '@mybudget_firebase_sync_enabled_v1';

const STATIC_DATA_KEYS = [
  '@mybudget_app_language_v1',
  '@mybudget_dashboard_modules_v1',
  '@mybudget_debt_shops_v2',
  '@mybudget_budget_rows_meta_v3',
  '@mybudget_savings_plans_v1',
];

function toSafeDocId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function isMyBudgetDataKey(key: string): boolean {
  if (STATIC_DATA_KEYS.includes(key)) return true;
  return (
    key.startsWith('@income_fy_') ||
    key.startsWith('@mybudget_budget_v3_') ||
    key.startsWith('@mybudget_savings_monthly_v1_') ||
    key.startsWith('@mybudget_shop_debt_v2_')
  );
}

export async function isFirebaseSyncEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(FIREBASE_SYNC_ENABLED_KEY);
    if (val === null) return true; // ডিফল্ট হিসেবে ON
    return val === 'true';
  } catch {
    return true;
  }
}

export async function setFirebaseSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(FIREBASE_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * সবসময় আগে Local Storage (AsyncStorage)-এ সেভ করে।
 * ইউজার Firebase Sync চালু রাখলে তবেই Firestore-এ পুশ করে; না রাখলে শুধু Local-েই থাকে।
 */
export async function saveToLocalFirst(
  storageKey: string,
  value: unknown,
  forceFirebaseSync = false
): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await AsyncStorage.setItem(storageKey, serialized);

  const syncAllowed = forceFirebaseSync || (await isFirebaseSyncEnabled());
  if (!syncAllowed) return;

  const user = auth.currentUser;
  if (!user) return;

  try {
    const docRef = doc(
      db,
      'users',
      user.uid,
      'mybudget_backup',
      toSafeDocId(storageKey)
    );
    await setDoc(
      docRef,
      {
        key: storageKey,
        value,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.log('Firebase sync skipped/deferred:', err);
  }
}

/**
 * Firebase Sync চালু থাকলে Local থেকে Firestore-এ সব ডেটা পাঠায়।
 */
export async function syncLocalToFirebaseIfEnabled(): Promise<number> {
  const enabled = await isFirebaseSyncEnabled();
  if (!enabled) return 0;

  const user = auth.currentUser;
  if (!user) return 0;

  const allKeys = await AsyncStorage.getAllKeys();
  const targetKeys = allKeys.filter(isMyBudgetDataKey);
  let count = 0;

  for (const key of targetKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) continue;

    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    const ref = doc(db, 'users', user.uid, 'mybudget_backup', toSafeDocId(key));
    await setDoc(
      ref,
      {
        key,
        value: parsed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    count += 1;
  }

  return count;
}

/**
 * Firebase Sync চালু থাকলে Firestore থেকে Local (AsyncStorage)-এ রিস্টোর করে।
 */
export async function restoreFromFirebaseIfEnabled(): Promise<number> {
  const enabled = await isFirebaseSyncEnabled();
  if (!enabled) return 0;

  const user = auth.currentUser;
  if (!user) return 0;

  const snap = await getDocs(collection(db, 'users', user.uid, 'mybudget_backup'));
  let count = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as { key?: string; value?: unknown };
    if (!data.key || data.value === undefined) continue;

    const serialized =
      typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    await AsyncStorage.setItem(data.key, serialized);
    count += 1;
  }

  return count;
}

/**
 * Firebase ছাড়াই লোকাল স্টোরেজের সব ডেটা JSON ব্যাকআপ হিসেবে তৈরি করে
 * (আনইনস্টলের আগে ফোনে সংরক্ষণ করার জন্য)।
 */
export async function createLocalBackupJson(): Promise<string> {
  const allKeys = await AsyncStorage.getAllKeys();
  const targetKeys = allKeys.filter(isMyBudgetDataKey);
  const entries: Record<string, string> = {};

  for (const key of targetKeys) {
    const val = await AsyncStorage.getItem(key);
    if (val !== null) {
      entries[key] = val;
    }
  }

  return JSON.stringify(
    {
      app: 'My Budget',
      exportedAt: new Date().toISOString(),
      entries,
    },
    null,
    2
  );
}

/**
 * সংরক্ষিত JSON ব্যাকআপ থেকে লোকাল স্টোরেজে (AsyncStorage) সব ডেটা রিস্টোর করে
 * (অ্যাপ পুনরায় ইনস্টল করার পর)।
 */
export async function restoreLocalBackupFromJson(jsonText: string): Promise<number> {
  const parsed = JSON.parse(jsonText) as {
    entries?: Record<string, string>;
  };

  if (!parsed || typeof parsed.entries !== 'object' || parsed.entries === null) {
    throw new Error('Invalid backup file format.');
  }

  let restoredCount = 0;
  for (const [key, serializedValue] of Object.entries(parsed.entries)) {
    if (!isMyBudgetDataKey(key) || typeof serializedValue !== 'string') continue;
    await AsyncStorage.setItem(key, serializedValue);
    restoredCount += 1;
  }

  return restoredCount;
}