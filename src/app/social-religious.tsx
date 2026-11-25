import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { saveLocalData } from '../utils/firebaseSync';
// আপনার প্রজেক্টের Firebase কনফিগ অনুযায়ী নিচের ইমপোর্টটি অ্যাডজাস্ট করে নেবেন
// import { db, auth } from '../firebaseConfig';
// import { doc, setDoc, getDoc } from 'firebase/firestore';

import {
  RELIGION_OPTIONS,
  ReligionType,
  SOCIAL_WORK_OPTIONS,
  SocialReligiousSheetData,
  createInitialEntries,
  getColumnsForReligion,
} from '../constants/socialReligiousConfig';

interface Props {
  selectedMonthKey?: string; // যেমন: "2026-11"
  userId?: string | null; // Guest হলে null, লগইন থাকলে uid
}

export default function SocialReligiousPage({
  selectedMonthKey = '2026-11',
  userId = null,
}: Props) {
  const [sheetData, setSheetData] = useState<SocialReligiousSheetData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);

  // Modals State
  const [religionModalVisible, setReligionModalVisible] = useState(false);
  const [addColumnModalVisible, setAddColumnModalVisible] = useState(false);
  const [socialDropdownModal, setSocialDropdownModal] = useState<{
    visible: boolean;
    day: number | null;
  }>({
    visible: false,
    day: null,
  });

  // Hidden Lists Input States
  const [dawatiName, setDawatiName] = useState('');
  const [dawatiAddedDate, setDawatiAddedDate] = useState('');
  const [dawatiContactDate, setDawatiContactDate] = useState('');
  const [kormiName, setKormiName] = useState('');

  const storageKey = `@MyBudgetApp_SocialReligious_${userId || 'guest'}_${selectedMonthKey}`;

  // ১. ডাটা লোড করা (saveLocalData / AsyncStorage + Firebase Sync)
  const loadSheetData = useCallback(
    async (isMountedRef?: { current: boolean }) => {
      try {
        if (!isMountedRef || isMountedRef.current) {
          setLoading(true);
        }
        const localData = await AsyncStorage.getItem(storageKey);
        if (isMountedRef && !isMountedRef.current) return;

        if (localData) {
          setSheetData(JSON.parse(localData) as SocialReligiousSheetData);
        } else {
          setSheetData(null);
        }

        // Firebase থেকে সিঙ্ক করার লজিক (ইউজার লগইন থাকলে)
        /*
        if (userId) {
          const docRef = doc(db, 'users', userId, 'socialReligious', selectedMonthKey);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const cloudData = docSnap.data() as SocialReligiousSheetData;
            if (!isMountedRef || isMountedRef.current) {
              setSheetData(cloudData);
            }
            await saveLocalData(storageKey, cloudData);
          }
        }
        */
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

  // ২. ডাটা সেভ করা (saveLocalData + Firebase)
  const saveSheetData = useCallback(
    async (updatedData: SocialReligiousSheetData | null) => {
      try {
        setSheetData(updatedData);
        if (updatedData === null) {
          await AsyncStorage.removeItem(storageKey);
        } else {
          await saveLocalData(storageKey, updatedData);
          /*
          if (userId) {
            const docRef = doc(db, 'users', userId, 'socialReligious', selectedMonthKey);
            await setDoc(docRef, updatedData, { merge: true });
          }
          */
        }
      } catch (error) {
        console.error('Error saving social-religious data:', error);
      }
    },
    [storageKey]
  );

  // ৩. ধর্ম নির্বাচন করে নতুন শিট তৈরি করা
  const handleSelectReligion = (religion: ReligionType) => {
    const [yearStr, monthStr] = selectedMonthKey.split('-');
    const daysInMonth =
      new Date(Number(yearStr), Number(monthStr), 0).getDate() || 30;
    const cols = getColumnsForReligion(religion);
    const entries = createInitialEntries(daysInMonth, cols);

    const newSheet: SocialReligiousSheetData = {
      monthKey: selectedMonthKey,
      religion,
      columns: cols,
      entries,
      isDawatiListVisible: false,
      dawatiTargets: [],
      isKormiListVisible: false,
      kormiTargets: [],
    };

    void saveSheetData(newSheet);
    setReligionModalVisible(false);
  };

  // ৪. মাঝখানের অপশনাল কলাম অ্যাড করা (Strict Serial Order বজায় রেখে)
  const handleEnableColumn = (colId: string) => {
    if (!sheetData) return;
    const updatedCols = sheetData.columns
      .map((col) => (col.id === colId ? { ...col, isEnabled: true } : col))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    void saveSheetData({ ...sheetData, columns: updatedCols });
  };

  // ৫. ডেইলি সেল আপডেট (Checkbox, Number, Text)
  const handleUpdateCell = (
    day: number,
    colId: string,
    value: boolean | number | string | null
  ) => {
    if (!sheetData) return;
    const updatedEntries = sheetData.entries.map((entry) => {
      if (entry.day === day) {
        return {
          ...entry,
          values: {
            ...entry.values,
            [colId]: value,
          },
        };
      }
      return entry;
    });
    void saveSheetData({ ...sheetData, entries: updatedEntries });
  };

  // ৬. সামাজিক কাজ ড্রপডাউন সিলেক্ট করা
  const handleSelectSocialWork = (workName: string | null) => {
    if (!sheetData || socialDropdownModal.day === null) return;
    const targetDay = socialDropdownModal.day;

    const updatedEntries = sheetData.entries.map((entry) => {
      if (entry.day === targetDay) {
        return {
          ...entry,
          socialWorkType: workName || undefined,
          values: {
            ...entry.values,
            social_work: Boolean(workName),
          },
        };
      }
      return entry;
    });

    void saveSheetData({ ...sheetData, entries: updatedEntries });
    setSocialDropdownModal({ visible: false, day: null });
  };

  // ৭. দাওয়াতি টার্গেট যোগ করা
  const handleAddDawatiTarget = () => {
    if (!sheetData || !dawatiName.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে টার্গেটের নাম লিখুন।');
      return;
    }
    const newTarget = {
      id: Date.now().toString(),
      serial: sheetData.dawatiTargets.length + 1,
      name: dawatiName.trim(),
      targetAddedDate:
        dawatiAddedDate.trim() || new Date().toISOString().split('T')[0],
      lastContactDate:
        dawatiContactDate.trim() || new Date().toISOString().split('T')[0],
    };
    void saveSheetData({
      ...sheetData,
      dawatiTargets: [...sheetData.dawatiTargets, newTarget],
    });
    setDawatiName('');
    setDawatiAddedDate('');
    setDawatiContactDate('');
  };

  // ৮. কর্মী টার্গেট যোগ করা
  const handleAddKormiTarget = () => {
    if (!sheetData || !kormiName.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে কর্মী টার্গেটের নাম লিখুন।');
      return;
    }
    const newTarget = {
      id: Date.now().toString(),
      serial: sheetData.kormiTargets.length + 1,
      name: kormiName.trim(),
    };
    void saveSheetData({
      ...sheetData,
      kormiTargets: [...sheetData.kormiTargets, newTarget],
    });
    setKormiName('');
  };

  // ৯. শিট রিসেট / ডিলিট সেফগার্ড
  const handleResetSheet = () => {
    Alert.alert(
      'শিট মুছে ফেলবেন?',
      'আপনি কি নিশ্চিতভাবে এই মাসের সামাজিক ও ধর্মীয় শিটটি মুছে ফেলতে চান? সকল ডাটা মুছে যাবে।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'মুছে ফেলুন',
          style: 'destructive',
          onPress: () => {
            void saveSheetData(null);
          },
        },
      ]
    );
  };

  // অ্যাক্টিভ কলামসমূহ (সবসময় orderIndex অনুযায়ী সাজানো)
  const activeColumns = useMemo(() => {
    if (!sheetData) return [];
    return sheetData.columns
      .filter((col) => col.isEnabled)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [sheetData]);

  // যেসব কলাম এখনো অ্যাড করা হয়নি (সিরিয়াল ৩-৯)
  const availableOptionalColumns = useMemo(() => {
    if (!sheetData) return [];
    return sheetData.columns
      .filter((col) => !col.isEnabled)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [sheetData]);

  // মাসিক যোগফল হিসাব (Monthly Totals)
  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number | string> = {};
    if (!sheetData) return totals;

    activeColumns.forEach((col) => {
      if (col.type === 'date') {
        totals[col.id] = 'মোট';
      } else if (col.type === 'checkbox' || col.type === 'social_dropdown') {
        const count = sheetData.entries.filter(
          (e) => e.values[col.id] === true
        ).length;
        totals[col.id] = `${count} দিন`;
      } else if (col.type === 'number') {
        const sum = sheetData.entries.reduce((acc, e) => {
          const val = Number(e.values[col.id]);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>লোড হচ্ছে...</Text>
      </View>
    );
  }

  // ==========================================
  // EMPTY STATE (Blank Page with Add Button)
  // ==========================================
  if (!sheetData) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Ionicons name="book-outline" size={64} color="#2E7D32" />
        <Text style={styles.emptyTitle}>সামাজিক ও ধর্মীয় রিপোর্ট</Text>
        <Text style={styles.emptySubtitle}>
          এই মাসের রিপোর্ট শুরু করতে নিচের বাটনে ক্লিক করে আপনার ধর্ম নির্বাচন করুন।
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

  // ==========================================
  // ACTIVE SHEET STATE
  // ==========================================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>
            সামাজিক ও ধর্মীয় ({selectedMonthKey})
          </Text>
          <Text style={styles.headerSub}>{currentReligionConfig?.label}</Text>
        </View>
        <View style={styles.headerActions}>
          {availableOptionalColumns.length > 0 && (
            <TouchableOpacity
              style={styles.addColBtn}
              onPress={() => setAddColumnModalVisible(true)}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.addColBtnText}>কলাম যোগ করুন</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.deleteIconBtn}
            onPress={handleResetSheet}
          >
            <Ionicons name="trash-outline" size={20} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
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
                  const cellVal = entry.values[col.id];

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
                    return (
                      <View key={col.id} style={styles.cell}>
                        <TextInput
                          style={styles.numberInput}
                          keyboardType="numeric"
                          placeholder="-"
                          value={
                            cellVal !== null && cellVal !== undefined
                              ? String(cellVal)
                              : ''
                          }
                          onChangeText={(txt) => {
                            const num =
                              txt.trim() === '' ? null : Number(txt);
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
            </View>
          </View>
        </ScrollView>

        {/* Hidden List 1: Dawati / Prochar Target List */}
        <View style={styles.listSection}>
          {!sheetData.isDawatiListVisible ? (
            <TouchableOpacity
              style={styles.revealListBtn}
              onPress={() => {
                void saveSheetData({ ...sheetData, isDawatiListVisible: true });
              }}
            >
              <Ionicons name="add-circle" size={20} color="#1565C0" />
              <Text style={styles.revealListBtnText}>
                + {currentReligionConfig?.dawatiListTitle} যোগ করুন
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.targetCard}>
              <View style={styles.targetCardHeader}>
                <Text style={styles.targetCardTitle}>
                  {currentReligionConfig?.dawatiListTitle}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    void saveSheetData({
                      ...sheetData,
                      isDawatiListVisible: false,
                    });
                  }}
                >
                  <Text style={styles.hideText}>লুকান (Hide)</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.targetFormRow}>
                <TextInput
                  style={[styles.formInput, { flex: 2 }]}
                  placeholder="টার্গেটের নাম"
                  value={dawatiName}
                  onChangeText={setDawatiName}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1.5 }]}
                  placeholder="টার্গেট তারিখ (YYYY-MM-DD)"
                  value={dawatiAddedDate}
                  onChangeText={setDawatiAddedDate}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1.5 }]}
                  placeholder="যোগাযোগ তারিখ"
                  value={dawatiContactDate}
                  onChangeText={setDawatiContactDate}
                />
                <TouchableOpacity
                  style={styles.miniAddBtn}
                  onPress={handleAddDawatiTarget}
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.subTableHeader}>
                <Text style={[styles.subTh, { width: 45 }]}>ক্রমিক</Text>
                <Text style={[styles.subTh, { flex: 2 }]}>
                  দাওয়াতি টার্গেট (নাম)
                </Text>
                <Text style={[styles.subTh, { flex: 1.3 }]}>
                  টার্গেটভুক্ত তারিখ
                </Text>
                <Text style={[styles.subTh, { flex: 1.3 }]}>
                  যোগাযোগের তারিখ
                </Text>
              </View>
              {sheetData.dawatiTargets.length === 0 ? (
                <Text style={styles.emptyListHint}>
                  এখনো কোনো টার্গেট যোগ করা হয়নি।
                </Text>
              ) : (
                sheetData.dawatiTargets.map((item) => (
                  <View key={item.id} style={styles.subTableRow}>
                    <Text style={[styles.subTd, { width: 45 }]}>
                      {item.serial}
                    </Text>
                    <Text style={[styles.subTd, { flex: 2, fontWeight: '600' }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.subTd, { flex: 1.3 }]}>
                      {item.targetAddedDate}
                    </Text>
                    <Text style={[styles.subTd, { flex: 1.3 }]}>
                      {item.lastContactDate}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Hidden List 2: Kormi / Member Target List */}
        <View style={styles.listSection}>
          {!sheetData.isKormiListVisible ? (
            <TouchableOpacity
              style={styles.revealListBtn}
              onPress={() => {
                void saveSheetData({ ...sheetData, isKormiListVisible: true });
              }}
            >
              <Ionicons name="add-circle" size={20} color="#2E7D32" />
              <Text style={[styles.revealListBtnText, { color: '#2E7D32' }]}>
                + {currentReligionConfig?.kormiListTitle} যোগ করুন
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.targetCard}>
              <View style={styles.targetCardHeader}>
                <Text style={styles.targetCardTitle}>
                  {currentReligionConfig?.kormiListTitle}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    void saveSheetData({
                      ...sheetData,
                      isKormiListVisible: false,
                    });
                  }}
                >
                  <Text style={styles.hideText}>লুকান (Hide)</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.targetFormRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="কর্মী টার্গেটের নাম লিখুন"
                  value={kormiName}
                  onChangeText={setKormiName}
                />
                <TouchableOpacity
                  style={[styles.miniAddBtn, { backgroundColor: '#2E7D32' }]}
                  onPress={handleAddKormiTarget}
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.subTableHeader}>
                <Text style={[styles.subTh, { width: 60 }]}>সিরিয়াল</Text>
                <Text style={[styles.subTh, { flex: 1 }]}>
                  কর্মী টার্গেটের নাম
                </Text>
              </View>
              {sheetData.kormiTargets.length === 0 ? (
                <Text style={styles.emptyListHint}>
                  এখনো কোনো কর্মী টার্গেট যোগ করা হয়নি।
                </Text>
              ) : (
                sheetData.kormiTargets.map((item) => (
                  <View key={item.id} style={styles.subTableRow}>
                    <Text style={[styles.subTd, { width: 60 }]}>
                      {item.serial}
                    </Text>
                    <Text style={[styles.subTd, { flex: 1, fontWeight: '600' }]}>
                      {item.name}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal 1: Add Optional Columns */}
      <Modal visible={addColumnModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>নতুন কলাম যুক্ত করুন</Text>
            <Text style={styles.modalSub}>
              যে কলামটি যোগ করবেন সেটি টেবিলের নির্ধারিত সিরিয়াল অনুযায়ী বসবে:
            </Text>
            {availableOptionalColumns.map((col) => (
              <TouchableOpacity
                key={col.id}
                style={styles.religionOptionBtn}
                onPress={() => handleEnableColumn(col.id)}
              >
                <Text style={styles.religionOptionText}>
                  {col.orderIndex}. {col.label}
                </Text>
                <Ionicons name="add-circle" size={22} color="#2E7D32" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setAddColumnModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>সম্পন্ন (Done)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Social Work Dropdown Selector */}
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
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  primaryAddButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

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
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  headerSub: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addColBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1565C0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 4,
  },
  addColBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  deleteIconBtn: {
    padding: 7,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
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
    marginTop: 10,
  },
  revealListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#90CAF9',
    gap: 6,
  },
  revealListBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
  },
  targetCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  targetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  targetCardTitle: { fontSize: 15, fontWeight: '700', color: '#263238' },
  hideText: { fontSize: 12, color: '#D32F2F', fontWeight: '600' },
  targetFormRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    backgroundColor: '#FAFAFA',
  },
  miniAddBtn: {
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  subTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#ECEFF1',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  subTh: { fontSize: 12, fontWeight: '700', color: '#37474F' },
  subTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  subTd: { fontSize: 12, color: '#212121' },
  emptyListHint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
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