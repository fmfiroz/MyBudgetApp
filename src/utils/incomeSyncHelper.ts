import AsyncStorage from '@react-native-async-storage/async-storage';

export const INCOME_FISCAL_MONTHS = [
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

function toCents(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val * 100) : 0;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  return 0;
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * একটি নির্দিষ্ট অর্থবছর ও মাসের জন্য সব Income Sheet (Salary, Daily, Business, Custom)-এর
 * সম্মিলিত Net Income (টাকায়) রিটার্ন করে।
 */
export async function getCombinedIncomeForMonth(
  month: string,
  fiscalStartYear: number
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(
      `@income_fy_${fiscalStartYear}_${fiscalStartYear + 1}`
    );
    if (!raw) return 0;

    const parsed: unknown = JSON.parse(raw);

    // নতুন মাল্টি-শিট ফরম্যাট
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).sheets)) {
      const sheets = (parsed as any).sheets as any[];
      let totalCombinedCents = 0;

      for (const sheet of sheets) {
        if (!sheet) continue;

        if (sheet.kind === 'daily') {
          const entries = Array.isArray(sheet.dailyEntries) ? sheet.dailyEntries : [];
          entries.forEach((entry: any) => {
            if (entry && entry.month === month) {
              totalCombinedCents += toCents(entry.amount);
            }
          });
        } else {
          const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
          let basicCents = 0;
          const basicRow = rows.find(
            (r: any) =>
              r &&
              !r.hidden &&
              (r.isBasic || String(r.description || '').trim().toLowerCase() === 'net basic')
          );
          if (basicRow?.cells?.[month]) {
            basicCents = toCents(basicRow.cells[month].value);
          }

          let incomeCents = 0;
          let deductionCents = 0;

          rows.forEach((row: any) => {
            if (!row || row.hidden) return;
            const cell = row.cells?.[month];
            if (!cell) return;
            const val = Number(cell.value) || 0;
            if (val === 0) return;

            const amtCents =
              cell.mode === 'percent' ? Math.round((basicCents * val) / 100) : toCents(val);

            if (row.type === 'deduction') {
              deductionCents += amtCents;
            } else {
              incomeCents += amtCents;
            }
          });

          totalCombinedCents += incomeCents - deductionCents;
        }
      }

      return fromCents(totalCombinedCents);
    }

    // পুরোনো অ্যারে ফরম্যাট ব্যাকওয়ার্ড সামঞ্জস্যতা
    if (Array.isArray(parsed)) {
      let basicCents = 0;
      const basicRow = (parsed as any[]).find(
        (r) =>
          r &&
          !r.hidden &&
          (r.isBasic || String(r.description || '').trim().toLowerCase() === 'net basic')
      );
      if (basicRow?.cells?.[month]) {
        basicCents = toCents(basicRow.cells[month].value);
      }

      let incomeCents = 0;
      let deductionCents = 0;

      (parsed as any[]).forEach((row) => {
        if (!row || row.hidden) return;
        const cell = row.cells?.[month];
        if (!cell) return;
        const val = Number(cell.value) || 0;
        if (val === 0) return;

        const amtCents =
          cell.mode === 'percent' ? Math.round((basicCents * val) / 100) : toCents(val);

        if (row.type === 'deduction') {
          deductionCents += amtCents;
        } else {
          incomeCents += amtCents;
        }
      });

      return fromCents(incomeCents - deductionCents);
    }

    return 0;
  } catch {
    return 0;
  }
}