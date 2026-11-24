import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
import { saveToLocalFirst } from '../utils/localStorageManager';

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
      const [savedLang, savedModules, savedShops] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem(DASHBOARD_ENABLED_MODULES_KEY),
        AsyncStorage.getItem(SHOPS_LIST_KEY),
      ]);

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
              ? 'স্বয়ংক্রিয় সিঙ্ক, মডিউল, ভাষা ও ব্যবস্থাপনা'
              : 'Automatic sync, modules, language & management'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Automatic Firebase Cloud Sync */}
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
                <Ionicons name="cloud-done-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Firebase Cloud Sync</Text>
              </View>
              <Text style={[styles.cardDesc, { marginTop: 3 }]}>
                {lang === 'bn'
                  ? 'আপনার অ্যাকাউন্টের ডেটা স্বয়ংক্রিয়ভাবে সিঙ্ক হয়। অফলাইনে করা পরিবর্তন সংযোগ ফিরলে সিঙ্ক হবে।'
                  : 'Account data syncs automatically. Offline changes sync when your connection returns.'}
              </Text>
            </View>
            <View style={styles.syncStatusPill}>
              <View style={styles.syncStatusDot} />
              <Text style={styles.syncStatusText}>
                {lang === 'bn' ? 'স্বয়ংক্রিয়' : 'Automatic'}
              </Text>
            </View>
          </View>
        </View>

        {/* Dashboard Modules Add / Remove Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn'
              ? 'ড্যাশবোর্ড মডিউল (Add / Remove)'
              : 'Dashboard Modules (Add / Remove)'}
          </Text>
          <View style={styles.moduleToggleGrid}>
            {safeModulesList.map((mod) => {
              const isAdded = safeEnabledIds.includes(mod.id);
              const label = lang === 'bn' ? mod.titleBn : mod.titleEn;

              return (
                <View key={mod.id} style={styles.moduleToggleRow}>
                  <View style={styles.moduleToggleInfo}>
                    <Text style={styles.moduleIcon}>{mod.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleToggleTitle} numberOfLines={1}>
                        {label}
                      </Text>
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
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isAdded }}
                    accessibilityLabel={`${isAdded ? 'Remove' : 'Add'} ${label}`}
                  >
                    <Ionicons
                      name={isAdded ? 'remove-circle-outline' : 'add-circle-outline'}
                      size={15}
                      color={isAdded ? '#DC2626' : '#FFFFFF'}
                    />
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
          <View style={styles.languageToggle}>
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
                বাংলা
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn' ? 'আয় ও যানবাহন ব্যবস্থাপনা' : 'Income & Vehicle Management'}
          </Text>
          <Text style={styles.cardDesc}>
            {lang === 'bn'
              ? 'Income ও Vehicle পেজে নতুন sheet যোগ করুন। এখানে সেগুলো manage বা delete করুন।'
              : 'Add sheets from the Income and Vehicle pages. Open management here to delete them.'}
          </Text>
          <TouchableOpacity
            style={styles.settingActionRow}
            onPress={() => router.push('/income?manageSheets=1' as never)}
          >
            <Ionicons name="cash-outline" size={19} color="#15803D" />
            <Text style={styles.settingActionText}>
              {lang === 'bn' ? 'Income Sheet মুছুন' : 'Delete Income Sheets'}
            </Text>
            <Ionicons name="chevron-forward" size={17} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingActionRow}
            onPress={() => router.push('/vehicle-expense?manage=1' as never)}
          >
            <Ionicons name="car-outline" size={19} color="#C2410C" />
            <Text style={styles.settingActionText}>
              {lang === 'bn' ? 'Vehicle পরিচালনা / মুছুন' : 'Manage / Delete Vehicles'}
            </Text>
            <Ionicons name="chevron-forward" size={17} color="#64748B" />
          </TouchableOpacity>
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
  settingActionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingActionText: {
    flex: 1,
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
  },
  moduleToggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 5,
    marginTop: 2,
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
  },
  syncStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  syncStatusText: {
    color: '#15803D',
    fontSize: 10.5,
    fontWeight: '700',
  },
  moduleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '48%',
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  moduleToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  moduleIcon: {
    fontSize: 13,
  },
  moduleToggleTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  defaultTagText: {
    fontSize: 9,
    color: '#2563EB',
    fontWeight: '600',
  },
  modActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 25,
    height: 25,
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
  languageToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    minWidth: 168,
    padding: 3,
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  langBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  langBtnActive: {
    backgroundColor: '#2563EB',
  },
  langBtnText: {
    fontSize: 12,
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