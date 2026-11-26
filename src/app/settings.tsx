import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { saveLocalData } from '../utils/firebaseSync';
import { saveToLocalFirst } from '../utils/localStorageManager';
import {
  createBusinessSheetRows,
  createCustomSheetRows,
  createSalarySheetRows,
  EMPTY_YEAR_STORE,
  FiscalYearStore,
  formatFiscalYearLabel,
  getIncomeStorageKey,
  IncomeProfileKind,
  IncomeSheetProfile,
  parseYearStore,
} from './income';

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

  // Income Sheets Management স্টেট
  const getInitialFiscalStartYear = () => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const [incomeFiscalYear, setIncomeFiscalYear] = useState<number>(
    getInitialFiscalStartYear
  );
  const [incomeStore, setIncomeStore] =
    useState<FiscalYearStore>(EMPTY_YEAR_STORE);
  const [addIncomeModalVisible, setAddIncomeModalVisible] =
    useState<boolean>(false);
  const [newIncomeKind, setNewIncomeKind] =
    useState<IncomeProfileKind>('salary');
  const [newIncomeTitle, setNewIncomeTitle] = useState<string>('');
  const [newIncomeCustomField, setNewIncomeCustomField] = useState<string>('');

  // Strict Delete Shop Confirmation Modal স্টেট
  const [deleteTargetShop, setDeleteTargetShop] = useState<ShopProfile | null>(
    null
  );
  const [deleteShopChecked, setDeleteShopChecked] = useState<boolean>(false);
  const [deleteShopTypedConfirm, setDeleteShopTypedConfirm] =
    useState<string>('');

  const incomeFiscalLabel = formatFiscalYearLabel(incomeFiscalYear);

  const loadIncomeSheets = useCallback(async (startYr: number) => {
    try {
      const savedIncome = await AsyncStorage.getItem(getIncomeStorageKey(startYr));
      setIncomeStore(parseYearStore(savedIncome));
    } catch (e) {
      console.log('Failed to load income sheets:', e);
    }
  }, []);

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
          const cleanIds = parsedMods.filter(
            (id): id is string => typeof id === 'string'
          );
          setEnabledModuleIds(cleanIds);
        }
      }

      if (savedShops) {
        const parsed = JSON.parse(savedShops);
        if (Array.isArray(parsed)) {
          setShops(parsed);
        } else {
          setShops([]);
        }
      } else {
        setShops([]);
      }

      await loadIncomeSheets(incomeFiscalYear);
    } catch (e) {
      console.log('Failed to load settings:', e);
    }
  }, [incomeFiscalYear, loadIncomeSheets]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useFocusEffect(
    useCallback(() => {
      void loadIncomeSheets(incomeFiscalYear);
    }, [incomeFiscalYear, loadIncomeSheets])
  );

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

  const handleSelectIncomeSheet = async (sheetId: string) => {
    const nextStore: FiscalYearStore = {
      ...incomeStore,
      initialized: true,
      activeSheetId: sheetId,
    };
    setIncomeStore(nextStore);
    await saveLocalData(getIncomeStorageKey(incomeFiscalYear), nextStore);
  };

  const handleOpenIncomeSheet = async (sheet: IncomeSheetProfile) => {
    await handleSelectIncomeSheet(sheet.id);
    router.push({
      pathname: '/income',
      params: {
        sheetId: sheet.id,
        fiscalStartYear: String(incomeFiscalYear),
      },
    } as never);
  };

  const handleCreateIncomeSheet = async () => {
    const defaultTitle =
      newIncomeKind === 'salary'
        ? 'Salary & Allowances'
        : newIncomeKind === 'daily'
          ? 'Daily Income'
          : newIncomeKind === 'business'
            ? 'Business / Freelance'
            : 'Custom Income';

    const generatedRows =
      newIncomeKind === 'salary'
        ? createSalarySheetRows(0, true, 'July')
        : newIncomeKind === 'daily'
          ? []
          : newIncomeKind === 'business'
            ? createBusinessSheetRows(0)
            : createCustomSheetRows(newIncomeCustomField, 0);

    const newSheet: IncomeSheetProfile = {
      id: `sheet-${newIncomeKind}-${Date.now()}`,
      title: newIncomeTitle.trim() || defaultTitle,
      kind: newIncomeKind,
      rows: generatedRows,
      dailyEntries: newIncomeKind === 'daily' ? [] : undefined,
    };

    const nextStore: FiscalYearStore = {
      initialized: true,
      activeSheetId: newSheet.id,
      sheets: [...incomeStore.sheets, newSheet],
    };

    setIncomeStore(nextStore);
    await saveLocalData(getIncomeStorageKey(incomeFiscalYear), nextStore);
    setNewIncomeTitle('');
    setNewIncomeCustomField('');
    setAddIncomeModalVisible(false);
  };

  const handleDeleteIncomeSheet = (sheet: IncomeSheetProfile) => {
    const removeSheet = async () => {
      const remaining = incomeStore.sheets.filter((s) => s.id !== sheet.id);
      const nextStore: FiscalYearStore = {
        initialized: remaining.length > 0,
        activeSheetId: remaining.length > 0 ? remaining[0].id : null,
        sheets: remaining,
      };
      setIncomeStore(nextStore);
      await saveLocalData(getIncomeStorageKey(incomeFiscalYear), nextStore);
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(`"${sheet.title}" শিটটি মুছে ফেলতে চান?`)
          : true;
      if (confirmed) {
        void removeSheet();
      }
      return;
    }

    Alert.alert(
      lang === 'bn' ? 'শিট ডিলিট করুন' : 'Delete Income Sheet',
      lang === 'bn'
        ? `"${sheet.title}" (${incomeFiscalLabel}) শিটটি স্থায়ীভাবে মুছে ফেলতে চান?`
        : `Permanently delete "${sheet.title}" (${incomeFiscalLabel})?`,
      [
        {
          text: lang === 'bn' ? 'বাতিল' : 'Cancel',
          style: 'cancel',
        },
        {
          text: lang === 'bn' ? 'ডিলিট' : 'Delete',
          style: 'destructive',
          onPress: () => void removeSheet(),
        },
      ]
    );
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

    const exists = shops.some(
      (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
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

  const safeModulesList = Array.isArray(ALL_DASHBOARD_MODULES)
    ? ALL_DASHBOARD_MODULES
    : [];
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
              ? 'স্বয়ংক্রিয় সিঙ্ক, মডিউল, ভাষা ও ব্যবস্থাপনা'
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
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name="cloud-done-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Firebase Cloud Sync</Text>
              </View>
              <Text style={[styles.cardDesc, { marginTop: 3 }]}>
                {lang === 'bn'
                  ? 'আপনার অ্যাকাউন্টের ডেটা স্বয়ংক্রিয়ভাবে সিঙ্ক হয়। অফলাইনে করা পরিবর্তন সংযোগ ফিরলে সিঙ্ক হবে।'
                  : 'Account data syncs automatically. Offline changes sync when your connection returns.'}
              </Text>
            </View>
            <View style={styles.syncStatusPill}>
              <View style={styles.syncStatusDot} />
              <Text style={styles.syncStatusText}>
                {lang === 'bn' ? 'স্বয়ংক্রিয়' : 'Automatic'}
              </Text>
            </View>
          </View>
        </View>

        {/* Income Sheets Management Card (Main Setting) */}
        <View style={styles.card}>
          <View style={styles.incomeHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {lang === 'bn'
                  ? `Income Sheets (${incomeFiscalLabel})`
                  : `Income Sheets (${incomeFiscalLabel})`}
              </Text>
              <Text style={styles.cardDesc}>
                {lang === 'bn'
                  ? 'শিট নির্বাচন করুন, নতুন Income যোগ করুন অথবা মুছুন।'
                  : 'Select an active sheet, add new Income sheets, or delete existing ones.'}
              </Text>
            </View>

            <View style={styles.yearMiniStepper}>
              <TouchableOpacity
                onPress={() => setIncomeFiscalYear((y) => y - 1)}
              >
                <Ionicons name="chevron-back" size={16} color="#1E40AF" />
              </TouchableOpacity>
              <Text style={styles.yearMiniText}>{incomeFiscalLabel}</Text>
              <TouchableOpacity
                onPress={() => setIncomeFiscalYear((y) => y + 1)}
              >
                <Ionicons name="chevron-forward" size={16} color="#1E40AF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.incomeTopActions}>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => {
                setNewIncomeKind('salary');
                setNewIncomeTitle('');
                setNewIncomeCustomField('');
                setAddIncomeModalVisible(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
              <Text style={styles.addBtnText}>
                {lang === 'bn' ? 'Add Income' : 'Add Income'}
              </Text>
            </TouchableOpacity>

            {incomeStore.sheets.length > 0 && (
              <TouchableOpacity
                style={styles.goSheetBtn}
                onPress={() => {
                  const target =
                    incomeStore.sheets.find(
                      (s) => s.id === incomeStore.activeSheetId
                    ) || incomeStore.sheets[0];
                  void handleOpenIncomeSheet(target);
                }}
              >
                <Ionicons name="open-outline" size={16} color="#1E3A8A" />
                <Text style={styles.goSheetBtnText}>
                  {lang === 'bn' ? 'Income পেজ খুলুন' : 'Open Income'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {incomeStore.sheets.length === 0 ? (
            <Text style={styles.emptyShopHint}>
              {lang === 'bn'
                ? 'এই অর্থবছরে কোনো Income শিট নেই। "Add Income" চাপুন।'
                : 'No income sheets in this fiscal year. Tap "Add Income".'}
            </Text>
          ) : (
            <View style={{ gap: 7, marginTop: 4 }}>
              {incomeStore.sheets.map((sheet) => {
                const isSelected = incomeStore.activeSheetId === sheet.id;
                return (
                  <View
                    key={sheet.id}
                    style={[
                      styles.incomeSheetItem,
                      isSelected && styles.incomeSheetItemActive,
                    ]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => void handleSelectIncomeSheet(sheet.id)}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name={
                            isSelected
                              ? 'radio-button-on'
                              : 'radio-button-off'
                          }
                          size={16}
                          color={isSelected ? '#2563EB' : '#64748B'}
                        />
                        <Text style={styles.shopItemName}>{sheet.title}</Text>
                      </View>
                      <Text style={styles.sheetSubMeta}>
                        {sheet.kind.toUpperCase()} •{' '}
                        {sheet.kind === 'daily'
                          ? `${(sheet.dailyEntries || []).length} entries`
                          : `${sheet.rows.length} rows`}
                        {isSelected ? ' • Active' : ''}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.openSheetPill}
                      onPress={() => void handleOpenIncomeSheet(sheet)}
                    >
                      <Text style={styles.openSheetPillText}>
                        {lang === 'bn' ? 'খুলুন' : 'Open'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.strictDeleteTriggerBtn}
                      onPress={() => handleDeleteIncomeSheet(sheet)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color="#DC2626"
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
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
                      name={
                        isAdded ? 'remove-circle-outline' : 'add-circle-outline'
                      }
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
              <Text
                style={[
                  styles.langBtnText,
                  lang === 'en' && styles.langBtnTextActive,
                ]}
              >
                English
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.langBtn, lang === 'bn' && styles.langBtnActive]}
              onPress={() => handleSelectLanguage('bn')}
            >
              <Text
                style={[
                  styles.langBtnText,
                  lang === 'bn' && styles.langBtnTextActive,
                ]}
              >
                বাংলা
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {lang === 'bn' ? 'যানবাহন ব্যবস্থাপনা' : 'Vehicle Management'}
          </Text>
          <Text style={styles.cardDesc}>
            {lang === 'bn'
              ? 'Vehicle পেজে নতুন যানবাহন যোগ করুন। এখানে সেগুলো manage বা delete করুন।'
              : 'Add vehicles from the Vehicle page. Open management here to delete them.'}
          </Text>
          <TouchableOpacity
            style={styles.settingActionRow}
            onPress={() => router.push('/vehicle-expense?manage=1' as never)}
          >
            <Ionicons name="car-outline" size={19} color="#C2410C" />
            <Text style={styles.settingActionText}>
              {lang === 'bn'
                ? 'Vehicle পরিচালনা / মুছুন'
                : 'Manage / Delete Vehicles'}
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
                lang === 'bn' ? 'নতুন দোকানের নাম লিখুন' : 'New shop name'
              }
              value={newShopName}
              onChangeText={setNewShopName}
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddShop}>
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>
                {lang === 'bn' ? 'যোগ' : 'Add'}
              </Text>
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
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <Ionicons
                    name="storefront-outline"
                    size={18}
                    color="#1E3A8A"
                  />
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

      {/* Add Income Sheet Modal */}
      <Modal
        visible={addIncomeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddIncomeModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {lang === 'bn'
                ? `নতুন Income শিট যোগ করুন (${incomeFiscalLabel})`
                : `Add Income Sheet (${incomeFiscalLabel})`}
            </Text>

            <Text style={styles.inputLabel}>
              {lang === 'bn' ? 'আয়ের ধরন' : 'Income Type'}
            </Text>
            <View style={styles.kindChipsWrap}>
              {(
                [
                  ['salary', 'Salary'],
                  ['daily', 'Daily'],
                  ['business', 'Business'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([kindKey, label]) => (
                <TouchableOpacity
                  key={kindKey}
                  style={[
                    styles.kindChip,
                    newIncomeKind === kindKey && styles.kindChipActive,
                  ]}
                  onPress={() => setNewIncomeKind(kindKey)}
                >
                  <Text
                    style={[
                      styles.kindChipText,
                      newIncomeKind === kindKey && styles.kindChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>
              {lang === 'bn' ? 'শিটের নাম (ঐচ্ছিক)' : 'Sheet Name (Optional)'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                newIncomeKind === 'salary'
                  ? 'e.g. Salary & Allowances'
                  : newIncomeKind === 'daily'
                    ? 'e.g. Daily Income'
                    : newIncomeKind === 'business'
                      ? 'e.g. Business / Freelance'
                      : 'e.g. Tuition / Rent'
              }
              value={newIncomeTitle}
              onChangeText={setNewIncomeTitle}
            />

            {newIncomeKind === 'custom' && (
              <>
                <Text style={styles.inputLabel}>
                  {lang === 'bn' ? 'মূল আয়ের খাতের নাম' : 'Primary Income Item'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Monthly Rent"
                  value={newIncomeCustomField}
                  onChangeText={setNewIncomeCustomField}
                />
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddIncomeModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#16A34A' }]}
                onPress={() => void handleCreateIncomeSheet()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {lang === 'bn' ? 'তৈরি করুন' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Strict Delete Shop Confirmation Modal */}
      <Modal
        visible={Boolean(deleteTargetShop)}
        transparent
        animationType="fade"
      >
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
                  <Text
                    style={{
                      fontWeight: '700',
                      color: '#991B1B',
                      fontSize: 13.5,
                    }}
                  >
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
                      backgroundColor: canConfirmStrictShopDelete
                        ? '#DC2626'
                        : '#FCA5A5',
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
  incomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  yearMiniStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  yearMiniText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E40AF',
  },
  incomeTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  goSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
  },
  goSheetBtnText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '700',
  },
  incomeSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  incomeSheetItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  sheetSubMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginLeft: 22,
  },
  openSheetPill: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  openSheetPillText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  kindChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  kindChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  kindChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  kindChipTextActive: {
    color: '#FFFFFF',
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