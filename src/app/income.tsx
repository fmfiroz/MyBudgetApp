import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';

// Income Year: July থেকে Next Year June পর্যন্ত ১২ মাস
const FISCAL_MONTHS = [
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
];

const SECOND_HALF_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June'];

type ItemType = 'income' | 'deduction';
type CellMode = 'fixed' | 'percent';

interface CellConfig {
  mode: CellMode;
  value: number;
}

interface IncomeRow {
  id: string;
  description: string;
  type: ItemType;
  isBasic?: boolean;
  hidden?: boolean;
  cells: { [month: string]: CellConfig };
}

const parseNumericValue = (val: unknown): number => {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatFiscalYearLabel = (startYear: number) => {
  const nextTwoDigits = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${nextTwoDigits}`;
};

const getMonthCalendarYear = (month: string, startYear: number) => {
  const idx = FISCAL_MONTHS.indexOf(month);
  return idx >= 0 && idx <= 5 ? startYear : startYear + 1;
};

const getCurrentFiscalMonthName = (): string => {
  const jsMonth = new Date().getMonth(); // 0=Jan ... 11=Dec
  const monthNames = [
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
  return monthNames[jsMonth] || 'July';
};

const buildDefaultCells = (mode: CellMode, val: number): { [month: string]: CellConfig } => {
  const obj: { [month: string]: CellConfig } = {};
  FISCAL_MONTHS.forEach((m) => {
    obj[m] = { mode, value: parseNumericValue(val) };
  });
  return obj;
};

const DEFAULT_ROWS: IncomeRow[] = [
  {
    id: 'row-incentives',
    description: 'Incentives',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-eid-bonus',
    description: 'Eid Bonus',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-boishakhi-vata',
    description: 'Boishakhi Vata',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-net-basic',
    description: 'Net Basic',
    type: 'income',
    isBasic: true,
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-house-rent',
    description: 'House Rent',
    type: 'income',
    cells: buildDefaultCells('percent', 50),
  },
  {
    id: 'row-medical-allow',
    description: 'Medical Allow.',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-education-allow',
    description: 'Education Allow.',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-incentive-allow',
    description: 'Incentive Allow.',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-tiffin-allow',
    description: 'Tiffin Allow.',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-pf-inst-contrib',
    description: 'P.F (Institutional Contribution)',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-bishes-vata',
    description: 'Bishes Vata',
    type: 'income',
    cells: buildDefaultCells('fixed', 0),
  },

  // Deductions
  {
    id: 'row-pf-self-inst',
    description: 'P.F (Self+Institute Contribution)',
    type: 'deduction',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-family-security',
    description: 'Family Security Subs.',
    type: 'deduction',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-welfare-fund',
    description: 'Welfare Fund',
    type: 'deduction',
    cells: buildDefaultCells('fixed', 0),
  },
  {
    id: 'row-stamp',
    description: 'Stamp',
    type: 'deduction',
    cells: buildDefaultCells('fixed', 0),
  },
];

const mergeAndNormalizeRows = (savedRows: any[]): IncomeRow[] => {
  const mapById = new Map<string, IncomeRow>();

  if (Array.isArray(savedRows)) {
    savedRows.forEach((r) => {
      if (!r || !r.id) return;
      const { isOneTime, oneTimeMonth, ...cleanRow } = r;
      const normalizedCells: { [month: string]: CellConfig } = {};
      FISCAL_MONTHS.forEach((m) => {
        const rawCell = cleanRow.cells?.[m];
        const mode: CellMode = rawCell?.mode === 'percent' ? 'percent' : 'fixed';
        normalizedCells[m] = {
          mode,
          value: parseNumericValue(rawCell?.value),
        };
      });
      mapById.set(cleanRow.id, {
        ...cleanRow,
        type: cleanRow.type === 'deduction' ? 'deduction' : 'income',
        hidden: Boolean(cleanRow.hidden),
        cells: normalizedCells,
      });
    });
  }

  const merged: IncomeRow[] = Array.from(mapById.values());
  DEFAULT_ROWS.forEach((def) => {
    if (!mapById.has(def.id)) {
      merged.push(def);
    }
  });
  return merged;
};

export default function IncomeSheetScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  // নিখুঁত গ্রিড সিস্টেম:
  // ডান পাশের দৃশ্যমান প্রস্থকে ঠিক ২টি সমান মাস কলামে ভাগ করা হয়েছে,
  // যাতে স্লাইড করার পর প্রতিটি মাস গ্রিড লাইনের সাথে পুরোপুরি ফিট হয়ে বসে (ডানে/বামে কাটা অংশ না থাকে)।
  const isMobileScreen = screenWidth < 768;
  const visibleColumnsCount = isMobileScreen ? 2 : Math.max(4, Math.floor((screenWidth - 215) / 114));
  const rawRightWidth = Math.max(200, Math.floor(screenWidth - (isMobileScreen ? 136 : 215)));
  const monthColWidth = Math.floor(rawRightWidth / visibleColumnsCount);
  const exactRightViewportWidth = monthColWidth * visibleColumnsCount;
  const descColWidth = Math.max(120, Math.floor(screenWidth) - exactRightViewportWidth);

  // প্রতিটি মাস কলামের শুরু অফসেট (Grid Snap Points)
  const gridSnapOffsets = useMemo(() => {
    const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
    const offsets: number[] = [];
    for (let i = 0; i <= maxStartIndex; i++) {
      offsets.push(i * monthColWidth);
    }
    return offsets;
  }, [monthColWidth, visibleColumnsCount]);

  const monthScrollRef = useRef<ScrollView | null>(null);
  const initialScrollDoneRef = useRef<boolean>(false);
  const [activeGridIndex, setActiveGridIndex] = useState<number>(0);

  const getInitialFiscalStartYear = () => {
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const [fiscalStartYear, setFiscalStartYear] = useState<number>(getInitialFiscalStartYear);
  const [rows, setRows] = useState<IncomeRow[]>(DEFAULT_ROWS);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const [pdfActionModalVisible, setPdfActionModalVisible] = useState<boolean>(false);
  const [generatedHtml, setGeneratedHtml] = useState<string>('');

  const [hiddenModalVisible, setHiddenModalVisible] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<ItemType>('income');
  const [newMode, setNewMode] = useState<CellMode>('fixed');
  const [newDefaultVal, setNewDefaultVal] = useState('');
  const [applyToAllMonths, setApplyToAllMonths] = useState(false);
  const [selectedStartMonth, setSelectedStartMonth] = useState<string>('July');

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRow, setEditingRow] = useState<IncomeRow | null>(null);
  const [editingMonth, setEditingMonth] = useState<string>('July');
  const [editMode, setEditMode] = useState<CellMode>('fixed');
  const [editValue, setEditValue] = useState<string>('0');
  const [applyForward, setApplyForward] = useState<boolean>(false);

  const fiscalLabel = formatFiscalYearLabel(fiscalStartYear);
  const getStorageKey = (startYr: number) => `@income_fy_${startYr}_${startYr + 1}`;

  useEffect(() => {
    const loadData = async () => {
      try {
        const saved = await AsyncStorage.getItem(getStorageKey(fiscalStartYear));
        if (saved) {
          const parsed = JSON.parse(saved);
          setRows(mergeAndNormalizeRows(parsed));
        } else {
          setRows(DEFAULT_ROWS);
        }
      } catch (e) {
        console.log('Failed to load income year sheet:', e);
      }
    };
    loadData();
  }, [fiscalStartYear]);

  const snapToGridIndex = useCallback(
    (targetIdx: number, animated = true) => {
      const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
      const clampedIdx = Math.max(0, Math.min(maxStartIndex, targetIdx));
      setActiveGridIndex(clampedIdx);
      monthScrollRef.current?.scrollTo({
        x: clampedIdx * monthColWidth,
        animated,
      });
    },
    [monthColWidth, visibleColumnsCount]
  );

  // শুরুতে Current Month গ্রিডের প্রথম কলামে এনে বসিয়ে দেওয়া
  useEffect(() => {
    if (!initialScrollDoneRef.current && monthColWidth > 0) {
      initialScrollDoneRef.current = true;
      const currentMonthName = getCurrentFiscalMonthName();
      const idx = FISCAL_MONTHS.indexOf(currentMonthName);
      if (idx >= 0) {
        setTimeout(() => {
          snapToGridIndex(idx, false);
        }, 60);
      }
    }
  }, [monthColWidth, snapToGridIndex]);

  const handleJumpToCurrentMonth = () => {
    const currentMonthName = getCurrentFiscalMonthName();
    const idx = FISCAL_MONTHS.indexOf(currentMonthName);
    if (idx >= 0) {
      snapToGridIndex(idx, true);
    }
  };

  // স্লাইড শেষ হলে ঠিক গ্রিড লাইনে স্ন্যাপ নিশ্চিত করা
  const handleGridScrollEnd = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x || 0;
    const nearestIdx = Math.round(offsetX / monthColWidth);
    const maxStartIndex = Math.max(0, FISCAL_MONTHS.length - visibleColumnsCount);
    const clampedIdx = Math.max(0, Math.min(maxStartIndex, nearestIdx));
    setActiveGridIndex(clampedIdx);

    const exactX = clampedIdx * monthColWidth;
    if (Math.abs(offsetX - exactX) > 1 && monthScrollRef.current) {
      monthScrollRef.current.scrollTo({ x: exactX, animated: true });
    }
  };

  const saveRowsForFiscalYear = useCallback(
    async (startYr: number, updatedRows: IncomeRow[]) => {
      if (startYr === fiscalStartYear) {
        setRows(updatedRows);
      }
      try {
        await AsyncStorage.setItem(getStorageKey(startYr), JSON.stringify(updatedRows));
      } catch (e) {
        console.log('Failed to save income year sheet:', e);
      }
    },
    [fiscalStartYear]
  );

  const handleBasicChange = async (rowId: string, month: string, text: string) => {
    const numericVal = parseNumericValue(text);

    const updatedCurrentYear = rows.map((row) => {
      if (row.id !== rowId) return row;
      const updatedCells = { ...row.cells };

      if (month === 'July') {
        FISCAL_MONTHS.forEach((m) => {
          updatedCells[m] = { mode: 'fixed', value: numericVal };
        });
      } else if (month === 'January') {
        SECOND_HALF_MONTHS.forEach((m) => {
          updatedCells[m] = { mode: 'fixed', value: numericVal };
        });
      } else {
        updatedCells[month] = { mode: 'fixed', value: numericVal };
      }

      return { ...row, cells: updatedCells };
    });

    await saveRowsForFiscalYear(fiscalStartYear, updatedCurrentYear);

    if (month === 'July') {
      const nextFiscalStartYear = fiscalStartYear + 1;
      try {
        const nextRaw = await AsyncStorage.getItem(getStorageKey(nextFiscalStartYear));
        let nextRows: IncomeRow[] = nextRaw
          ? mergeAndNormalizeRows(JSON.parse(nextRaw))
          : DEFAULT_ROWS.map((r) => ({
              ...r,
              cells: Object.fromEntries(
                FISCAL_MONTHS.map((m) => [
                  m,
                  {
                    mode: r.cells[m]?.mode || 'fixed',
                    value: parseNumericValue(r.cells[m]?.value),
                  },
                ])
              ),
            }));

        nextRows = nextRows.map((row) => {
          if (!row.isBasic && row.id !== rowId) return row;
          const nextCells = { ...row.cells };
          SECOND_HALF_MONTHS.forEach((m) => {
            nextCells[m] = { mode: 'fixed', value: numericVal };
          });
          return { ...row, cells: nextCells };
        });

        await AsyncStorage.setItem(getStorageKey(nextFiscalStartYear), JSON.stringify(nextRows));
      } catch (e) {
        console.log('Next income year basic sync error:', e);
      }
    }
  };

  const getBasicForMonth = useCallback(
    (month: string): number => {
      const basicRow = rows.find(
        (r) => r.isBasic || r.description.trim().toLowerCase() === 'net basic'
      );
      if (!basicRow || basicRow.hidden) return 0;
      return parseNumericValue(basicRow.cells?.[month]?.value);
    },
    [rows]
  );

  const getResolvedAmount = useCallback(
    (row: IncomeRow, month: string): number => {
      if (row.hidden) return 0;
      const cell = row.cells?.[month];
      if (!cell) return 0;

      const val = parseNumericValue(cell.value);
      if (val === 0) return 0;

      if (cell.mode === 'percent') {
        const basic = getBasicForMonth(month);
        const cents = Math.round(Math.round(basic * 100) * val) / 100;
        return Math.round(cents) / 100;
      }
      return Math.round(val * 100) / 100;
    },
    [getBasicForMonth]
  );

  const { monthlySummary, yearlyTotals } = useMemo(() => {
    const summary: {
      [month: string]: {
        totalPayable: number;
        totalDeduction: number;
        netPay: number;
      };
    } = {};

    let annualPayableCents = 0;
    let annualDeductionCents = 0;
    let annualNetPayCents = 0;

    FISCAL_MONTHS.forEach((month) => {
      let monthPayableCents = 0;
      let monthDeductionCents = 0;

      rows.forEach((row) => {
        if (row.hidden) return;
        const amount = getResolvedAmount(row, month);
        const amountCents = Math.round(amount * 100);
        if (row.type === 'income') {
          monthPayableCents += amountCents;
        } else if (row.type === 'deduction') {
          monthDeductionCents += amountCents;
        }
      });

      const monthNetPayCents = monthPayableCents - monthDeductionCents;

      summary[month] = {
        totalPayable: monthPayableCents / 100,
        totalDeduction: monthDeductionCents / 100,
        netPay: monthNetPayCents / 100,
      };

      annualPayableCents += monthPayableCents;
      annualDeductionCents += monthDeductionCents;
      annualNetPayCents += monthNetPayCents;
    });

    return {
      monthlySummary: summary,
      yearlyTotals: {
        annualPayable: annualPayableCents / 100,
        annualDeduction: annualDeductionCents / 100,
        annualNetPay: annualNetPayCents / 100,
      },
    };
  }, [rows, getResolvedAmount]);

  const handleToggleHideRow = async (rowId: string, hideValue: boolean) => {
    const updated = rows.map((r) => (r.id === rowId ? { ...r, hidden: hideValue } : r));
    await saveRowsForFiscalYear(fiscalStartYear, updated);
  };

  const openCellEditor = (row: IncomeRow, month: string) => {
    const currentCell = row.cells?.[month] || { mode: 'fixed', value: 0 };
    setEditingRow(row);
    setEditingMonth(month);
    setEditMode(currentCell.mode);
    setEditValue(currentCell.value ? String(currentCell.value) : '');
    setApplyForward(false);
    setEditModalVisible(true);
  };

  const handleSaveCellEdit = async () => {
    if (!editingRow) return;
    const numVal = parseNumericValue(editValue);
    const startIdx = FISCAL_MONTHS.indexOf(editingMonth);

    const updated = rows.map((row) => {
      if (row.id !== editingRow.id) return row;
      const updatedCells = { ...row.cells };

      if (applyForward && startIdx >= 0) {
        for (let i = startIdx; i < FISCAL_MONTHS.length; i++) {
          updatedCells[FISCAL_MONTHS[i]] = { mode: editMode, value: numVal };
        }
      } else {
        updatedCells[editingMonth] = { mode: editMode, value: numVal };
      }

      return { ...row, cells: updatedCells };
    });

    await saveRowsForFiscalYear(fiscalStartYear, updated);
    setEditModalVisible(false);
  };

  const handleAddRow = async () => {
    if (!newDesc.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে খাতের বিবরণ (Description) লিখুন।');
      return;
    }

    const numVal = parseNumericValue(newDefaultVal);
    const cells: { [month: string]: CellConfig } = {};

    FISCAL_MONTHS.forEach((m) => {
      if (applyToAllMonths) {
        cells[m] = { mode: newMode, value: numVal };
      } else {
        cells[m] = { mode: newMode, value: m === selectedStartMonth ? numVal : 0 };
      }
    });

    const newRow: IncomeRow = {
      id: `custom-${Date.now()}`,
      description: newDesc.trim(),
      type: newType,
      hidden: false,
      cells,
    };

    await saveRowsForFiscalYear(fiscalStartYear, [...rows, newRow]);
    setNewDesc('');
    setNewDefaultVal('');
    setApplyToAllMonths(false);
    setAddModalVisible(false);
  };

  const visibleIncomeRows = rows.filter((r) => r.type === 'income' && !r.hidden);
  const visibleDeductionRows = rows.filter((r) => r.type === 'deduction' && !r.hidden);
  const hiddenRows = rows.filter((r) => r.hidden);

  const buildReportHtml = () => {
    const getRowAnnualTotal = (row: IncomeRow) => {
      const totalCents = FISCAL_MONTHS.reduce(
        (sumCents, m) => sumCents + Math.round(getResolvedAmount(row, m) * 100),
        0
      );
      return totalCents / 100;
    };

    const renderTableRowsHtml = (items: IncomeRow[]) =>
      items
        .map((row) => {
          const annualSum = getRowAnnualTotal(row);
          const monthCols = FISCAL_MONTHS.map((m) => {
            const val = getResolvedAmount(row, m);
            return `<td style="text-align:right;">${val > 0 ? val.toLocaleString('en-IN') : '-'}</td>`;
          }).join('');
          return `
            <tr>
              <td style="text-align:left; font-weight:600; white-space:nowrap;">${row.description}</td>
              ${monthCols}
              <td style="text-align:right; font-weight:700; background:#F8FAFC;">${annualSum.toLocaleString('en-IN')}</td>
            </tr>
          `;
        })
        .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Income Year Report (${fiscalLabel})</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0F172A; margin: 0; padding: 8px; }
          .report-header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #1E293B; padding-bottom: 8px; }
          .report-header h1 { margin: 0; font-size: 18px; color: #0F172A; }
          .report-header p { margin: 4px 0 0; font-size: 12px; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          th, td { border: 1px solid #94A3B8; padding: 5px 4px; }
          th { background-color: #1E293B; color: #FFFFFF; font-weight: 700; text-align: center; }
          .th-sub { display: block; font-size: 7.5px; font-weight: 400; color: #CBD5E1; }
          .section-row td { background-color: #E2E8F0; font-weight: 700; text-align: left; font-size: 9.5px; }
          .total-payable td { background-color: #DCFCE7; font-weight: 700; color: #14532D; }
          .total-deduction td { background-color: #FEE2E2; font-weight: 700; color: #7F1D1D; }
          .net-pay td { background-color: #DBEAFE; font-weight: 700; color: #1E3A8A; font-size: 9.5px; }
          .footer-note { margin-top: 10px; font-size: 9px; color: #64748B; text-align: right; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>Income Year Report (${fiscalLabel}) — July ${fiscalStartYear} to June ${fiscalStartYear + 1}</h1>
          <p>MyBudgetApp • Payroll & Income Statement • Currency: BDT (Tk.)</p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align:left; min-width:140px;">Particulars / খাত</th>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<th>${m.slice(0, 3)}<span class="th-sub">${String(
                    getMonthCalendarYear(m, fiscalStartYear)
                  ).slice(-2)}</span></th>`
              ).join('')}
              <th>Year Total (Tk.)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="section-row"><td colspan="14">INCOME & ALLOWANCES (+)</td></tr>
            ${renderTableRowsHtml(visibleIncomeRows)}
            <tr class="total-payable">
              <td style="text-align:left;">Total Payable (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].totalPayable.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualPayable.toLocaleString('en-IN')}</td>
            </tr>

            <tr class="section-row"><td colspan="14">DEDUCTIONS (-)</td></tr>
            ${renderTableRowsHtml(visibleDeductionRows)}
            <tr class="total-deduction">
              <td style="text-align:left;">Total Deduction (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].totalDeduction.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualDeduction.toLocaleString('en-IN')}</td>
            </tr>

            <tr class="net-pay">
              <td style="text-align:left;">Net Pay (Tk.)</td>
              ${FISCAL_MONTHS.map(
                (m) =>
                  `<td style="text-align:right;">${monthlySummary[m].netPay.toLocaleString('en-IN')}</td>`
              ).join('')}
              <td style="text-align:right;">${yearlyTotals.annualNetPay.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer-note">
          Income Year: July ${fiscalStartYear} – June ${fiscalStartYear + 1} • Generated: ${new Date().toLocaleDateString('en-GB')}
        </div>
      </body>
      </html>
    `;
  };

  const triggerWebDownload = (htmlContent: string) => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Income_Year_Report_${fiscalLabel}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const triggerWebPrintPdf = async (htmlContent: string) => {
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
        return;
      }
    }
    await Print.printAsync({ html: htmlContent });
  };

  const triggerWebShare = async () => {
    const shareText = `Income Year Report (${fiscalLabel}) | Total Payable: ${yearlyTotals.annualPayable.toLocaleString('en-IN')} Tk. | Total Deduction: ${yearlyTotals.annualDeduction.toLocaleString('en-IN')} Tk. | Net Pay: ${yearlyTotals.annualNetPay.toLocaleString('en-IN')} Tk.`;
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({
          title: `Income Year Report (${fiscalLabel})`,
          text: shareText,
        });
        return;
      } catch {
        // fallback below
      }
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(shareText);
      Alert.alert('কপি হয়েছে', 'রিপোর্টের সারসংক্ষেপ ক্লিপবোর্ডে কপি করা হয়েছে।');
    }
  };

  const handleDownloadAndSharePdf = async () => {
    try {
      setExportingPdf(true);
      const htmlContent = buildReportHtml();

      if (Platform.OS === 'web') {
        triggerWebDownload(htmlContent);
        setGeneratedHtml(htmlContent);
        setPdfActionModalVisible(true);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Income_Year_Report_${fiscalLabel}.pdf`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF ডাউনলোড/সেভ হয়েছে', `ফাইলটি সেভ হয়েছে: ${uri}`);
        }
      }
    } catch (error) {
      console.log('PDF export/share error:', error);
      Alert.alert('সমস্যা হয়েছে', 'PDF রিপোর্ট তৈরি বা ডাউনলোড করা যায়নি।');
    } finally {
      setExportingPdf(false);
    }
  };

  const renderMonthCells = (row: IncomeRow) => {
    return FISCAL_MONTHS.map((month) => {
      if (row.isBasic) {
        const rawVal = parseNumericValue(row.cells?.[month]?.value);
        return (
          <View
            key={month}
            style={[styles.cell, { width: monthColWidth }, styles.basicCellBg]}
          >
            <TextInput
              style={[styles.cellInput, { fontWeight: '700', color: '#0F172A' }]}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#94A3B8"
              value={rawVal > 0 ? String(rawVal) : ''}
              onChangeText={(text) => handleBasicChange(row.id, month, text)}
            />
          </View>
        );
      }

      const cell = row.cells?.[month] || { mode: 'fixed', value: 0 };
      const cellVal = parseNumericValue(cell.value);
      const resolvedVal = getResolvedAmount(row, month);

      return (
        <TouchableOpacity
          key={month}
          activeOpacity={0.7}
          onPress={() => openCellEditor(row, month)}
          style={[
            styles.cell,
            { width: monthColWidth },
            cell.mode === 'percent' && cellVal > 0 && styles.percentCellBg,
          ]}
        >
          <Text style={styles.resolvedAmountText}>
            {resolvedVal > 0 ? resolvedVal.toLocaleString('en-IN') : '0'}
          </Text>
          {cell.mode === 'percent' && cellVal > 0 && (
            <Text style={styles.percentBadge}>{cellVal}% of Basic</Text>
          )}
        </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Income Sheet ({fiscalLabel})</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            খাত ফিক্সড • গ্রিড স্ন্যাপ স্লাইড
          </Text>
        </View>

        <TouchableOpacity style={styles.nowBtn} onPress={handleJumpToCurrentMonth}>
          <Text style={styles.nowBtnText}>Now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.pdfBtn}
          onPress={handleDownloadAndSharePdf}
          disabled={exportingPdf}
        >
          {exportingPdf ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={15} color="#FFFFFF" />
              <Text style={styles.pdfBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.yearBox}>
          <TouchableOpacity onPress={() => setFiscalStartYear((y) => y - 1)}>
            <Ionicons name="chevron-back" size={18} color="#2563EB" />
          </TouchableOpacity>
          <Text style={styles.yearText}>{fiscalLabel}</Text>
          <TouchableOpacity onPress={() => setFiscalStartYear((y) => y + 1)}>
            <Ionicons name="chevron-forward" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action Bar + Grid Step Controls */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#16A34A' }]}
          onPress={() => {
            setNewType('income');
            setAddModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>+ Income</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#DC2626' }]}
          onPress={() => {
            setNewType('deduction');
            setAddModalVisible(true);
          }}
        >
          <Ionicons name="remove-circle-outline" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>+ Deduction</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#334155' }]}
          onPress={() => setHiddenModalVisible(true)}
        >
          <Ionicons name="eye-off-outline" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>Hidden ({hiddenRows.length})</Text>
        </TouchableOpacity>

        {/* Grid Step Left/Right Buttons */}
        <View style={styles.gridStepGroup}>
          <TouchableOpacity
            style={styles.gridStepBtn}
            onPress={() => snapToGridIndex(activeGridIndex - 1, true)}
          >
            <Ionicons name="chevron-back" size={16} color="#1E3A8A" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gridStepBtn}
            onPress={() => snapToGridIndex(activeGridIndex + 1, true)}
          >
            <Ionicons name="chevron-forward" size={16} color="#1E3A8A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Fixed Description Column + Exact Grid-Snapped Month Columns */}
      <ScrollView style={styles.verticalScroll}>
        <View style={styles.sheetWrapper}>
          {/* Left Fixed Description Column */}
          <View style={[styles.fixedColumn, { width: descColWidth }]}>
            <View style={[styles.headerCell, { width: descColWidth }]}>
              <Text style={styles.headerCellText}>খাত / Description</Text>
            </View>

            <View style={[styles.sectionBanner, { width: descColWidth }]}>
              <Text style={styles.sectionBannerText}>INCOME (+)</Text>
            </View>

            {visibleIncomeRows.map((row) => (
              <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                <View style={{ flex: 1, marginRight: 3 }}>
                  <Text style={styles.descText} numberOfLines={2}>
                    {row.description}
                  </Text>
                  {row.isBasic && (
                    <Text style={styles.hintSubText}>Jul→Jun | Jan→Jun</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleHideRow(row.id, true)}
                  accessibilityLabel="Hide item"
                >
                  <Ionicons name="eye-off-outline" size={15} color="#64748B" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Total Payable (Tk.) */}
            <View style={[styles.summaryCell, styles.totalIncomeBg, { width: descColWidth }]}>
              <Text style={styles.summaryTitle}>Total Payable (Tk.)</Text>
            </View>

            {/* Deductions Banner */}
            <View style={[styles.sectionBanner, { width: descColWidth }]}>
              <Text style={[styles.sectionBannerText, { color: '#B91C1C' }]}>
                DEDUCTIONS (-)
              </Text>
            </View>

            {visibleDeductionRows.map((row) => (
              <View key={row.id} style={[styles.descCell, { width: descColWidth }]}>
                <View style={{ flex: 1, marginRight: 3 }}>
                  <Text style={styles.descText} numberOfLines={2}>
                    {row.description}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleHideRow(row.id, true)}
                  accessibilityLabel="Hide item"
                >
                  <Ionicons name="eye-off-outline" size={15} color="#64748B" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Total Deduction (Tk.) */}
            <View style={[styles.summaryCell, styles.totalDeductionBg, { width: descColWidth }]}>
              <Text style={styles.summaryTitle}>Total Deduction (Tk.)</Text>
            </View>

            {/* Net Pay (Tk.) */}
            <View style={[styles.summaryCell, styles.netIncomeBg, { width: descColWidth }]}>
              <Text style={[styles.summaryTitle, { color: '#1D4ED8' }]}>Net Pay (Tk.)</Text>
            </View>
          </View>

          {/* Right Exact-Grid Viewport (কখনো ডানে/বামে আংশিক মাস কাটা থাকবে না) */}
          <View style={{ width: exactRightViewportWidth, overflow: 'hidden' }}>
            <ScrollView
              ref={monthScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToOffsets={gridSnapOffsets}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum={true}
              onMomentumScrollEnd={handleGridScrollEnd}
              onScrollEndDrag={handleGridScrollEnd}
            >
              <View>
                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => {
                    const calYear = getMonthCalendarYear(month, fiscalStartYear);
                    const isCurrent = month === getCurrentFiscalMonthName();
                    return (
                      <View
                        key={month}
                        style={[
                          styles.headerCell,
                          { width: monthColWidth },
                          isCurrent && styles.currentMonthHeaderCell,
                        ]}
                      >
                        <Text style={styles.headerCellText} numberOfLines={1}>
                          {month} {String(calYear).slice(-2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((m) => (
                    <View key={m} style={[styles.sectionBanner, { width: monthColWidth }]} />
                  ))}
                </View>

                {visibleIncomeRows.map((row) => (
                  <View key={row.id} style={styles.row}>
                    {renderMonthCells(row)}
                  </View>
                ))}

                {/* Total Payable (Tk.) Values */}
                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[
                        styles.summaryCell,
                        styles.totalIncomeBg,
                        { width: monthColWidth },
                      ]}
                    >
                      <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                        {monthlySummary[month].totalPayable.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  {FISCAL_MONTHS.map((m) => (
                    <View key={m} style={[styles.sectionBanner, { width: monthColWidth }]} />
                  ))}
                </View>

                {visibleDeductionRows.map((row) => (
                  <View key={row.id} style={styles.row}>
                    {renderMonthCells(row)}
                  </View>
                ))}

                {/* Total Deduction (Tk.) Values */}
                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[
                        styles.summaryCell,
                        styles.totalDeductionBg,
                        { width: monthColWidth },
                      ]}
                    >
                      <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>
                        {monthlySummary[month].totalDeduction.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Net Pay (Tk.) Values */}
                <View style={styles.row}>
                  {FISCAL_MONTHS.map((month) => (
                    <View
                      key={month}
                      style={[styles.summaryCell, styles.netIncomeBg, { width: monthColWidth }]}
                    >
                      <Text style={[styles.summaryValue, { color: '#1D4ED8' }]}>
                        {monthlySummary[month].netPay.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      {/* Web Download & Share Action Modal */}
      <Modal visible={pdfActionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>রিপোর্ট ডাউনলোড ও শেয়ার ({fiscalLabel})</Text>
            <View style={{ gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#7C3AED', paddingVertical: 11 }]}
                onPress={() => triggerWebPrintPdf(generatedHtml)}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Print / Save as PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#16A34A', paddingVertical: 11 }]}
                onPress={triggerWebShare}
              >
                <Ionicons name="share-social-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Share Summary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#2563EB', paddingVertical: 11 }]}
                onPress={() => triggerWebDownload(generatedHtml)}
              >
                <Ionicons name="download-outline" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Download Again</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setPdfActionModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hidden Items Modal */}
      <Modal visible={hiddenModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>লুকানো খাতসমূহ ({fiscalLabel})</Text>
            {hiddenRows.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
                বর্তমানে কোনো খাত লুকানো নেই।
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 280, marginBottom: 12 }}>
                {hiddenRows.map((item) => (
                  <View key={item.id} style={styles.hiddenItemRow}>
                    <View>
                      <Text style={styles.descText}>{item.description}</Text>
                      <Text style={styles.hintSubText}>
                        {item.type === 'income' ? 'Income / Allowance' : 'Deduction'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unhideBtn}
                      onPress={() => handleToggleHideRow(item.id, false)}
                    >
                      <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.unhideBtnText}>Show</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => setHiddenModalVisible(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>বন্ধ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cell Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRow?.description} — {editingMonth} ({fiscalLabel})
            </Text>

            <Text style={styles.inputLabel}>হিসাবের ধরন নির্বাচন করুন</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, editMode === 'fixed' && styles.modeBtnActive]}
                onPress={() => setEditMode('fixed')}
              >
                <Text style={[styles.modeBtnText, editMode === 'fixed' && styles.modeBtnTextActive]}>
                  নির্দিষ্ট টাকা (Fixed)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, editMode === 'percent' && styles.modeBtnActive]}
                onPress={() => setEditMode('percent')}
              >
                <Text
                  style={[styles.modeBtnText, editMode === 'percent' && styles.modeBtnTextActive]}
                >
                  Basic-এর শতকরা (%)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>
              {editMode === 'percent' ? 'শতকরা হার (%) লিখুন' : 'টাকার পরিমাণ লিখুন'}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={editMode === 'percent' ? 'যেমন: 50' : 'যেমন: 15000'}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setApplyForward(!applyForward)}
            >
              <Ionicons
                name={applyForward ? 'checkbox' : 'square-outline'}
                size={22}
                color="#2563EB"
              />
              <Text style={styles.checkboxLabel}>
                {editingMonth} থেকে June পর্যন্ত পরবর্তী সব মাসেও এটি প্রযোজ্য হবে
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveCellEdit}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add New Item Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {newType === 'income'
                ? 'নতুন Income / Allowance খাত যোগ করুন'
                : 'নতুন Deduction খাত যোগ করুন'}
            </Text>

            <Text style={styles.inputLabel}>খাতের বিবরণ (Description)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="যেমন: Festival Allowance, Mobile Bill, Loan Installment..."
              value={newDesc}
              onChangeText={setNewDesc}
            />

            <Text style={styles.inputLabel}>হিসাবের ধরন</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, newMode === 'fixed' && styles.modeBtnActive]}
                onPress={() => setNewMode('fixed')}
              >
                <Text style={[styles.modeBtnText, newMode === 'fixed' && styles.modeBtnTextActive]}>
                  নির্দিষ্ট টাকা (Fixed)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, newMode === 'percent' && styles.modeBtnActive]}
                onPress={() => setNewMode('percent')}
              >
                <Text
                  style={[styles.modeBtnText, newMode === 'percent' && styles.modeBtnTextActive]}
                >
                  Basic-এর শতকরা (%)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>
              {newMode === 'percent' ? 'শতকরা হার (%)' : 'টাকার পরিমাণ'}
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder={newMode === 'percent' ? 'যেমন: 20' : 'যেমন: 3000'}
              value={newDefaultVal}
              onChangeText={setNewDefaultVal}
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setApplyToAllMonths(!applyToAllMonths)}
            >
              <Ionicons
                name={applyToAllMonths ? 'checkbox' : 'square-outline'}
                size={22}
                color="#2563EB"
              />
              <Text style={styles.checkboxLabel}>
                পুরো Income Year (১২ মাসেই) প্রযোজ্য হবে
              </Text>
            </TouchableOpacity>

            {!applyToAllMonths && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>প্রাথমিক মাস নির্বাচন করুন</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {FISCAL_MONTHS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setSelectedStartMonth(m)}
                        style={[
                          styles.monthChip,
                          selectedStartMonth === m && styles.monthChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.monthChipText,
                            selectedStartMonth === m && styles.monthChipTextActive,
                          ]}
                        >
                          {m.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setAddModalVisible(false)}
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
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 5,
  },
  backBtn: {
    padding: 3,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 10,
    color: '#64748B',
  },
  nowBtn: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
  },
  nowBtnText: {
    color: '#15803D',
    fontWeight: '700',
    fontSize: 11,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 3,
  },
  pdfBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
  },
  yearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 2,
  },
  yearText: {
    fontWeight: '700',
    color: '#1E40AF',
    fontSize: 12,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 6,
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
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 11.5,
  },
  gridStepGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  gridStepBtn: {
    width: 30,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
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
  headerCell: {
    height: 42,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    paddingHorizontal: 4,
  },
  currentMonthHeaderCell: {
    backgroundColor: '#1D4ED8',
  },
  headerCellText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11.5,
    textAlign: 'center',
  },
  sectionBanner: {
    height: 28,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  sectionBannerText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
  },
  descCell: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  descText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  hintSubText: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  cell: {
    height: 52,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },
  basicCellBg: {
    backgroundColor: '#FEFCE8',
  },
  percentCellBg: {
    backgroundColor: '#F0FDF4',
  },
  cellInput: {
    textAlign: 'right',
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 4,
  },
  resolvedAmountText: {
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  percentBadge: {
    textAlign: 'right',
    fontSize: 9,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 1,
  },
  summaryCell: {
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 6,
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
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  hiddenItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  unhideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unhideBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
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
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  modeBtnActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeBtnTextActive: {
    color: '#1D4ED8',
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
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  monthChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
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