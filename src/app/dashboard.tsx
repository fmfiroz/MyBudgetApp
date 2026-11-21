import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../firebase';

type AppLanguage = 'en' | 'bn';

export interface DashboardModuleItem {
  id: string;
  titleEn: string;
  titleBn: string;
  icon: string;
  route: string;
  color: string;
  defaultEnabled: boolean;
}

const LANGUAGE_STORAGE_KEY = '@mybudget_app_language_v1';
export const DASHBOARD_ENABLED_MODULES_KEY = '@mybudget_dashboard_modules_v1';

export const ALL_DASHBOARD_MODULES: DashboardModuleItem[] = [
  {
    id: 'budget',
    titleEn: 'Budget',
    titleBn: 'বাজেট',
    icon: '📊',
    route: '/budget',
    color: '#2563eb',
    defaultEnabled: true,
  },
  {
    id: 'shop-debt',
    titleEn: 'Shop Debt',
    titleBn: 'দোকানের ধার',
    icon: '📒',
    route: '/shop-debt',
    color: '#0891b2',
    defaultEnabled: true,
  },
  {
    id: 'savings',
    titleEn: 'Savings',
    titleBn: 'সঞ্চয় ও পলিসি',
    icon: '🏦',
    route: '/savings',
    color: '#059669',
    defaultEnabled: true,
  },
  {
    id: 'income',
    titleEn: 'Income',
    titleBn: 'আয় ও বেতন',
    icon: '💰',
    route: '/income',
    color: '#16a34a',
    defaultEnabled: true,
  },
  {
    id: 'reports',
    titleEn: 'Reports',
    titleBn: 'রিপোর্টস',
    icon: '📈',
    route: '/reports',
    color: '#4f46e5',
    defaultEnabled: true,
  },
  {
    id: 'social-religious',
    titleEn: 'Social & Religious Activity',
    titleBn: 'সামাজিক ও ধর্মীয় কার্যক্রম',
    icon: '🤝',
    route: '/social-religious',
    color: '#7c3aed',
    defaultEnabled: false,
  },
  {
    id: 'welfare',
    titleEn: 'Welfare',
    titleBn: 'কল্যাণ তহবিল',
    icon: '❤️',
    route: '/welfare',
    color: '#db2777',
    defaultEnabled: false,
  },
  {
    id: 'bike-expense',
    titleEn: 'Bike Expense',
    titleBn: 'বাইক খরচ',
    icon: '🏍️',
    route: '/bike-expense',
    color: '#ea580c',
    defaultEnabled: false,
  },
  {
    id: 'settings',
    titleEn: 'Settings',
    titleBn: 'সেটিংস',
    icon: '⚙️',
    route: '/settings',
    color: '#64748b',
    defaultEnabled: false,
  },
];

export const DEFAULT_ENABLED_MODULE_IDS: string[] = ALL_DASHBOARD_MODULES.filter(
  (m) => m.defaultEnabled
).map((m) => m.id);

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<AppLanguage>('bn');
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>(
    DEFAULT_ENABLED_MODULE_IDS
  );
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  const loadDashboardPrefs = useCallback(async () => {
    try {
      const [savedLang, savedModules] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem(DASHBOARD_ENABLED_MODULES_KEY),
      ]);

      if (savedLang === 'en' || savedLang === 'bn') {
        setLang(savedLang);
      }

      if (savedModules) {
        const parsed = JSON.parse(savedModules) as string[];
        if (Array.isArray(parsed)) {
          setEnabledModuleIds(parsed);
          return;
        }
      }
      setEnabledModuleIds(DEFAULT_ENABLED_MODULE_IDS);
    } catch {
      setEnabledModuleIds(DEFAULT_ENABLED_MODULE_IDS);
    }
  }, []);

  useEffect(() => {
    loadDashboardPrefs();
  }, [loadDashboardPrefs]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardPrefs();
    }, [loadDashboardPrefs])
  );

  const visibleMenuItems = useMemo(() => {
    const idSet = new Set(enabledModuleIds);
    return ALL_DASHBOARD_MODULES.filter((item) => idSet.has(item.id));
  }, [enabledModuleIds]);

  const performLogout = async () => {
    try {
      setLoggingOut(true);
      setDrawerVisible(false);
      await signOut(auth);
      router.replace('/login');
    } catch (error: any) {
      const message = error?.message || 'Unable to logout.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Logout Failed', message);
      }
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (loggingOut) return;

    const confirmMsg =
      lang === 'bn'
        ? 'আপনি কি অ্যাকাউন্ট থেকে Logout করতে চান?'
        : 'Are you sure you want to logout from your account?';

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        performLogout();
      }
    } else {
      Alert.alert('Logout', confirmMsg, [
        { text: lang === 'bn' ? 'বাতিল' : 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]);
    }
  };

  const userEmail = auth.currentUser?.email || 'fmfiroznp@gmail.com';

  return (
    <SafeAreaView style={styles.container}>
      {/* Modern Top App Bar with Drawer Trigger */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.menuTriggerBtn}
          onPress={() => setDrawerVisible(true)}
          accessibilityLabel="Open Navigation Drawer"
          activeOpacity={0.75}
        >
          <Ionicons name="menu" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.brandTitleWrap}>
          <Text style={styles.brandTitle}>
            {lang === 'bn' ? 'আমার বাজেট অ্যাপ' : 'MyBudgetApp'}
          </Text>
          <Text style={styles.brandSubtitle}>Personal Finance Dashboard</Text>
        </View>

        <TouchableOpacity
          style={styles.quickSettingsBtn}
          onPress={() => router.push('/settings' as never)}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color="#334155" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Hero Banner Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles" size={13} color="#1D4ED8" />
            <Text style={styles.heroBadgeText}>
              {lang === 'bn' ? 'স্মার্ট ফিন্যান্স ওয়ার্কস্পেস' : 'Smart Finance Workspace'}
            </Text>
          </View>
          <Text style={styles.heroHeading}>
            {lang === 'bn'
              ? 'আয়, বাজেট, সঞ্চয় ও ধারের হিসাব এক জায়গায়'
              : 'Track Income, Budget, Savings & Debts'}
          </Text>
          <Text style={styles.heroDesc}>
            {lang === 'bn'
              ? 'অতিরিক্ত মডিউল যোগ বা সরাতে Settings ব্যবহার করুন।'
              : 'Use Settings to add or remove extra dashboard modules.'}
          </Text>
        </View>

        {/* Modules Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {lang === 'bn' ? 'হিসাবের মডিউলসমূহ' : 'Finance Modules'}
            </Text>
            <Text style={styles.sectionCount}>
              {visibleMenuItems.length} {lang === 'bn' ? 'টি মডিউল' : 'modules'}
            </Text>
          </View>

          <View style={styles.menuGrid}>
            {visibleMenuItems.map((item) => {
              const titleText = lang === 'bn' ? item.titleBn : item.titleEn;
              return (
                <TouchableOpacity
                  key={item.route}
                  style={styles.menuCard}
                  activeOpacity={0.78}
                  onPress={() => router.push(item.route as never)}
                >
                  <View style={[styles.cardTopAccent, { backgroundColor: item.color }]} />

                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: `${item.color}16` },
                    ]}
                  >
                    <Text style={styles.menuIcon}>{item.icon}</Text>
                  </View>

                  <Text style={styles.menuTitle} numberOfLines={2}>
                    {titleText}
                  </Text>

                  <View style={styles.cardFooterHint}>
                    <Text style={[styles.openText, { color: item.color }]}>
                      {lang === 'bn' ? 'খুলুন' : 'Open'}
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={item.color} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Slide-From-Left Drawer Modal */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerBackdrop}>
          <View style={styles.drawerPanel}>
            <ScrollView
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.drawerTopHeader}>
                <Text style={styles.drawerBrandLabel}>MyBudgetApp</Text>
                <TouchableOpacity
                  style={styles.drawerCloseBtn}
                  onPress={() => setDrawerVisible(false)}
                  accessibilityLabel="Close Drawer"
                >
                  <Ionicons name="close" size={22} color="#334155" />
                </TouchableOpacity>
              </View>

              <View style={styles.userProfileCard}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={26} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userNameText}>Firoz Mahmud</Text>
                  <Text style={styles.userEmailText} numberOfLines={1}>
                    {userEmail}
                  </Text>
                </View>
              </View>

              <View style={styles.infoSectionBox}>
                <Text style={styles.infoSectionTitle}>
                  {lang === 'bn' ? 'অ্যাপ তথ্য' : 'App Information'}
                </Text>

                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>
                    {lang === 'bn' ? 'অ্যাপ ভার্সন' : 'App Version'}
                  </Text>
                  <Text style={styles.infoBadgeVal}>v1.0.0</Text>
                </View>

                <View style={styles.aboutBlock}>
                  <Text style={styles.infoKey}>
                    {lang === 'bn' ? 'পরিচিতি (About)' : 'About'}
                  </Text>
                  <Text style={styles.aboutParagraph}>
                    {lang === 'bn'
                      ? 'MyBudgetApp হলো ব্যক্তিগত আয়, মাসিক বাজেট, সঞ্চয়/পলিসি ও দোকানের ধারের হিসাব সহজে গুছিয়ে রাখার একটি স্মার্ট ফিন্যান্স অ্যাপ।'
                      : 'MyBudgetApp is a personal finance companion designed to track monthly income, budgets, savings plans, and shop debts cleanly.'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoSectionBox}>
                <Text style={styles.infoSectionTitle}>
                  {lang === 'bn' ? 'ডেভেলপার তথ্য' : 'Developer Info'}
                </Text>
                <View style={styles.devRow}>
                  <Ionicons name="code-slash-outline" size={18} color="#2563EB" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devName}>Firoz Mahmud</Text>
                    <Text style={styles.devSub}>
                      {lang === 'bn'
                        ? 'MyBudgetApp Creator & Developer'
                        : 'Creator & Developer • MyBudgetApp'}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.drawerLogoutBtn}
                onPress={handleLogout}
                disabled={loggingOut}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={20} color="#DC2626" />
                <Text style={styles.drawerLogoutText}>
                  {loggingOut
                    ? lang === 'bn'
                      ? 'লগআউট হচ্ছে...'
                      : 'Logging out...'
                    : 'Logout'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <TouchableOpacity
            style={styles.drawerScrimRest}
            activeOpacity={1}
            onPress={() => setDrawerVisible(false)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  menuTriggerBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitleWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  brandSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  quickSettingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 18,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  heroHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  heroDesc: {
    fontSize: 12.5,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  sectionContainer: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuCard: {
    width: '48%',
    minHeight: 142,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 2,
  },
  cardTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  menuIcon: {
    fontSize: 24,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 8,
    lineHeight: 19,
  },
  cardFooterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  openText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    height: '100%',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 10,
  },
  drawerScrimRest: {
    flex: 1,
  },
  drawerScrollContent: {
    padding: 18,
    paddingBottom: 28,
    gap: 16,
  },
  drawerTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  drawerBrandLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  drawerCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  userProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmailText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  infoSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  infoSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoKey: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  infoBadgeVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aboutBlock: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  aboutParagraph: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  devName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  devSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  drawerLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  drawerLogoutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 14,
  },
});