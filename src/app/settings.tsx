import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ALL_DASHBOARD_MODULES,
  DASHBOARD_ENABLED_MODULES_KEY,
  DEFAULT_ENABLED_MODULE_IDS,
} from '../constants/dashboardModules';
import {
  isFirebaseSyncEnabled,
  restoreFromFirebaseIfEnabled,
  saveToLocalFirst,
  setFirebaseSyncEnabled,
  syncLocalToFirebaseIfEnabled,
} from '../utils/localStorageManager';

export type AppLanguage = 'en' | 'bn';

interface ShopProfile {
  id: string;
  name: string;
}

const SHOPS_LIST_KEY = '@mybudget_debt_shops_v2';
const LANGUAGE_STORAGE_KEY = '@mybudget_app_language_v1';

export default function SettingsScreen() {
  const router = useRouter();

  const [lang, setLang] = useState<AppLanguage>('en');
  const [firebaseSyncOn, setFirebaseSyncOn] = useState<boolean>(true);
  const [syncingNow, setSyncingNow] = useState<boolean>(false);

  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>(
    DEFAULT_ENABLED_MODULE_IDS
  );
  const [shops, setShops] = useState<ShopProfile[]>([]);
  const [newShopName, setNewShopName] = useState<string>('');

  // Strict Delete Shop Confirmation Modal স্টেট
  const [deleteTargetShop, setDeleteTargetShop] = useState<ShopProfile | null>(null);
  const [deleteShopChecked, setDeleteShopChecked] = useState<boolean>(false);
  const [deleteShopTypedConfirm, setDeleteShopTypedConfirm] = useState<string>('');

  const loadSettings = useCallback(async () => {
    try {
      const [savedLang, savedModules, savedShops, syncEnabled] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem(DASHBOARD_ENABLED_MODULES_KEY),
        AsyncStorage.getItem(SHOPS_LIST_KEY),
        isFirebaseSyncEnabled(),
      ]);

      setFirebaseSyncOn(syncEnabled);

      if (savedLang === 'en' || savedLang === 'bn') {
        setLang(savedLang);
      }

      if (savedModules) {
        const parsedMods = JSON.parse(savedModules);
        if (Array.isArray(parsedMods)) {
          const cleanIds = parsedMods.filter((id): id is string => typeof id === 'string');
          setEnabledModuleIds(cleanIds);
        }
      }

      if (savedShops) {
        const parsed = JSON.parse(savedShops);
        if (Array.isArray(parsed)) {
          setShops(parsed);
          return;
        }
      }
      setShops([]);
    } catch (e) {
      console.log('Failed to load settings:', e);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleFirebaseSync = async (nextValue: boolean) => {
    setFirebaseSyncOn(nextValue);
    await setFirebaseSyncEnabled(nextValue);
    if (nextValue) {
      syncLocalToFirebaseIfEnabled().catch(() => {});
    }
  };

  const handleManualPushSync = async () => {
    if (!firebaseSyncOn) {
      Alert.alert(
        lang === 'bn' ? 'সিঙ্ক বন্ধ আছে' : 'Sync is OFF',
        lang === 'bn'
          ? 'ক্লাউডে ব্যাকআপ নিতে আগে Firebase Cloud Sync চালু (ON) করুন।'
          : 'Please turn ON Firebase Cloud Sync first to backup data.'
      );
      return;
    }

    try {
      setSyncingNow(true);
      const count = await syncLocalToFirebaseIfEnabled();
      Alert.alert(
        lang === 'bn' ? 'সিঙ্ক সম্পন্ন' : 'Sync Complete',
        lang === 'bn'
          ? `মোট ${count} টি ডেটা রেকর্ড Firebase-এ আপডেট হয়েছে।`
          : `Successfully synced ${count} records to Firebase.`
      );
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Unable to sync with Firebase.');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleManualRestoreSync = async () => {
    if (!firebaseSyncOn) {
      Alert.alert(
        lang === 'bn' ? 'সিঙ্ক বন্ধ আছে' : 'Sync is OFF',
        lang === 'bn'
          ? 'ক্লাউড থেকে ডেটা আনতে আগে Firebase Cloud Sync চালু (ON) করুন।'
          : 'Please turn ON Firebase Cloud Sync first to restore data.'
      );
      return;
    }

    try {
      setSyncingNow(true);
      const count = await restoreFromFirebaseIfEnabled();
      await loadSettings();
      Alert.alert(
        lang === 'bn' ? 'রিস্টোর সম্পন্ন' : 'Restore Complete',
        lang === 'bn'
          ? `Firebase থেকে ${count} টি ডেটা রেকর্ড লোকাল স্টোরেজে আনা হয়েছে।`
          : `Restored ${count} records from Firebase to local storage.`
      );
    } catch (err: any) {
      Alert.alert('Restore Error', err?.message || 'Unable to restore from Firebase.');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleSelectLanguage = async (nextLang: AppLanguage) => {
    setLang(nextLang);
    try {
      await saveToLocalFirst(LANGUAGE_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }
  };

  const handleToggleDashboardModule = async (moduleId: string) => {
    const safeList = Array.isArray(enabledModuleIds)
      ? enabledModuleIds
      : DEFAULT_ENABLED_MODULE_IDS;
    const exists = safeList.includes(moduleId);
    const updatedIds = exists
      ? safeList.filter((id) => id !== moduleId)
      : [...safeList, moduleId];

    setEnabledModuleIds(updatedIds);
    try {
      await saveToLocalFirst(DASHBOARD_ENABLED_MODULES_KEY, updatedIds);
    } catch {
      // ignore
    }
  };

  const handleAddShop = async () => {
    const cleanName = newShopName.trim();
    if (!cleanName) {
      Alert.alert(
        lang === 'bn' ? 'দোকানের নাম দিন' : 'Shop Name Required',
        lang === 'bn'
          ? 'নতুন দোকানের নাম লিখুন।'
          : 'Please enter a shop name.'
      );
      return;
    }

    const exists = shops.some((s) => s.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      Alert.alert(
        lang === 'bn' ? 'ইতিমধ্যে আছে' : 'Duplicate Shop',
        lang === 'bn'
          ? 'এই নামের দোকান ইতিমধ্যে তালিকায় রয়েছে।'
          : 'A shop with this name already exists.'
      );
      return;
    }

    const newShop: ShopProfile = {
      id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
    };

    const updated = [...shops, newShop];
    setShops(updated);
    setNewShopName('');
    await saveToLocalFirst(SHOPS_LIST_KEY, updated);
  };

const canConfirmStrictShopDelete = useMemo(() => {
    if (!deleteTargetShop || !deleteShopChecked) return false;
    const typed = deleteShopTypedConfirm.trim().toLowerCase();
    const targetName = deleteTargetShop.name.trim().toLowerCase();
    return typed === 'delete' || (targetName.length > 0 && typed === targetName);
  }, [deleteTargetShop, deleteShopChecked, deleteShopTypedConfirm]);

  const handleConfirmStrictShopDelete = async () => {
    if (!deleteTargetShop || !canConfirmStrictShopDelete) return;
    const remaining = shops.filter((s) => s.id !== deleteTargetShop.id);
    setShops(remaining);
    await saveToLocalFirst(SHOPS_LIST_KEY, remaining);

    setDeleteTargetShop(null);
    setDeleteShopChecked(false);
    setDeleteShopTypedConfirm('');
  };

  const safeModulesList = Array.isArray(ALL_DASHBOARD_MODULES) ? ALL_DASHBOARD_MODULES : [];
  const safeEnabledIds = Array.isArray(enabledModuleIds)
    ? enabledModuleIds
    : DEFAULT_ENABLED_MODULE_IDS;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {lang === 'bn' ? 'সেটিংস (Settings)' : 'Settings'}
          </Text>
          <Text style={styles.headerSub}>
            {lang === 'bn'
              ? 'ক্লাউড সিঙ্ক, ড্যাশবোর্ড মডিউল, ভাষা ও Shop Debt'
              : 'Cloud Sync, Dashboard Modules, Language & Shop Debt'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Firebase Cloud Sync Card (Default ON, User can turn OFF) */}
        <View style={styles.card}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons
                  name={firebaseSyncOn ? 'cloud-done-outline' : 'cloud-offline-outline'}
                  size={18}
                  color={firebaseSyncOn ? '#2563EB' : '#64748B'}
                />
                <Text style={styles.cardTitle}>Firebase Cloud Sync</Text>
              </View>
              <Text style={[styles.cardDesc, { marginTop: 3 }]}>
                {lang === 'bn'
                  ? 'ডিফল্টভাবে ON থাকে। চাইলে OFF করে ডেটা শুধু লোকাল স্টোরেজে রাখতে পারবেন।'
                  : 'ON by default. Turn OFF if you want to keep data only in local storage.'}
              </Text>
            </View>

            <Switch
              value={firebaseSyncOn}
              onValueChange={handleToggleFirebaseSync}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={firebaseSyncOn ? '#2563EB' : '#F1F5F9'}
            />
          </View>

          {firebaseSyncOn && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.syncActionBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleManualPushSync}
                disabled={syncingNow}
              >
                {syncingNow ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.syncActionText}>
                      {lang === 'bn' ? 'Backup Now' : 'Backup Now'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.syncActionBtn, { backgroundColor: '#059669' }]}
                onPress={handleManualRestoreSync}
                disabled={syncingNow}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#FFFFFF" />
                <Text style={styles.syncActionText}>
                  {lang === 'bn' ? 'Restore' : 'Restore'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Dashboard Modules Add / Remove Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn'
              ? 'ড্যাশবোর্ড মডিউল (Add / Remove)'
              : 'Dashboard Modules (Add / Remove)'}
          </Text>
          <Text style={styles.cardDesc}>
            {lang === 'bn'
              ? 'সাধারণত Budget, Shop Debt, Savings, Income, Reports থাকে। বাকিগুলো এখান থেকে Add বা Remove করতে পারবেন।'
              : 'Budget, Shop Debt, Savings, Income & Reports are default; add or remove extra modules here.'}
          </Text>

          <View style={{ gap: 8, marginTop: 4 }}>
            {safeModulesList.map((mod) => {
              const isAdded = safeEnabledIds.includes(mod.id);
              const label = lang === 'bn' ? mod.titleBn : mod.titleEn;

              return (
                <View key={mod.id} style={styles.moduleToggleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 20 }}>{mod.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleToggleTitle}>{label}</Text>
                      {mod.defaultEnabled && (
                        <Text style={styles.defaultTagText}>
                          {lang === 'bn' ? 'ডিফল্ট মডিউল' : 'Default'}
                        </Text>
                      )}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.modActionBtn,
                      isAdded ? styles.modRemoveBtn : styles.modAddBtn,
                    ]}
                    onPress={() => handleToggleDashboardModule(mod.id)}
                  >
                    <Ionicons
                      name={isAdded ? 'remove-circle-outline' : 'add-circle-outline'}
                      size={16}
                      color={isAdded ? '#DC2626' : '#FFFFFF'}
                    />
                    <Text
                      style={[
                        styles.modActionText,
                        { color: isAdded ? '#DC2626' : '#FFFFFF' },
                      ]}
                    >
                      {isAdded ? 'Remove' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* Language Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn' ? 'ডিসপ্লে ভাষা (Language)' : 'Display Language'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
              onPress={() => handleSelectLanguage('en')}
            >
              <Text style={[styles.langBtnText, lang === 'en' && styles.langBtnTextActive]}>
                English
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.langBtn, lang === 'bn' && styles.langBtnActive]}
              onPress={() => handleSelectLanguage('bn')}
            >
              <Text style={[styles.langBtnText, lang === 'bn' && styles.langBtnTextActive]}>
                বাংলা (Bangla)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shop Debt Store Management */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn'
              ? 'Shop Debt দোকান তালিকা (Add / Strict Delete)'
              : 'Shop Debt Stores (Add / Strict Delete)'}
          </Text>
          <Text style={styles.cardDesc}>
            {lang === 'bn'
              ? 'এখানে যোগ করা প্রতিটি দোকানের নাম অনুযায়ী Budget তালিকায় স্বয়ংক্রিয়ভাবে খাত যুক্ত হবে।'
              : 'Every shop added here automatically appears as a category row in the Budget sheet.'}
          </Text>

          <View style={styles.addShopRow}>
            <TextInput
              style={styles.input}
              placeholder={
                lang === 'bn'
                  ? 'নতুন দোকানের নাম লিখুন'
                  : 'New shop name'
              }
              value={newShopName}
              onChangeText={setNewShopName}
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddShop}>
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>{lang === 'bn' ? 'যোগ' : 'Add'}</Text>
            </TouchableOpacity>
          </View>

          {shops.length === 0 ? (
            <Text style={styles.emptyShopHint}>
              {lang === 'bn'
                ? 'কোনো দোকান যোগ করা নেই। উপরের বক্সে নাম লিখে যোগ করুন।'
                : 'No shops added yet. Enter a shop name above to add.'}
            </Text>
          ) : (
            shops.map((shop) => (
              <View key={shop.id} style={styles.shopItemRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="storefront-outline" size={18} color="#1E3A8A" />
                  <Text style={styles.shopItemName}>{shop.name}</Text>
                </View>

                <TouchableOpacity
                  style={styles.strictDeleteTriggerBtn}
                  onPress={() => {
                    setDeleteTargetShop(shop);
                    setDeleteShopChecked(false);
                    setDeleteShopTypedConfirm('');
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.strictDeleteTriggerText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Strict Delete Shop Confirmation Modal */}
      <Modal visible={Boolean(deleteTargetShop)} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: '#B91C1C' }]}>
                {lang === 'bn'
                  ? 'দোকান ডিলিট নিশ্চিতকরণ (Strict Delete)'
                  : 'Strict Delete Shop Confirmation'}
              </Text>

              {deleteTargetShop && (
                <View style={styles.strictBox}>
                  <Text style={{ fontWeight: '700', color: '#991B1B', fontSize: 13.5 }}>
                    Shop: {deleteTargetShop.name}
                  </Text>
                  <Text style={{ color: '#7F1D1D', fontSize: 12 }}>
                    {lang === 'bn'
                      ? 'এই দোকানটি ডিলিট করলে Budget তালিকা থেকেও এর খাত সরে যাবে।'
                      : 'Deleting this shop will also remove its linked category from the Budget sheet.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.strictCheckRow}
                onPress={() => setDeleteShopChecked((v) => !v)}
              >
                <Ionicons
                  name={deleteShopChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#DC2626"
                />
                <Text style={styles.strictCheckText}>
                  {lang === 'bn'
                    ? `আমি সব ঝুঁকি জেনে "${deleteTargetShop?.name}" দোকানটি স্থায়ীভাবে মুছে ফেলতে চাই।`
                    : `I understand the consequences and want to permanently delete "${deleteTargetShop?.name}".`}
                </Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>
                {lang === 'bn'
                  ? `নিশ্চিত করতে "${deleteTargetShop?.name}" অথবা "DELETE" লিখুন:`
                  : `Type "${deleteTargetShop?.name}" or "DELETE" to confirm:`}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder='Type "DELETE" or shop name'
                value={deleteShopTypedConfirm}
                onChangeText={setDeleteShopTypedConfirm}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => {
                    setDeleteTargetShop(null);
                    setDeleteShopChecked(false);
                    setDeleteShopTypedConfirm('');
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>
                    {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!canConfirmStrictShopDelete}
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: canConfirmStrictShopDelete ? '#DC2626' : '#FCA5A5',
                    },
                  ]}
                  onPress={handleConfirmStrictShopDelete}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                    {lang === 'bn' ? 'দোকান ডিলিট করুন' : 'Permanent Delete'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 28 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
  },
  scrollContent: {
    padding: 12,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  syncActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  syncActionText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  moduleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  moduleToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  defaultTagText: {
    fontSize: 10,
    color: '#2563EB',
    fontWeight: '600',
  },
  modActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  modAddBtn: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  modRemoveBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  modActionText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  langBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  langBtnTextActive: {
    color: '#FFFFFF',
  },
  addShopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyShopHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 8,
  },
  shopItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shopItemName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  strictDeleteTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  strictDeleteTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  strictBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 3,
  },
  strictCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  strictCheckText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 5,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});