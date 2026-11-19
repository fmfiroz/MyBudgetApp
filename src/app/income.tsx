import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type ItemType = 'income' | 'deduction';

interface IncomeRow {
  id: string;
  description: string;
  type: ItemType;
  formulaPercentOfBasic?: number; // যেমন: 50 দিলে Basic-এর 50% অটো হিসাব হবে
  values: { [month: string]: string };
}

const DEFAULT_ROWS: IncomeRow[] = [
  {
    id: '1',
    description: 'Basic',
    type: 'income',
    values: { January: '15000' },
  },
  {
    id: '2',
    description: 'Home Rent (50% of basic)',
    type: 'income',
    formulaPercentOfBasic: 50,
    values: {},
  },
  {
    id: '3',
    description: 'Medical Allowance',
    type: 'income',
    values: { January: '1500' },
  },
  {
    id: '4',
    description: 'Provident Fund / Deduction',
    type: 'deduction',
    values: { January: '1000' },
  },
];

export default function IncomeSheetScreen() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [rows, setRows] = useState<IncomeRow[]>(DEFAULT_ROWS);

  // নতুন খাত যোগ করার Modal স্টেট
  const [modalVisible, setModalVisible] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<ItemType>('income');
  const [useBasicPercent, setUseBasicPercent] = useState(false);
  const [percentValue, setPercentValue] = useState('');

  const storageKey = `@income_sheet_${selectedYear}`;

  // ডেটা লোড করা
  useEffect(() => {
    const loadData = async () => {
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) {
          setRows(JSON.parse(saved));
        } else {
          setRows(DEFAULT_ROWS);
        }
      } catch (e) {
        console.log('Failed to load income sheet:', e);
      }
    };
    loadData();
  }, [selectedYear]);

  // ডেটা সেভ করা
  const saveRows = async (updatedRows: IncomeRow[]) => {
    setRows(updatedRows);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(updatedRows));
    } catch (e) {
      console.log('Failed to save income sheet:', e);
    }
  };

  // কোনো সেলের মান আপডেট করা
  const handleCellChange = (rowId: string, month: string, text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const updated = rows.map((row) => {
      if (row.id === rowId) {
        return {
          ...row,
          values: {
            ...row.values,
            [month]: cleaned,
          },
        };
      }
      return row;
    });
    saveRows(updated);
  };

  // নির্দিষ্ট মাসের Basic অ্যামাউন্ট বের করা
  const getBasicAmountForMonth = (month: string): number => {
    const basicRow = rows.find(
      (r) => r.description.trim().toLowerCase() === 'basic' && r.type === 'income'
    );
    if (!basicRow) return 0;
    return parseFloat(basicRow.values[month] || '0') || 0;
  };

  // প্রতিটি সেলের চূড়ান্ত সংখ্যাসূচক মান (Formula থাকলে অটো হিসাব হবে)
  const getResolvedValue = (row: IncomeRow, month: string): number => {
    if (row.formulaPercentOfBasic !== undefined) {
      const basic = getBasicAmountForMonth(month);
      return (basic * row.formulaPercentOfBasic) / 100;
    }
    return parseFloat(row.values[month] || '0') || 0;
  };

  // প্রতি মাসের Total Income, Total Deduction এবং Net Income হিসাব
  const monthlySummary = useMemo(() => {
    const summary: {
      [month: string]: { totalIncome: number; totalDeduction: number; netIncome: number };
    } = {};

    MONTHS.forEach((month) => {
      let totalIncome = 0;
      let totalDeduction = 0;

      rows.forEach((row) => {
        const val = getResolvedValue(row, month);
        if (row.type === 'income') {
          totalIncome += val;
        } else {
          totalDeduction += val;
        }
      });

      summary[month] = {
        totalIncome,
        totalDeduction,
        netIncome: totalIncome - totalDeduction,
      };
    });

    return summary;
  }, [rows]);

  // নতুন খাত (Row) যোগ করা
  const handleAddRow = () => {
    if (!newDesc.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে খাতের বিবরণ (Description) লিখুন।');
      return;
    }

    const percentNum = parseFloat(percentValue);
    const isFormulaValid = useBasicPercent && !isNaN(percentNum) && percentNum > 0;

    const finalTitle = isFormulaValid
      ? `${newDesc.trim()} (${percentNum}% of basic)`
      : newDesc.trim();

    const newRow: IncomeRow = {
      id: Date.now().toString(),
      description: finalTitle,
      type: newType,
      ...(isFormulaValid ? { formulaPercentOfBasic: percentNum } : {}),
      values: {},
    };

    saveRows([...rows, newRow]);
    setNewDesc('');
    setPercentValue('');
    setUseBasicPercent(false);
    setModalVisible(false);
  };

  // খাত (Row) ডিলিট করা
  const handleDeleteRow = (row: IncomeRow) => {
    Alert.alert(
      'খাত মুছে ফেলুন',
      `আপনি কি "${row.description}" সারিটি মুছে ফেলতে চান?`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'মুছুন',
          style: 'destructive',
          onPress: () => {
            saveRows(rows.filter((r) => r.id !== row.id));
          },
        },
      ]
    );
  };

  const incomeRows = rows.filter((r) => r.type === 'income');
  const deductionRows = rows.filter((r) => r.type === 'deduction');

  // সেলের ইনপুট বা অটো-ক্যালকুলেটেড মান রেন্ডার করার ফাংশন
  const renderMonthCells = (row: IncomeRow) => {
    return MONTHS.map((month) => {
      const isFormula = row.formulaPercentOfBasic !== undefined;
      const computedVal = getResolvedValue(row, month);

      return (
        <View
          key={month}
          style={[
            styles.cell,
            styles.monthColWidth,
            isFormula && styles.formulaCellBg,
          ]}
        >
          {isFormula ? (
            <Text style={styles.formulaText}>
              {computedVal > 0 ? computedVal.toLocaleString('en-IN') : '0'}
            </Text>
          ) : (
            <TextInput
              style={styles.cellInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#94A3B8"
              value={row.values[month] || ''}
              onChangeText={(text) => handleCellChange(row.id, month, text)}
            />
          )}
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Income Sheet</Text>
          <Text style={styles.headerSub}>Excel Style Monthly Income & Deduction</Text>
        </View>

        {/* Year Selector */}
        <View style={styles.yearBox}>
          <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)}>
            <Ionicons name="chevron-back" size={18} color="#2563EB" />
          </TouchableOpacity>
          <Text style={styles.yearText}>{selectedYear}</Text>
          <TouchableOpacity onPress={() => setSelectedYear((y) => y + 1)}>
            <Ionicons name="chevron-forward" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#16A34A' }]}
          onPress={() => {
            setNewType('income');
            setModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>+ Add Income</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#DC2626' }]}
          onPress={() => {
            setNewType('deduction');
            setModalVisible(true);
          }}
        >
          <Ionicons name="remove-circle-outline" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>+ Add Deduction</Text>
        </TouchableOpacity>
      </View>

      {/* Excel Grid Area */}
      <ScrollView style={styles.verticalScroll}>
        <View style={styles.sheetWrapper}>
          {/* Left Fixed Column (Income Description / খাত) */}
          <View style={styles.fixedColumn}>
            {/* Header */}
            <View style={[styles.headerCell, styles.descColWidth]}>
              <Text style={styles.headerCellText}>Income / Deduction খাত</Text>
            </View>

            {/* Section: Income */}
            <View style={[styles.sectionBanner, styles.descColWidth]}>
              <Text style={styles.sectionBannerText}>INCOME ITEMS (+)</Text>
            </View>

            {incomeRows.map((row) => (
              <View key={row.id} style={[styles.descCell, styles.descColWidth]}>
                <Text style={styles.descText} numberOfLines={2}>
                  {row.description}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteRow(row)}>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Total Income Row Title */}
            <View style={[styles.summaryCell, styles.totalIncomeBg, styles.descColWidth]}>
              <Text style={styles.summaryTitle}>Total Income</Text>
            </View>

            {/* Section: Deduction */}
            <View style={[styles.sectionBanner, styles.descColWidth]}>
              <Text style={[styles.sectionBannerText, { color: '#B91C1C' }]}>
                DEDUCTIONS (-)
              </Text>
            </View>

            {deductionRows.map((row) => (
              <View key={row.id} style={[styles.descCell, styles.descColWidth]}>
                <Text style={styles.descText} numberOfLines={2}>
                  {row.description}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteRow(row)}>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Total Deduction Row Title */}
            <View style={[styles.summaryCell, styles.totalDeductionBg, styles.descColWidth]}>
              <Text style={styles.summaryTitle}>Total Deduction</Text>
            </View>

            {/* Net Income Row Title */}
            <View style={[styles.summaryCell, styles.netIncomeBg, styles.descColWidth]}>
              <Text style={[styles.summaryTitle, { color: '#1D4ED8' }]}>Net Income</Text>
            </View>
          </View>

          {/* Right Scrollable Columns (January to December) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              {/* Month Headers */}
              <View style={styles.row}>
                {MONTHS.map((month) => (
                  <View key={month} style={[styles.headerCell, styles.monthColWidth]}>
                    <Text style={styles.headerCellText}>{month}</Text>
                  </View>
                ))}
              </View>

              {/* Income Banner Spacer */}
              <View style={styles.row}>
                {MONTHS.map((m) => (
                  <View key={m} style={[styles.sectionBanner, styles.monthColWidth]} />
                ))}
              </View>

              {/* Income Data Rows */}
              {incomeRows.map((row) => (
                <View key={row.id} style={styles.row}>
                  {renderMonthCells(row)}
                </View>
              ))}

              {/* Total Income Values */}
              <View style={styles.row}>
                {MONTHS.map((month) => (
                  <View
                    key={month}
                    style={[styles.summaryCell, styles.totalIncomeBg, styles.monthColWidth]}
                  >
                    <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                      {monthlySummary[month].totalIncome.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Deduction Banner Spacer */}
              <View style={styles.row}>
                {MONTHS.map((m) => (
                  <View key={m} style={[styles.sectionBanner, styles.monthColWidth]} />
                ))}
              </View>

              {/* Deduction Data Rows */}
              {deductionRows.map((row) => (
                <View key={row.id} style={styles.row}>
                  {renderMonthCells(row)}
                </View>
              ))}

              {/* Total Deduction Values */}
              <View style={styles.row}>
                {MONTHS.map((month) => (
                  <View
                    key={month}
                    style={[styles.summaryCell, styles.totalDeductionBg, styles.monthColWidth]}
                  >
                    <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>
                      {monthlySummary[month].totalDeduction.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Net Income Values */}
              <View style={styles.row}>
                {MONTHS.map((month) => (
                  <View
                    key={month}
                    style={[styles.summaryCell, styles.netIncomeBg, styles.monthColWidth]}
                  >
                    <Text style={[styles.summaryValue, { color: '#1D4ED8' }]}>
                      {monthlySummary[month].netIncome.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Add New Item Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {newType === 'income' ? 'নতুন Income খাত যোগ করুন' : 'নতুন Deduction খাত যোগ করুন'}
            </Text>

            <Text style={styles.inputLabel}>খাতের বিবরণ (Description)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="যেমন: Basic, Home Rent, Conveyance, Tax..."
              value={newDesc}
              onChangeText={setNewDesc}
            />

            {/* Basic-এর শতকরা হার (Formula) অপশন */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setUseBasicPercent(!useBasicPercent)}
            >
              <Ionicons
                name={useBasicPercent ? 'checkbox' : 'square-outline'}
                size={22}
                color="#2563EB"
              />
              <Text style={styles.checkboxLabel}>
                Basic-এর শতকরা (%) হিসেবে অটো হিসাব হবে (যেমন: 50% of basic)
              </Text>
            </TouchableOpacity>

            {useBasicPercent && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>শতকরা হার লিখুন (%)</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  placeholder="যেমন: 50"
                  value={percentValue}
                  onChangeText={setPercentValue}
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleAddRow}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>যোগ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
  },
  yearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  yearText: {
    fontWeight: '700',
    color: '#1E40AF',
    fontSize: 14,
  },
  actionBar: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  verticalScroll: {
    flex: 1,
  },
  sheetWrapper: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },
  fixedColumn: {
    borderRightWidth: 2,
    borderRightColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  row: {
    flexDirection: 'row',
  },
  descColWidth: {
    width: 175,
  },
  monthColWidth: {
    width: 105,
  },
  headerCell: {
    height: 42,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    paddingHorizontal: 6,
  },
  headerCellText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  sectionBanner: {
    height: 28,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  sectionBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  descCell: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  descText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    marginRight: 4,
  },
  cell: {
    height: 46,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
  },
  formulaCellBg: {
    backgroundColor: '#F0FDF4',
  },
  formulaText: {
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  cellInput: {
    textAlign: 'right',
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 4,
  },
  summaryCell: {
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#94A3B8',
  },
  totalIncomeBg: {
    backgroundColor: '#DCFCE7',
  },
  totalDeductionBg: {
    backgroundColor: '#FEE2E2',
  },
  netIncomeBg: {
    backgroundColor: '#DBEAFE',
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    color: '#0F172A',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});