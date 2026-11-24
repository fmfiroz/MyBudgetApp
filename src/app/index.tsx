import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ALL_DASHBOARD_MODULES,
  DASHBOARD_ENABLED_MODULES_KEY,
  DEFAULT_ENABLED_MODULE_IDS,
} from '../constants/dashboardModules';
import { auth } from '../firebase';

type AppLanguage = 'en' | 'bn';

const LANGUAGE_STORAGE_KEY = '@mybudget_app_language_v1';

export default function HomeScreen() {
  const router = useRouter();
  const screenWidth = Dimensions.get('window').width;
  const drawerWidth = Math.min(320, Math.round(screenWidth * 0.82));

  const [lang, setLang] = useState<AppLanguage>('bn');
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>(
    DEFAULT_ENABLED_MODULE_IDS
  );
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

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
        const parsed = JSON.parse(savedModules);
        if (Array.isArray(parsed)) {
          setEnabledModuleIds(parsed.filter((id): id is string => typeof id === 'string'));
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

  const openDrawer = () => {
    slideAnim.setValue(-drawerWidth);
    backdropAnim.setValue(0);
    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = (onAfterClose?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -drawerWidth,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setDrawerVisible(false);
      if (finished && onAfterClose) {
        onAfterClose();
      }
    });
  };

  const navigateFromDrawer = (route: string) => {
    closeDrawer(() => {
      router.push(route as never);
    });
  };

  const visibleMenuItems = useMemo(() => {
    const safeList = Array.isArray(ALL_DASHBOARD_MODULES) ? ALL_DASHBOARD_MODULES : [];
    const idSet = new Set(
      Array.isArray(enabledModuleIds) ? enabledModuleIds : DEFAULT_ENABLED_MODULE_IDS
    );
    return safeList.filter((item) => idSet.has(item.id));
  }, [enabledModuleIds]);

  const performLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
      setDrawerVisible(false);
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

    const runLogoutAfterClose = () => {
      closeDrawer(() => {
        performLogout();
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        runLogoutAfterClose();
      }
    } else {
      Alert.alert('Logout', confirmMsg, [
        { text: lang === 'bn' ? 'বাতিল' : 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: runLogoutAfterClose,
        },
      ]);
    }
  };

  const userEmail = auth.currentUser?.email || 'fmfiroznp@gmail.com';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.menuTriggerBtn}
          onPress={openDrawer}
          accessibilityLabel="Open Navigation Drawer"
          activeOpacity={0.75}
        >
          <Ionicons name="menu" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.brandTitleWrap}>
          <Text style={styles.brandTitle}>
            {lang === 'bn' ? 'আমার বাজেট' : 'My Budget'}
          </Text>
          <Text style={styles.brandSubtitle}>Personal Finance Dashboard</Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles" size={13} color="#1D4ED8" />
            <Text style={styles.heroBadgeText}>
              {lang === 'bn' ? 'স্মার্ট ফিন্যান্স ওয়ার্কস্পেস' : 'Smart Finance Workspace'}
            </Text>
          </View>
          <Text style={styles.heroHeading}>
            {lang === 'bn'
              ? 'আয়, বাজেট, সঞ্চয় ও ধারের হিসাব এক জায়গায়'
              : 'Track Income, Budget, Savings & Debts'}
          </Text>
          <Text style={styles.heroDesc}>
            {lang === 'bn'
              ? 'বামের মেনু থেকে Settings খুলে অতিরিক্ত মডিউল যোগ বা সরাতে পারবেন।'
              : 'Open Settings from the left drawer menu to add or remove extra modules.'}
          </Text>
        </View>

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

      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeDrawer()}
      >
        <View style={styles.drawerBackdrop}>
          <Animated.View style={[styles.drawerScrimLayer, { opacity: backdropAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.drawerTopHeader}>
                <Text style={styles.drawerBrandLabel}>My Budget</Text>
                <TouchableOpacity
                  style={styles.drawerCloseBtn}
                  onPress={() => closeDrawer()}
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

              {/* Drawer Navigation Shortcuts + Settings */}
              <View style={styles.navSectionBox}>
                <Text style={styles.infoSectionTitle}>
                  {lang === 'bn' ? 'নেভিগেশন' : 'Navigation'}
                </Text>

                {visibleMenuItems.map((item) => (
                  <TouchableOpacity
                    key={`drawer-${item.route}`}
                    style={styles.drawerNavItem}
                    onPress={() => navigateFromDrawer(item.route)}
                  >
                    <Text style={{ fontSize: 17 }}>{item.icon}</Text>
                    <Text style={styles.drawerNavLabel}>
                      {lang === 'bn' ? item.titleBn : item.titleEn}
                    </Text>
                  </TouchableOpacity>
                ))}

                <View style={styles.drawerDivider} />

                <TouchableOpacity
                  style={styles.drawerSettingsBtn}
                  onPress={() => navigateFromDrawer('/settings')}
                >
                  <Ionicons name="settings-outline" size={20} color="#1D4ED8" />
                  <Text style={styles.drawerSettingsText}>
                    {lang === 'bn' ? 'সেটিংস (Settings)' : 'Settings'}
                  </Text>
                </TouchableOpacity>
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
                      ? 'My Budget হলো ব্যক্তিগত আয়, মাসিক বাজেট, সঞ্চয়/পলিসি ও দোকানের ধারের হিসাব সহজে গুছিয়ে রাখার একটি স্মার্ট ফিন্যান্স অ্যাপ।'
                      : 'My Budget is a personal finance companion designed to track monthly income, budgets, savings plans, and shop debts cleanly.'}
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
                        ? 'My Budget Creator & Developer'
                        : 'Creator & Developer • My Budget'}
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
          </Animated.View>
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
  },
drawerScrimLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  drawerPanel: {
    backgroundColor: '#FFFFFF',
    height: '100%',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  drawerScrollContent: {
    padding: 18,
    paddingBottom: 28,
    gap: 14,
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
  navSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  drawerNavLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  drawerSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  drawerSettingsText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1D4ED8',
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