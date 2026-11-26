import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  RELIGION_OPTIONS,
  ReligionType,
  SOCIAL_WORK_OPTIONS,
  SocialReligiousSheetData,
  createInitialEntries,
  getColumnsForReligion,
} from '../constants/socialReligiousConfig';
import { saveLocalData } from '../utils/firebaseSync';

interface Props {
  selectedMonthKey?: string;
  userId?: string | null;
}

interface SheetColumnDef {
  id: string;
  label: string;
  orderIndex: number;
  type: 'date' | 'checkbox' | 'number' | 'text' | 'social_dropdown';
  isEnabled: boolean;
  maxValue?: number;
}

interface DawatiTargetItem {
  id: string;
  serial: number;
  name: string;
  targetAddedDate: string;
  lastContactDate: string;
}

interface KormiTargetItem {
  id: string;
  serial: number;
  name: string;
}

const BANGLA_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const toBanglaDigits = (val: string | number) =>
  String(val).replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]);

const getCurrentMonthKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const shiftMonthKey = (monthKey: string, delta: number) => {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = (Number(mStr) || 1) - 1;
  const shifted = new Date(y, m + delta, 1);
  const outY = shifted.getFullYear();
  const outM = String(shifted.getMonth() + 1).padStart(2, '0');
  return `${outY}-${outM}`;
};

const formatBanglaMonthYear = (monthKey: string) => {
  const [yStr, mStr] = monthKey.split('-');
  const yearNum = Number(yStr) || new Date().getFullYear();
  const monthIdx = Math.max(0, Math.min(11, (Number(mStr) || 1) - 1));
  return `${BANGLA_MONTHS[monthIdx]} ${toBanglaDigits(yearNum)}`;
};

const FIXED_CORE_IDS = new Set([
  'date',
  'quran_study',
  'hadith_study',
  'islamic_literature',
  'jamat_salah',
  'social_work',
  'report_kept',
  'self_criticism',
  'meeting_participation',
  'time_spent',
  'comment',
]);

const EXTRA_TOGGLABLE_COLUMNS: SheetColumnDef[] = [
  {
    id: 'dawati_target',
    label: 'দাওয়াতি টার্গেট',
    orderIndex: 50,
    type: 'number',
    isEnabled: false,
  },
  {
    id: 'kormi_target',
    label: 'কর্মী টার্গেট',
    orderIndex: 51,
    type: 'number',
    isEnabled: false,
  },
  {
    id: 'kormi_contact',
    label: 'কর্মী যোগাযোগ',
    orderIndex: 52,
    type: 'number',
    isEnabled: false,
  },
  {
    id: 'book_distribution',
    label: 'বই বিতরণ',
    orderIndex: 53,
    type: 'number',
    isEnabled: false,
  },
];

const getTodayDateStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim();

const isJamatCol = (id: string, label: string) =>
  id === 'jamat_salah' ||
  id === 'jamat_namaz' ||
  normalizeText(label).includes('জামায়াতে নামাজ');

const isReportCol = (id: string, label: string) =>
  id === 'report_kept' || normalizeText(label).includes('রিপোর্ট রাখা');

const isMeetingCol = (id: string, label: string) =>
  id === 'meeting' ||
  id === 'meeting_participation' ||
  normalizeText(label).includes('বৈঠক') ||
  normalizeText(label).includes('আলোচনায় অংশগ্রহণ');

const isFixedCoreColumn = (col: SheetColumnDef) => FIXED_CORE_IDS.has(col.id);

const buildCleanColumns = (
  religion: ReligionType,
  savedCols?: any[]
): SheetColumnDef[] => {
  const configCols = getColumnsForReligion(religion) || [];
  const mergedSource = [...configCols, ...EXTRA_TOGGLABLE_COLUMNS];

  const configByKey = new Map<string, any>();
  mergedSource.forEach((c: any, idx: number) => {
    const rawId = String(c.id || `col_${idx}`);
    const rawLabel = normalizeText(String(c.label || 'কলাম'));
    const canonId = isMeetingCol(rawId, rawLabel)
      ? 'meeting_participation'
      : isJamatCol(rawId, rawLabel)
        ? 'jamat_salah'
        : isReportCol(rawId, rawLabel)
          ? 'report_kept'
          : rawId;

    if (!configByKey.has(canonId)) {
      configByKey.set(canonId, {
        ...c,
        id: canonId,
        label: isMeetingCol(rawId, rawLabel) ? 'আলোচনায় অংশগ্রহণ' : rawLabel,
        orderIndex:
          typeof c.orderIndex === 'number' ? c.orderIndex : idx + 1,
      });
    }
  });

  const savedEnabledMap = new Map<string, boolean>();
  if (Array.isArray(savedCols)) {
    savedCols.forEach((sc: any, idx: number) => {
      const rawId = String(sc.id || `col_${idx}`);
      const rawLabel = normalizeText(String(sc.label || 'কলাম'));
      const canonId = isMeetingCol(rawId, rawLabel)
        ? 'meeting_participation'
        : isJamatCol(rawId, rawLabel)
          ? 'jamat_salah'
          : isReportCol(rawId, rawLabel)
            ? 'report_kept'
            : rawId;

      if (!savedEnabledMap.has(canonId)) {
        savedEnabledMap.set(canonId, Boolean(sc.isEnabled));
      }
    });
  }

  const finalCols: SheetColumnDef[] = [];
  configByKey.forEach((cfg, canonId) => {
    const isFixed = FIXED_CORE_IDS.has(canonId);
    const enabled = isFixed
      ? true
      : savedEnabledMap.has(canonId)
        ? Boolean(savedEnabledMap.get(canonId))
        : Boolean(cfg.isEnabled);

    finalCols.push({
      id: canonId,
      label: cfg.label,
      orderIndex: cfg.orderIndex,
      type: cfg.type || 'checkbox',
      isEnabled: enabled,
      maxValue: isJamatCol(canonId, cfg.label) ? 5 : cfg.maxValue,
    });
  });

  if (!finalCols.some((c) => c.id === 'date')) {
    finalCols.unshift({
      id: 'date',
      label: 'তারিখ',
      orderIndex: 0,
      type: 'date',
      isEnabled: true,
    });
  }

  return finalCols.sort((a, b) => a.orderIndex - b.orderIndex);
};

const hasAnyEntryInRow = (
  values: Record<string, any>,
  cols: SheetColumnDef[]
): boolean => {
  return cols.some((col) => {
    if (col.type === 'date' || isReportCol(col.id, col.label)) return false;
    const v = values?.[col.id];
    if (col.type === 'checkbox' || col.type === 'social_dropdown') {
      return v === true;
    }
    if (col.type === 'number') {
      const n = Number(v);
      return !Number.isNaN(n) && n > 0;
    }
    if (col.type === 'text') {
      return typeof v === 'string' && v.trim().length > 0;
    }
    return false;
  });
};

const applyAutoReportCheck = (
  entries: SocialReligiousSheetData['entries'],
  cols: SheetColumnDef[]
) => {
  const reportColumn = cols.find((c) => c.isEnabled && isReportCol(c.id, c.label));
  if (!reportColumn) return entries;

  return entries.map((entry) => {
    const nextValues = { ...(entry.values || {}) };
    if (hasAnyEntryInRow(nextValues, cols)) {
      nextValues[reportColumn.id] = true;
    }
    return {
      ...entry,
      values: nextValues,
    };
  });
};

export default function SocialReligiousPage({
  selectedMonthKey,
  userId = null,
}: Props) {
  const [activeMonthKey, setActiveMonthKey] = useState<string>(
    () => selectedMonthKey || getCurrentMonthKey()
  );

  useEffect(() => {
    if (selectedMonthKey) {
      setActiveMonthKey(selectedMonthKey);
    }
  }, [selectedMonthKey]);

  const [sheetData, setSheetData] = useState<SocialReligiousSheetData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [sharingPdf, setSharingPdf] = useState<boolean>(false);

  // Modals & Menus State
  const [religionModalVisible, setReligionModalVisible] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [columnSettingsModalVisible, setColumnSettingsModalVisible] =
    useState(false);
  const [targetTableSettingsVisible, setTargetTableSettingsVisible] =
    useState(false);
  const [addTargetModalType, setAddTargetModalType] = useState<
    'dawati' | 'kormi' | null
  >(null);
  const [socialDropdownModal, setSocialDropdownModal] = useState<{
    visible: boolean;
    day: number | null;
  }>({
    visible: false,
    day: null,
  });

  // Date Picker Modal State
  const [datePickerTarget, setDatePickerTarget] = useState<
    null | 'dawatiAdded' | 'dawatiContact'
  >(null);
  const [pickerYear, setPickerYear] = useState<number>(2026);
  const [pickerMonth, setPickerMonth] = useState<number>(11);
  const [pickerDay, setPickerDay] = useState<number>(26);

  // Row Edit Modal State
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editDraftValues, setEditDraftValues] = useState<Record<string, any>>(
    {}
  );
  const [editDraftSocialType, setEditDraftSocialType] = useState<
    string | undefined
  >(undefined);

  // Target Input States (default current date)
  const [dawatiName, setDawatiName] = useState('');
  const [dawatiAddedDate, setDawatiAddedDate] = useState(() =>
    getTodayDateStr()
  );
  const [dawatiContactDate, setDawatiContactDate] = useState(() =>
    getTodayDateStr()
  );
  const [kormiName, setKormiName] = useState('');

  const storageKey = `@MyBudgetApp_SocialReligious_${userId || 'guest'}_${activeMonthKey}`;
  const formattedBanglaMonthYear = useMemo(
    () => formatBanglaMonthYear(activeMonthKey),
    [activeMonthKey]
  );

  const loadSheetData = useCallback(
    async (isMountedRef?: { current: boolean }) => {
      try {
        if (!isMountedRef || isMountedRef.current) {
          setLoading(true);
        }
        const localData = await AsyncStorage.getItem(storageKey);
        if (isMountedRef && !isMountedRef.current) return;

        if (localData) {
          const parsed = JSON.parse(localData) as SocialReligiousSheetData;
          const cols = buildCleanColumns(
            parsed.religion || 'islam',
            parsed.columns || []
          );
          const entries = applyAutoReportCheck(parsed.entries || [], cols);
          setSheetData({
            ...parsed,
            columns: cols as any,
            entries,
          });
        } else {
          setSheetData(null);
        }
      } catch (error) {
        console.error('Error loading social-religious data:', error);
      } finally {
        if (!isMountedRef || isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [storageKey]
  );

  useEffect(() => {
    const mountedRef = { current: true };
    void loadSheetData(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, [loadSheetData]);

  const saveSheetData = useCallback(
    async (updatedData: SocialReligiousSheetData | null) => {
      try {
        setSheetData(updatedData);
        if (updatedData === null) {
          await AsyncStorage.removeItem(storageKey);
        } else {
          await saveLocalData(storageKey, updatedData);
        }
      } catch (error) {
        console.error('Error saving social-religious data:', error);
      }
    },
    [storageKey]
  );

  const handleSelectReligion = (religion: ReligionType) => {
    const [yearStr, monthStr] = activeMonthKey.split('-');
    const daysInMonth =
      new Date(Number(yearStr), Number(monthStr), 0).getDate() || 30;
    const cols = buildCleanColumns(religion);
    const entries = createInitialEntries(daysInMonth, cols as any);

    const newSheet: SocialReligiousSheetData = {
      monthKey: activeMonthKey,
      religion,
      columns: cols as any,
      entries,
      isDawatiListVisible: false,
      dawatiTargets: [],
      isKormiListVisible: false,
      kormiTargets: [],
    };

    void saveSheetData(newSheet);
    setReligionModalVisible(false);
  };

  const allNormalizedColumns = useMemo<SheetColumnDef[]>(() => {
    if (!sheetData) return [];
    return buildCleanColumns(
      sheetData.religion || 'islam',
      sheetData.columns || []
    );
  }, [sheetData]);

  const activeColumns = useMemo<SheetColumnDef[]>(() => {
    return allNormalizedColumns
      .filter((col) => col.isEnabled)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [allNormalizedColumns]);

  const configurableExtraColumns = useMemo<SheetColumnDef[]>(() => {
    return allNormalizedColumns
      .filter((col) => !isFixedCoreColumn(col))
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [allNormalizedColumns]);

  const handleToggleExtraColumnFromSettings = (colId: string) => {
    if (!sheetData) return;
    const target = allNormalizedColumns.find((c) => c.id === colId);
    if (!target || isFixedCoreColumn(target)) return;

    const updatedCols = allNormalizedColumns
      .map((col) =>
        col.id === colId ? { ...col, isEnabled: !col.isEnabled } : col
      )
      .sort((a, b) => a.orderIndex - b.orderIndex);

    void saveSheetData({ ...sheetData, columns: updatedCols as any });
  };

  const handleToggleDawatiTableSetting = () => {
    if (!sheetData) return;
    void saveSheetData({
      ...sheetData,
      isDawatiListVisible: !sheetData.isDawatiListVisible,
    });
  };

  const handleToggleKormiTableSetting = () => {
    if (!sheetData) return;
    void saveSheetData({
      ...sheetData,
      isKormiListVisible: !sheetData.isKormiListVisible,
    });
  };

  const openAddTargetModal = (type: 'dawati' | 'kormi') => {
    const today = getTodayDateStr();
    if (type === 'dawati') {
      setDawatiName('');
      setDawatiAddedDate(today);
      setDawatiContactDate(today);
    } else {
      setKormiName('');
    }
    setAddTargetModalType(type);
  };

  const openDatePickerFor = (
    target: 'dawatiAdded' | 'dawatiContact',
    currentVal: string
  ) => {
    const parts = (currentVal || getTodayDateStr()).split('-');
    const y = Number(parts[0]) || new Date().getFullYear();
    const m = Number(parts[1]) || new Date().getMonth() + 1;
    const maxD = new Date(y, m, 0).getDate();
    const d = Math.min(
      maxD,
      Math.max(1, Number(parts[2]) || new Date().getDate())
    );
    setPickerYear(y);
    setPickerMonth(m);
    setPickerDay(d);
    setDatePickerTarget(target);
  };

  const daysInPickerMonth = useMemo(() => {
    return new Date(pickerYear, pickerMonth, 0).getDate();
  }, [pickerYear, pickerMonth]);

  const confirmPickedDate = () => {
    const clampedDay = Math.min(pickerDay, daysInPickerMonth);
    const formatted = `${pickerYear}-${String(pickerMonth).padStart(
      2,
      '0'
    )}-${String(clampedDay).padStart(2, '0')}`;
    if (datePickerTarget === 'dawatiAdded') {
      setDawatiAddedDate(formatted);
    } else if (datePickerTarget === 'dawatiContact') {
      setDawatiContactDate(formatted);
    }
    setDatePickerTarget(null);
  };

  const handleUpdateCell = (
    day: number,
    colId: string,
    value: boolean | number | string | null
  ) => {
    if (!sheetData) return;
    const reportColumn = activeColumns.find((c) =>
      isReportCol(c.id, c.label)
    );

    let normalizedValue = value;
    if (isJamatCol(colId, '') && typeof value === 'number') {
      normalizedValue = Math.max(0, Math.min(5, Math.floor(value)));
    }

    const updatedEntries = sheetData.entries.map((entry) => {
      if (entry.day !== day) return entry;

      const nextValues: Record<string, any> = {
        ...entry.values,
        [colId]: normalizedValue,
      };

      const nextSocialType =
        colId === 'social_work'
          ? normalizedValue === true
            ? entry.socialWorkType || SOCIAL_WORK_OPTIONS[0]
            : undefined
          : entry.socialWorkType;

      if (
        reportColumn &&
        colId !== reportColumn.id &&
        hasAnyEntryInRow(nextValues, activeColumns)
      ) {
        nextValues[reportColumn.id] = true;
      }

      return {
        ...entry,
        socialWorkType: nextSocialType,
        values: nextValues,
      };
    });
    void saveSheetData({ ...sheetData, entries: updatedEntries });
  };

  const handleSelectSocialWork = (workName: string | null) => {
    if (!sheetData || socialDropdownModal.day === null) return;
    const targetDay = socialDropdownModal.day;
    const reportColumn = activeColumns.find((c) =>
      isReportCol(c.id, c.label)
    );

    const updatedEntries = sheetData.entries.map((entry) => {
      if (entry.day === targetDay) {
        const nextValues: Record<string, any> = {
          ...entry.values,
          social_work: Boolean(workName),
        };
        if (
          reportColumn &&
          (workName || hasAnyEntryInRow(nextValues, activeColumns))
        ) {
          nextValues[reportColumn.id] = true;
        }
        return {
          ...entry,
          socialWorkType: workName || undefined,
          values: nextValues,
        };
      }
      return entry;
    });

    void saveSheetData({ ...sheetData, entries: updatedEntries });
    setSocialDropdownModal({ visible: false, day: null });
  };

  const handleOpenEditRow = (day: number) => {
    if (!sheetData) return;
    const row = sheetData.entries.find((e) => e.day === day);
    if (!row) return;
    setEditingDay(day);
    setEditDraftValues({ ...(row.values || {}) });
    setEditDraftSocialType(row.socialWorkType);
  };

  const handleSaveEditRow = () => {
    if (!sheetData || editingDay === null) return;
    const reportColumn = activeColumns.find((c) =>
      isReportCol(c.id, c.label)
    );
    const nextValues = { ...editDraftValues };

    if (reportColumn && hasAnyEntryInRow(nextValues, activeColumns)) {
      nextValues[reportColumn.id] = true;
    }

    const updatedEntries = sheetData.entries.map((entry) => {
      if (entry.day !== editingDay) return entry;
      return {
        ...entry,
        socialWorkType:
          nextValues.social_work === true
            ? editDraftSocialType || SOCIAL_WORK_OPTIONS[0]
            : undefined,
        values: nextValues,
      };
    });

    void saveSheetData({ ...sheetData, entries: updatedEntries });
    setEditingDay(null);
  };

  const handleAddDawatiTarget = (): boolean => {
    if (!sheetData || !dawatiName.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে দাওয়াতি টার্গেটের নাম লিখুন।');
      return false;
    }
    const today = getTodayDateStr();
    const currentList = (sheetData.dawatiTargets || []) as DawatiTargetItem[];
    const newTarget: DawatiTargetItem = {
      id: Date.now().toString(),
      serial: currentList.length + 1,
      name: dawatiName.trim(),
      targetAddedDate: dawatiAddedDate.trim() || today,
      lastContactDate: dawatiContactDate.trim() || today,
    };
    void saveSheetData({
      ...sheetData,
      dawatiTargets: [...currentList, newTarget],
    });
    setDawatiName('');
    setDawatiAddedDate(today);
    setDawatiContactDate(today);
    return true;
  };

  const confirmAndRemoveDawatiTarget = (item: DawatiTargetItem) => {
    if (!sheetData) return;
    Alert.alert(
      'নিশ্চিত ডিলিট করুন',
      `"${item.name}" নামটি দাওয়াতি টার্গেট তালিকা থেকে স্থায়ীভাবে মুছে ফেলতে চান?`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'হ্যাঁ, ডিলিট করুন',
          style: 'destructive',
          onPress: () => {
            const currentList = (sheetData.dawatiTargets ||
              []) as DawatiTargetItem[];
            const reindexed = currentList
              .filter((row) => row.id !== item.id)
              .map((row, idx) => ({ ...row, serial: idx + 1 }));
            void saveSheetData({
              ...sheetData,
              dawatiTargets: reindexed,
            });
          },
        },
      ]
    );
  };

  const handleAddKormiTarget = (): boolean => {
    if (!sheetData || !kormiName.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে কর্মী টার্গেটের নাম লিখুন।');
      return false;
    }
    const currentList = (sheetData.kormiTargets || []) as KormiTargetItem[];
    const newTarget: KormiTargetItem = {
      id: Date.now().toString(),
      serial: currentList.length + 1,
      name: kormiName.trim(),
    };
    void saveSheetData({
      ...sheetData,
      kormiTargets: [...currentList, newTarget],
    });
    setKormiName('');
    return true;
  };

  const confirmAndRemoveKormiTarget = (item: KormiTargetItem) => {
    if (!sheetData) return;
    Alert.alert(
      'নিশ্চিত ডিলিট করুন',
      `"${item.name}" নামটি কর্মী টার্গেট তালিকা থেকে স্থায়ীভাবে মুছে ফেলতে চান?`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'হ্যাঁ, ডিলিট করুন',
          style: 'destructive',
          onPress: () => {
            const currentList = (sheetData.kormiTargets ||
              []) as KormiTargetItem[];
            const reindexed = currentList
              .filter((row) => row.id !== item.id)
              .map((row, idx) => ({ ...row, serial: idx + 1 }));
            void saveSheetData({
              ...sheetData,
              kormiTargets: reindexed,
            });
          },
        },
      ]
    );
  };

  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number | string> = {};
    if (!sheetData) return totals;

    activeColumns.forEach((col) => {
      if (col.type === 'date') {
        totals[col.id] = 'মোট';
      } else if (col.type === 'checkbox' || col.type === 'social_dropdown') {
        const count = sheetData.entries.filter(
          (e) => e.values?.[col.id] === true
        ).length;
        totals[col.id] = `${count} দিন`;
      } else if (col.type === 'number') {
        const sum = sheetData.entries.reduce((acc, e) => {
          const val = Number(e.values?.[col.id]);
          return acc + (Number.isNaN(val) ? 0 : val);
        }, 0);
        totals[col.id] = sum;
      } else {
        totals[col.id] = '-';
      }
    });

    return totals;
  }, [sheetData, activeColumns]);

  const currentReligionConfig = RELIGION_OPTIONS.find(
    (r) => r.key === sheetData?.religion
  );

  const handleSharePdfReport = async () => {
    if (!sheetData) return;
    try {
      setSharingPdf(true);

      const headerCells = activeColumns
        .map((c) => `<th>${c.label}</th>`)
        .join('');

      const rowsHtml = sheetData.entries
        .map((entry) => {
          const cells = activeColumns
            .map((col) => {
              if (col.type === 'date') {
                return `<td style="text-align:center;font-weight:bold;">${entry.day}</td>`;
              }
              const v = entry.values?.[col.id];
              if (col.type === 'checkbox') {
                return `<td style="text-align:center;">${v === true ? '✓' : '-'}</td>`;
              }
              if (col.type === 'social_dropdown') {
                return `<td>${v === true ? entry.socialWorkType || '✓' : '-'}</td>`;
              }
              if (col.type === 'number') {
                const n = Number(v);
                return `<td style="text-align:center;">${
                  !Number.isNaN(n) && n > 0 ? n : '-'
                }</td>`;
              }
              return `<td>${typeof v === 'string' && v.trim() ? v : '-'}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');

      const footerCells = activeColumns
        .map(
          (col) =>
            `<td style="text-align:center;font-weight:bold;background:#E8F5E9;">${
              monthlyTotals[col.id] ?? '-'
            }</td>`
        )
        .join('');

      const dawatiTableHtml =
        sheetData.isDawatiListVisible && sheetData.dawatiTargets.length > 0
          ? `
          <h3 style="margin-top:18px;">${currentReligionConfig?.dawatiListTitle || 'দাওয়াতি টার্গেট তালিকা'}</h3>
          <table>
            <thead>
              <tr><th>ক্রমিক</th><th>নাম</th><th>টার্গেট তারিখ</th><th>যোগাযোগ তারিখ</th></tr>
            </thead>
            <tbody>
              ${sheetData.dawatiTargets
                .map(
                  (d) =>
                    `<tr><td>${d.serial}</td><td>${d.name}</td><td>${d.targetAddedDate}</td><td>${d.lastContactDate}</td></tr>`
                )
                .join('')}
            </tbody>
          </table>`
          : '';

      const kormiTableHtml =
        sheetData.isKormiListVisible && sheetData.kormiTargets.length > 0
          ? `
          <h3 style="margin-top:18px;">${currentReligionConfig?.kormiListTitle || 'কর্মী টার্গেট তালিকা'}</h3>
          <table>
            <thead>
              <tr><th>সিরিয়াল</th><th>কর্মী টার্গেটের নাম</th></tr>
            </thead>
            <tbody>
              ${sheetData.kormiTargets
                .map(
                  (k) => `<tr><td>${k.serial}</td><td>${k.name}</td></tr>`
                )
                .join('')}
            </tbody>
          </table>`
          : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 12px; color: #1E293B; }
              h2 { margin: 0 0 4px 0; color: #1B5E20; }
              p { margin: 0 0 10px 0; font-size: 12px; color: #475569; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th, td { border: 1px solid #94A3B8; padding: 5px; }
              th { background: #263238; color: #FFFFFF; }
            </style>
          </head>
          <body>
            <h2>সামাজিক ও ধর্মীয় রিপোর্ট (${formattedBanglaMonthYear})</h2>
            <p>${currentReligionConfig?.label || ''}</p>
            <table>
              <thead><tr>${headerCells}</tr></thead>
              <tbody>
                ${rowsHtml}
                <tr>${footerCells}</tr>
              </tbody>
            </table>
            ${dawatiTableHtml}
            ${kormiTableHtml}
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(htmlContent);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 250);
        }
        return;
      }

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Social_Religious_Report_${activeMonthKey}.pdf`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF তৈরি হয়েছে', `ফাইলটি সেভ হয়েছে: ${uri}`);
      }
    } catch (error) {
      console.error('PDF share error:', error);
      Alert.alert('সমস্যা হয়েছে', 'PDF তৈরি বা শেয়ার করা যায়নি।');
    } finally {
      setSharingPdf(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>লোড হচ্ছে...</Text>
      </View>
    );
  }

  if (!sheetData) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={styles.monthSwitcherRow}>
          <TouchableOpacity
            style={styles.monthArrowBtn}
            onPress={() => setActiveMonthKey((prev) => shiftMonthKey(prev, -1))}
            accessibilityLabel="আগের মাস"
          >
            <Ionicons name="chevron-back" size={18} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.monthSwitcherLabel}>
            {formattedBanglaMonthYear}
          </Text>
          <TouchableOpacity
            style={styles.monthArrowBtn}
            onPress={() => setActiveMonthKey((prev) => shiftMonthKey(prev, 1))}
            accessibilityLabel="পরের মাস"
          >
            <Ionicons name="chevron-forward" size={18} color="#1E293B" />
          </TouchableOpacity>
        </View>

        <Ionicons name="book-outline" size={64} color="#2E7D32" />
        <Text style={styles.emptyTitle}>সামাজিক ও ধর্মীয় রিপোর্ট</Text>
        <Text style={styles.emptySubtitle}>
          {formattedBanglaMonthYear} মাসের রিপোর্ট শুরু করতে নিচের বাটনে ক্লিক করে
          আপনার ধর্ম নির্বাচন করুন।
        </Text>
        <TouchableOpacity
          style={styles.primaryAddButton}
          onPress={() => setReligionModalVisible(true)}
        >
          <Ionicons name="add-circle-outline" size={22} color="#FFF" />
          <Text style={styles.primaryAddButtonText}>
            নতুন শিট যুক্ত করুন (Add)
          </Text>
        </TouchableOpacity>

        <Modal visible={religionModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>আপনার ধর্ম নির্বাচন করুন</Text>
              {RELIGION_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.religionOptionBtn}
                  onPress={() => handleSelectReligion(item.key)}
                >
                  <Text style={styles.religionOptionText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#555" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setReligionModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>বাতিল</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  const dawatiRows = (sheetData.dawatiTargets || []) as DawatiTargetItem[];
  const kormiRows = (sheetData.kormiTargets || []) as KormiTargetItem[];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBar}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <View style={styles.headerMonthRow}>
            <TouchableOpacity
              style={styles.headerArrowBtn}
              onPress={() =>
                setActiveMonthKey((prev) => shiftMonthKey(prev, -1))
              }
              accessibilityLabel="আগের মাস"
            >
              <Ionicons name="chevron-back" size={16} color="#1E293B" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {formattedBanglaMonthYear}
            </Text>
            <TouchableOpacity
              style={styles.headerArrowBtn}
              onPress={() =>
                setActiveMonthKey((prev) => shiftMonthKey(prev, 1))
              }
              accessibilityLabel="পরের মাস"
            >
              <Ionicons name="chevron-forward" size={16} color="#1E293B" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSub} numberOfLines={1}>
            {currentReligionConfig?.label}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.sharePdfBtn}
            onPress={() => void handleSharePdfReport()}
            disabled={sharingPdf}
          >
            {sharingPdf ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={16} color="#FFF" />
                <Text style={styles.sharePdfBtnText}>PDF / Share</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.threeDotBtn}
            onPress={() => setSettingsMenuVisible(true)}
            accessibilityLabel="Settings"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#1E293B" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Main Daily Sheet Table */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.tableWrapper}
        >
          <View>
            <View style={styles.tableHeaderRow}>
              {activeColumns.map((col) => (
                <View
                  key={col.id}
                  style={[
                    styles.cellHeader,
                    col.type === 'date' && styles.dateColWidth,
                    col.type === 'text' && styles.commentColWidth,
                    col.type === 'social_dropdown' && styles.socialColWidth,
                  ]}
                >
                  <Text style={styles.headerCellText}>{col.label}</Text>
                </View>
              ))}
              <View style={[styles.cellHeader, styles.actionColWidth]}>
                <Text style={styles.headerCellText}>Action</Text>
              </View>
            </View>

            {sheetData.entries.map((entry, rowIndex) => (
              <View
                key={entry.day}
                style={[
                  styles.tableRow,
                  rowIndex % 2 === 1 && styles.tableRowAlt,
                ]}
              >
                {activeColumns.map((col) => {
                  const cellVal = entry.values?.[col.id];

                  if (col.type === 'date') {
                    return (
                      <View
                        key={col.id}
                        style={[styles.cell, styles.dateColWidth]}
                      >
                        <Text style={styles.dateText}>{entry.day}</Text>
                      </View>
                    );
                  }

                  if (col.type === 'checkbox') {
                    const isChecked = cellVal === true;
                    return (
                      <TouchableOpacity
                        key={col.id}
                        style={styles.cell}
                        onPress={() =>
                          handleUpdateCell(entry.day, col.id, !isChecked)
                        }
                      >
                        <View
                          style={[
                            styles.checkboxBox,
                            isChecked && styles.checkboxBoxChecked,
                          ]}
                        >
                          {isChecked ? (
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                          ) : (
                            <Text style={styles.falseText}>FALSE</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  if (col.type === 'social_dropdown') {
                    const isDone = cellVal === true;
                    return (
                      <TouchableOpacity
                        key={col.id}
                        style={[styles.cell, styles.socialColWidth]}
                        onPress={() =>
                          setSocialDropdownModal({ visible: true, day: entry.day })
                        }
                      >
                        {isDone ? (
                          <View style={styles.socialSelectedBadge}>
                            <Ionicons
                              name="checkmark-circle"
                              size={15}
                              color="#2E7D32"
                            />
                            <Text
                              style={styles.socialSelectedText}
                              numberOfLines={1}
                            >
                              {entry.socialWorkType}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.falseText}>FALSE ▾</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }

                  if (col.type === 'number') {
                    const isJamat = isJamatCol(col.id, col.label);
                    return (
                      <View key={col.id} style={styles.cell}>
                        <TextInput
                          style={styles.numberInput}
                          keyboardType="numeric"
                          placeholder={isJamat ? '1-5' : '-'}
                          value={
                            cellVal !== null && cellVal !== undefined
                              ? String(cellVal)
                              : ''
                          }
                          onChangeText={(txt) => {
                            const cleaned = txt.replace(/[^0-9]/g, '');
                            if (cleaned === '') {
                              handleUpdateCell(entry.day, col.id, null);
                              return;
                            }
                            let num = Number(cleaned);
                            if (isJamat) {
                              num = Math.min(5, num);
                            }
                            handleUpdateCell(entry.day, col.id, num);
                          }}
                        />
                      </View>
                    );
                  }

                  return (
                    <View
                      key={col.id}
                      style={[styles.cell, styles.commentColWidth]}
                    >
                      <TextInput
                        style={styles.textInput}
                        placeholder="মন্তব্য..."
                        value={typeof cellVal === 'string' ? cellVal : ''}
                        onChangeText={(txt) =>
                          handleUpdateCell(entry.day, col.id, txt)
                        }
                      />
                    </View>
                  );
                })}

                <View style={[styles.cell, styles.actionColWidth]}>
                  <TouchableOpacity
                    style={styles.rowEditBtn}
                    onPress={() => handleOpenEditRow(entry.day)}
                  >
                    <Ionicons name="create-outline" size={16} color="#1565C0" />
                    <Text style={styles.rowEditBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.tableFooterRow}>
              {activeColumns.map((col) => (
                <View
                  key={col.id}
                  style={[
                    styles.cellFooter,
                    col.type === 'date' && styles.dateColWidth,
                    col.type === 'text' && styles.commentColWidth,
                    col.type === 'social_dropdown' && styles.socialColWidth,
                  ]}
                >
                  <Text style={styles.footerCellText}>
                    {monthlyTotals[col.id]}
                  </Text>
                </View>
              ))}
              <View style={[styles.cellFooter, styles.actionColWidth]}>
                <Text style={styles.footerCellText}>-</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Dawati Target Table */}
        {sheetData.isDawatiListVisible && (
          <View style={styles.listSection}>
            <View style={styles.targetCard}>
              <Text style={styles.targetCardTitle}>দাওয়াতি টার্গেট তালিকা</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.borderedTable}>
                  <View style={styles.subTableHeader}>
                    <Text style={[styles.subTh, styles.serialCell]}>ক্রমিক</Text>
                    <Text style={[styles.subTh, styles.nameCell]}>নাম</Text>
                    <Text style={[styles.subTh, styles.dateCell]}>
                      টার্গেট তারিখ
                    </Text>
                    <Text style={[styles.subTh, styles.dateCell]}>
                      যোগাযোগ তারিখ
                    </Text>
                    {dawatiRows.length > 0 && (
                      <Text style={[styles.subTh, styles.deleteColCell]}>
                        ডিলিট
                      </Text>
                    )}
                  </View>

                  {dawatiRows.length === 0 ? (
                    <Text style={styles.emptyListHint}>
                      এখনো কোনো নাম যুক্ত করা হয়নি।
                    </Text>
                  ) : (
                    dawatiRows.map((item, idx) => (
                      <View
                        key={item.id}
                        style={[
                          styles.subTableRow,
                          idx % 2 === 1 && styles.tableRowAlt,
                        ]}
                      >
                        <Text style={[styles.subTd, styles.serialCell]}>
                          {item.serial}
                        </Text>
                        <Text
                          style={[
                            styles.subTd,
                            styles.nameCell,
                            { fontWeight: '600' },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text style={[styles.subTd, styles.dateCell]}>
                          {item.targetAddedDate}
                        </Text>
                        <Text style={[styles.subTd, styles.dateCell]}>
                          {item.lastContactDate}
                        </Text>
                        <View style={[styles.subTdCenter, styles.deleteColCell]}>
                          <TouchableOpacity
                            style={styles.rowDeleteBtn}
                            onPress={() => confirmAndRemoveDawatiTarget(item)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={14}
                              color="#DC2626"
                            />
                            <Text style={styles.rowDeleteBtnText}>ডিলিট</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>

              <View style={styles.tablePlusActionRow}>
                <TouchableOpacity
                  style={styles.tablePlusBtn}
                  onPress={() => openAddTargetModal('dawati')}
                  accessibilityLabel="দাওয়াতি টার্গেট যুক্ত করুন"
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Bottom Kormi Target Table */}
        {sheetData.isKormiListVisible && (
          <View style={styles.listSection}>
            <View style={styles.targetCard}>
              <Text style={styles.targetCardTitle}>কর্মী টার্গেট তালিকা</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.borderedTable}>
                  <View style={styles.subTableHeader}>
                    <Text style={[styles.subTh, styles.serialCell]}>
                      সিরিয়াল
                    </Text>
                    <Text style={[styles.subTh, styles.kormiNameCell]}>
                      নাম
                    </Text>
                    {kormiRows.length > 0 && (
                      <Text style={[styles.subTh, styles.deleteColCell]}>
                        ডিলিট
                      </Text>
                    )}
                  </View>

                  {kormiRows.length === 0 ? (
                    <Text style={styles.emptyListHint}>
                      এখনো কোনো নাম যুক্ত করা হয়নি।
                    </Text>
                  ) : (
                    kormiRows.map((item, idx) => (
                      <View
                        key={item.id}
                        style={[
                          styles.subTableRow,
                          idx % 2 === 1 && styles.tableRowAlt,
                        ]}
                      >
                        <Text style={[styles.subTd, styles.serialCell]}>
                          {item.serial}
                        </Text>
                        <Text
                          style={[
                            styles.subTd,
                            styles.kormiNameCell,
                            { fontWeight: '600' },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <View style={[styles.subTdCenter, styles.deleteColCell]}>
                          <TouchableOpacity
                            style={styles.rowDeleteBtn}
                            onPress={() => confirmAndRemoveKormiTarget(item)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={14}
                              color="#DC2626"
                            />
                            <Text style={styles.rowDeleteBtnText}>ডিলিট</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>

              <View style={styles.tablePlusActionRow}>
                <TouchableOpacity
                  style={[styles.tablePlusBtn, { backgroundColor: '#2E7D32' }]}
                  onPress={() => openAddTargetModal('kormi')}
                  accessibilityLabel="কর্মী টার্গেট যুক্ত করুন"
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomOptionsBar}>
          <TouchableOpacity
            style={styles.bottomDotTriggerBtn}
            onPress={() => setSettingsMenuVisible(true)}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#1E293B" />
            <Text style={styles.bottomDotTriggerText}>
              সেটিংস ও অপশন (⋮)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Dawati / Kormi Target Modal (Triggered from Table + Button) */}
      <Modal
        visible={addTargetModalType !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAddTargetModalType(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {addTargetModalType === 'dawati'
                ? 'দাওয়াতি টার্গেট তালিকায় নাম যুক্ত করুন'
                : 'কর্মী টার্গেট তালিকায় নাম যুক্ত করুন'}
            </Text>

            {addTargetModalType === 'dawati' ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={styles.editModalLabel}>নাম</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="নাম লিখুন"
                  value={dawatiName}
                  onChangeText={setDawatiName}
                />

                <Text style={styles.editModalLabel}>টার্গেট তারিখ</Text>
                <TouchableOpacity
                  style={styles.datePickerTriggerFull}
                  onPress={() => openDatePickerFor('dawatiAdded', dawatiAddedDate)}
                >
                  <Ionicons name="calendar-outline" size={16} color="#1565C0" />
                  <Text style={styles.datePickerTriggerText}>
                    {dawatiAddedDate}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.editModalLabel}>যোগাযোগ তারিখ</Text>
                <TouchableOpacity
                  style={styles.datePickerTriggerFull}
                  onPress={() =>
                    openDatePickerFor('dawatiContact', dawatiContactDate)
                  }
                >
                  <Ionicons name="calendar-outline" size={16} color="#1565C0" />
                  <Text style={styles.datePickerTriggerText}>
                    {dawatiContactDate}
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.modalCloseBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => setAddTargetModalType(null)}
                  >
                    <Text style={styles.modalCloseBtnText}>বাতিল</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalCloseBtn,
                      { flex: 1, marginTop: 0, backgroundColor: '#1565C0' },
                    ]}
                    onPress={() => {
                      if (handleAddDawatiTarget()) {
                        setAddTargetModalType(null);
                      }
                    }}
                  >
                    <Text style={[styles.modalCloseBtnText, { color: '#FFF' }]}>
                      যুক্ত করুন
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={styles.editModalLabel}>কর্মী টার্গেটের নাম</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="নাম লিখুন"
                  value={kormiName}
                  onChangeText={setKormiName}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.modalCloseBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => setAddTargetModalType(null)}
                  >
                    <Text style={styles.modalCloseBtnText}>বাতিল</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalCloseBtn,
                      { flex: 1, marginTop: 0, backgroundColor: '#2E7D32' },
                    ]}
                    onPress={() => {
                      if (handleAddKormiTarget()) {
                        setAddTargetModalType(null);
                      }
                    }}
                  >
                    <Text style={[styles.modalCloseBtnText, { color: '#FFF' }]}>
                      যুক্ত করুন
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Settings Menu Modal */}
      <Modal
        visible={settingsMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSettingsMenuVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>সেটিংস</Text>

            <TouchableOpacity
              style={styles.menuRowBtn}
              onPress={() => {
                setSettingsMenuVisible(false);
                setColumnSettingsModalVisible(true);
              }}
            >
              <Ionicons name="options-outline" size={20} color="#1565C0" />
              <Text style={styles.menuRowText}>
                কলাম সেটিংস (দাওয়াতি, কর্মী, যোগাযোগ, বই বিতরণ)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRowBtn}
              onPress={() => {
                setSettingsMenuVisible(false);
                setTargetTableSettingsVisible(true);
              }}
            >
              <Ionicons name="list-outline" size={20} color="#2E7D32" />
              <Text style={styles.menuRowText}>
                টার্গেট টেবিল সেটিংস (দাওয়াতি ও কর্মী টার্গেট)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSettingsMenuVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>বন্ধ করুন</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Extra Columns Settings Modal (Add / Remove from Settings) */}
      <Modal
        visible={columnSettingsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setColumnSettingsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>অতিরিক্ত কলাম সেটিংস</Text>
            <Text style={styles.modalSub}>
              সেটিংস থেকে কলাম যুক্ত করুন বা তুলে নিন:
            </Text>

            {configurableExtraColumns.map((col) => (
              <TouchableOpacity
                key={col.id}
                style={styles.toggleSettingRow}
                onPress={() => handleToggleExtraColumnFromSettings(col.id)}
              >
                <Text style={styles.religionOptionText}>{col.label}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    col.isEnabled
                      ? styles.statusBadgeActive
                      : styles.statusBadgeInactive,
                  ]}
                >
                  <Ionicons
                    name={
                      col.isEnabled ? 'checkmark-circle' : 'add-circle-outline'
                    }
                    size={16}
                    color={col.isEnabled ? '#1B5E20' : '#475569'}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      col.isEnabled
                        ? styles.statusBadgeTextActive
                        : styles.statusBadgeTextInactive,
                    ]}
                  >
                    {col.isEnabled ? 'যুক্ত আছে (তুলে নিন)' : 'যুক্ত করুন'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setColumnSettingsModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>সম্পন্ন (Done)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Target Tables Settings Modal (Add / Remove from Settings) */}
      <Modal
        visible={targetTableSettingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTargetTableSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>টার্গেট টেবিল সেটিংস</Text>
            <Text style={styles.modalSub}>
              নিচের দাওয়াতি ও কর্মী টার্গেট টেবিল যুক্ত বা তুলে নিন:
            </Text>

            <TouchableOpacity
              style={styles.toggleSettingRow}
              onPress={handleToggleDawatiTableSetting}
            >
              <Text style={styles.religionOptionText}>দাওয়াতি টার্গেট তালিকা</Text>
              <View
                style={[
                  styles.statusBadge,
                  sheetData.isDawatiListVisible
                    ? styles.statusBadgeActive
                    : styles.statusBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    sheetData.isDawatiListVisible
                      ? styles.statusBadgeTextActive
                      : styles.statusBadgeTextInactive,
                  ]}
                >
                  {sheetData.isDawatiListVisible
                    ? 'যুক্ত আছে (তুলে নিন)'
                    : 'যুক্ত করুন'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleSettingRow}
              onPress={handleToggleKormiTableSetting}
            >
              <Text style={styles.religionOptionText}>কর্মী টার্গেট তালিকা</Text>
              <View
                style={[
                  styles.statusBadge,
                  sheetData.isKormiListVisible
                    ? styles.statusBadgeActive
                    : styles.statusBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    sheetData.isKormiListVisible
                      ? styles.statusBadgeTextActive
                      : styles.statusBadgeTextInactive,
                  ]}
                >
                  {sheetData.isKormiListVisible
                    ? 'যুক্ত আছে (তুলে নিন)'
                    : 'যুক্ত করুন'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setTargetTableSettingsVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>সম্পন্ন (Done)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={datePickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>তারিখ নির্বাচন করুন</Text>
            <Text style={styles.modalSub}>
              নির্বাচিত তারিখ:{' '}
              {`${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(
                Math.min(pickerDay, daysInPickerMonth)
              ).padStart(2, '0')}`}
            </Text>

            <View style={styles.pickerColumns}>
              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>বছর</Text>
                <ScrollView style={styles.pickerScroll}>
                  {[2025, 2026, 2027, 2028].map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={[
                        styles.pickerOption,
                        pickerYear === y && styles.pickerOptionSelected,
                      ]}
                      onPress={() => setPickerYear(y)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          pickerYear === y && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>মাস</Text>
                <ScrollView style={styles.pickerScroll}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.pickerOption,
                        pickerMonth === m && styles.pickerOptionSelected,
                      ]}
                      onPress={() => setPickerMonth(m)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          pickerMonth === m && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>দিন</Text>
                <ScrollView style={styles.pickerScroll}>
                  {Array.from({ length: daysInPickerMonth }, (_, i) => i + 1).map(
                    (d) => (
                      <TouchableOpacity
                        key={d}
                        style={[
                          styles.pickerOption,
                          pickerDay === d && styles.pickerOptionSelected,
                        ]}
                        onPress={() => setPickerDay(d)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            pickerDay === d && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {String(d).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1 }]}
                onPress={() => setDatePickerTarget(null)}
              >
                <Text style={styles.modalCloseBtnText}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCloseBtn,
                  { flex: 1, backgroundColor: '#1565C0' },
                ]}
                onPress={confirmPickedDate}
              >
                <Text style={[styles.modalCloseBtnText, { color: '#FFF' }]}>
                  তারিখ সেট করুন
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={socialDropdownModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              সামাজিক কাজ নির্বাচন করুন (তারিখ: {socialDropdownModal.day})
            </Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {SOCIAL_WORK_OPTIONS.map((work, index) => (
                <TouchableOpacity
                  key={work}
                  style={styles.religionOptionBtn}
                  onPress={() => handleSelectSocialWork(work)}
                >
                  <Text style={styles.religionOptionText}>
                    {index + 1}. {work}
                  </Text>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color="#2E7D32"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[
                  styles.modalCloseBtn,
                  { flex: 1, backgroundColor: '#FFEBEE' },
                ]}
                onPress={() => handleSelectSocialWork(null)}
              >
                <Text style={[styles.modalCloseBtnText, { color: '#C62828' }]}>
                  মুছে ফেলুন (FALSE)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1 }]}
                onPress={() =>
                  setSocialDropdownModal({ visible: false, day: null })
                }
              >
                <Text style={styles.modalCloseBtnText}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingDay !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingDay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>
              তারিখ {editingDay} — এডিট করুন
            </Text>
            <ScrollView style={{ marginVertical: 8 }}>
              {activeColumns.map((col) => {
                if (col.type === 'date' || isReportCol(col.id, col.label)) {
                  return null;
                }
                const val = editDraftValues[col.id];

                if (col.type === 'checkbox') {
                  const checked = val === true;
                  return (
                    <TouchableOpacity
                      key={col.id}
                      style={styles.editModalRow}
                      onPress={() =>
                        setEditDraftValues((prev) => ({
                          ...prev,
                          [col.id]: !checked,
                        }))
                      }
                    >
                      <Text style={styles.editModalLabel}>{col.label}</Text>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color="#2E7D32"
                      />
                    </TouchableOpacity>
                  );
                }

                if (col.type === 'social_dropdown') {
                  const checked = val === true;
                  return (
                    <View key={col.id} style={styles.editModalField}>
                      <TouchableOpacity
                        style={styles.editModalRow}
                        onPress={() =>
                          setEditDraftValues((prev) => ({
                            ...prev,
                            [col.id]: !checked,
                          }))
                        }
                      >
                        <Text style={styles.editModalLabel}>{col.label}</Text>
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color="#2E7D32"
                        />
                      </TouchableOpacity>
                      {checked && (
                        <TextInput
                          style={styles.formInput}
                          placeholder="সামাজিক কাজের ধরন"
                          value={
                            editDraftSocialType || SOCIAL_WORK_OPTIONS[0] || ''
                          }
                          onChangeText={setEditDraftSocialType}
                        />
                      )}
                    </View>
                  );
                }

                const isJamat = isJamatCol(col.id, col.label);
                return (
                  <View key={col.id} style={styles.editModalField}>
                    <Text style={styles.editModalLabel}>
                      {col.label} {isJamat ? '(১-৫)' : ''}
                    </Text>
                    <TextInput
                      style={styles.formInput}
                      keyboardType={col.type === 'number' ? 'numeric' : 'default'}
                      value={
                        val !== null && val !== undefined ? String(val) : ''
                      }
                      onChangeText={(txt) => {
                        if (col.type === 'number') {
                          const cleaned = txt.replace(/[^0-9]/g, '');
                          if (cleaned === '') {
                            setEditDraftValues((prev) => ({
                              ...prev,
                              [col.id]: null,
                            }));
                            return;
                          }
                          let num = Number(cleaned);
                          if (isJamat) num = Math.min(5, num);
                          setEditDraftValues((prev) => ({
                            ...prev,
                            [col.id]: num,
                          }));
                        } else {
                          setEditDraftValues((prev) => ({
                            ...prev,
                            [col.id]: txt,
                          }));
                        }
                      }}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1 }]}
                onPress={() => setEditingDay(null)}
              >
                <Text style={styles.modalCloseBtnText}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCloseBtn,
                  { flex: 1, backgroundColor: '#2E7D32' },
                ]}
                onPress={handleSaveEditRow}
              >
                <Text style={[styles.modalCloseBtnText, { color: '#FFF' }]}>
                  সেভ করুন
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F7FA',
  },
  loadingText: { fontSize: 16, color: '#555' },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B5E20',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  primaryAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  primaryAddButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

  monthSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 14,
  },
  monthArrowBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  monthSwitcherLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 120,
    textAlign: 'center',
  },

  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerArrowBtn: {
    padding: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 15.5, fontWeight: '700', color: '#1A1A1A' },
  headerSub: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 3,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sharePdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1565C0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 4,
  },
  sharePdfBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  threeDotBtn: {
    padding: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },

  mainScroll: { flex: 1 },
  tableWrapper: {
    margin: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#263238',
  },
  cellHeader: {
    width: 115,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#37474F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCellText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
    backgroundColor: '#FFF',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  cell: {
    width: 115,
    minHeight: 42,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#ECEFF1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateColWidth: { width: 55 },
  socialColWidth: { width: 135 },
  commentColWidth: { width: 160 },
  actionColWidth: { width: 76 },

  dateText: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  checkboxBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#F1F3F4',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2E7D32',
  },
  falseText: { fontSize: 11, color: '#9E9E9E', fontWeight: '600' },

  socialSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 5,
    gap: 4,
    maxWidth: '100%',
  },
  socialSelectedText: { fontSize: 12, color: '#1B5E20', fontWeight: '600' },

  numberInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 13,
    color: '#1A1A1A',
    paddingVertical: 4,
  },
  textInput: {
    width: '100%',
    fontSize: 12,
    color: '#1A1A1A',
    paddingVertical: 4,
  },
  rowEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  rowEditBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1565C0',
  },

  tableFooterRow: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderTopWidth: 2,
    borderTopColor: '#2E7D32',
  },
  cellFooter: {
    width: 115,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#C8E6C9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerCellText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1B5E20',
  },

  listSection: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  targetCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  targetCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#263238',
    marginBottom: 10,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#FAFAFA',
    color: '#1A1A1A',
  },
  datePickerTriggerText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  datePickerTriggerFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  tablePlusActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  tablePlusBtn: {
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    width: 38,
    height: 38,
    borderRadius: 8,
  },

  borderedTable: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  subTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#334155',
  },
  subTh: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#475569',
    textAlign: 'center',
  },
  subTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  subTd: {
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  subTdCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  serialCell: { width: 64, textAlign: 'center' },
  nameCell: { width: 170 },
  kormiNameCell: { width: 230 },
  dateCell: { width: 118, textAlign: 'center' },
  deleteColCell: { width: 84 },

  rowDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rowDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  emptyListHint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
    width: 360,
  },

  bottomOptionsBar: {
    marginHorizontal: 12,
    marginTop: 14,
    alignItems: 'center',
  },
  bottomDotTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  bottomDotTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#263238',
  },

  menuRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  menuRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },

  toggleSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusBadgeTextActive: {
    color: '#1B5E20',
  },
  statusBadgeTextInactive: {
    color: '#334155',
  },

  pickerColumns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  pickerCol: {
    flex: 1,
  },
  pickerColLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 4,
  },
  pickerScroll: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
  },
  pickerOption: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickerOptionSelected: {
    backgroundColor: '#1565C0',
  },
  pickerOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  pickerOptionTextSelected: {
    color: '#FFFFFF',
  },

  editModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  editModalField: {
    marginVertical: 6,
    gap: 5,
  },
  editModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  modalSub: { fontSize: 13, color: '#666', marginBottom: 12 },
  religionOptionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  religionOptionText: { fontSize: 15, color: '#212121', fontWeight: '500' },
  modalCloseBtn: {
    marginTop: 12,
    backgroundColor: '#ECEFF1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: '#37474F' },
});