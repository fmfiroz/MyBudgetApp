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
  '@mybudget_savings_plans_v1',
];

function toSafeDocId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function pushAllLocalToFirebase(): Promise<number> {
  const user = auth.currentUser;
  if (!user) return 0;

  const allKeys = await AsyncStorage.getAllKeys();
  const keysToSync = Array.from(
    new Set([
      ...STATIC_SYNC_KEYS,
      ...allKeys.filter(
        (k) =>
          k.startsWith('@income_fy_') ||
          k.startsWith('@mybudget_budget_v3_') ||
          k.startsWith('@mybudget_savings_monthly_v1_') ||
          k.startsWith('@mybudget_shop_debt_v2_')
      ),
    ])
  );

  let count = 0;
  for (const key of keysToSync) {
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

export async function restoreAllFromFirebase(): Promise<number> {
  const user = auth.currentUser;
  if (!user) return 0;

  const snap = await getDocs(collection(db, 'users', user.uid, 'mybudget_backup'));
  let count = 0;

  for (const docSnap of snap.docs) {
    const payload = docSnap.data() as { key?: string; value?: unknown };
    if (!payload.key || payload.value === undefined) continue;

    const str =
      typeof payload.value === 'string'
        ? payload.value
        : JSON.stringify(payload.value);
    await AsyncStorage.setItem(payload.key, str);
    count += 1;
  }
  return count;
}