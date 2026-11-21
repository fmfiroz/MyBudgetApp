export interface DashboardModuleItem {
  id: string;
  titleEn: string;
  titleBn: string;
  icon: string;
  route: string;
  color: string;
  defaultEnabled: boolean;
}

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