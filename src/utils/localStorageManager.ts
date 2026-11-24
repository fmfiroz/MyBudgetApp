import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSyncKey, saveLocalData } from './firebaseSync';

export function isMyBudgetDataKey(key: string): boolean {
  return isSyncKey(key);
}

/**
 * সবসময় আগে Local Storage (AsyncStorage)-এ সেভ করে।
 * Signed-in users' changes are queued for automatic Firestore synchronization.
 */
export async function saveToLocalFirst(
  storageKey: string,
  value: unknown
): Promise<void> {
  await saveLocalData(storageKey, value);
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
    await saveLocalData(key, serializedValue);
    restoredCount += 1;
  }

  return restoredCount;
}