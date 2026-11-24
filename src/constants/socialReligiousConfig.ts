export type ReligionType = 'islam' | 'hinduism' | 'christianity' | 'buddhism' | 'other';

export interface SocialReligiousColumn {
  id: string;
  orderIndex: number; // 1 to 15 (Strict serial order maintain করার জন্য)
  label: string;
  type: 'date' | 'checkbox' | 'number' | 'social_dropdown' | 'text';
  isDefault: boolean; // true হলে শুরু থেকেই থাকবে, false হলে Add করে আনতে হবে
  isEnabled: boolean; // ইউজার কলামটি অ্যাড করেছে কি না
}

export interface DailyEntry {
  day: number; // 1 to 31
  values: {
    [columnId: string]: boolean | number | string | null;
  };
  socialWorkType?: string; // ড্রপডাউন থেকে সিলেক্ট করা কাজের নাম
}

export interface DawatiTarget {
  id: string;
  serial: number;
  name: string;
  targetAddedDate: string;
  lastContactDate: string;
}

export interface KormiTarget {
  id: string;
  serial: number;
  name: string;
}

export interface SocialReligiousSheetData {
  monthKey: string; // e.g., "2026-11"
  religion: ReligionType;
  columns: SocialReligiousColumn[];
  entries: DailyEntry[];
  isDawatiListVisible: boolean;
  dawatiTargets: DawatiTarget[];
  isKormiListVisible: boolean;
  kormiTargets: KormiTarget[];
}

export const RELIGION_OPTIONS: { key: ReligionType; label: string; dawatiListTitle: string; kormiListTitle: string }[] = [
  {
    key: 'islam',
    label: 'ইসলাম (Islam)',
    dawatiListTitle: 'দাওয়াতি টার্গেট তালিকা',
    kormiListTitle: 'কর্মী টার্গেট তালিকা',
  },
  {
    key: 'hinduism',
    label: 'হিন্দু / সনাতন (Hinduism)',
    dawatiListTitle: 'ধর্মীয় প্রচার টার্গেট তালিকা',
    kormiListTitle: 'সেবক / সদস্য টার্গেট তালিকা',
  },
  {
    key: 'christianity',
    label: 'খ্রিস্টান (Christianity)',
    dawatiListTitle: 'সুসমাচার প্রচার টার্গেট তালিকা',
    kormiListTitle: 'ফেলোশিপ সদস্য টার্গেট তালিকা',
  },
  {
    key: 'buddhism',
    label: 'বৌদ্ধ (Buddhism)',
    dawatiListTitle: 'ধম্ম প্রচার টার্গেট তালিকা',
    kormiListTitle: 'সংঘ সদস্য টার্গেট তালিকা',
  },
  {
    key: 'other',
    label: 'অন্যান্য / সাধারণ মানবিক (Other)',
    dawatiListTitle: 'শুভাকাঙ্ক্ষী টার্গেট তালিকা',
    kormiListTitle: 'স্বেচ্ছাসেবক টার্গেট তালিকা',
  },
];

export const SOCIAL_WORK_OPTIONS: string[] = [
  'হাত ধোয়া',
  'পা ধোয়া',
  'মাথা ধোয়া',
  'মুখ ধোয়া',
  'তান ধোয়া',
  'নাক ধোয়া',
  'পেট ধোয়া',
  'গলা ধোয়া',
  'হাটু ধোয়া',
  'চোখ ধোয়া',
];

const RELIGION_LABELS: Record<ReligionType, Record<string, string>> = {
  islam: {
    scripture: 'কুরআন অধ্যয়ন (√)',
    secondary_scripture: 'হাদিস অধ্যয়ন (সংখ্যা)',
    literature: 'ইসলামি সাহিত্য অধ্যয়ন (পৃষ্ঠা)',
    congregation: 'জামায়াতে নামাজ (ওয়াক্ত সংখ্যা)',
    dawati_visit: 'দাওয়াতি টার্গেট সাক্ষাৎ (কতবার)',
    kormi_visit: 'কর্মী টার্গেট সাক্ষাৎ (কতবার)',
    kormi_contact: 'কর্মী যোগাযোগ (কতবার)',
    book_dist: 'বই বিলি (কতটি)',
    meeting: 'বৈঠক (√)',
  },
  hinduism: {
    scripture: 'গীতা/বেদ অধ্যয়ন (√)',
    secondary_scripture: 'উপনিষদ/পুরাণ পাঠ (সংখ্যা)',
    literature: 'ধর্মীয় সাহিত্য অধ্যয়ন (পৃষ্ঠা)',
    congregation: 'মন্দিরে/সমবেত প্রার্থনা (বার)',
    dawati_visit: 'ধর্মীয় প্রচার/সাক্ষাৎ (কতবার)',
    kormi_visit: 'সেবক/সদস্য সাক্ষাৎ (কতবার)',
    kormi_contact: 'সদস্য যোগাযোগ (কতবার)',
    book_dist: 'ধর্মীয় বই বিলি (কতটি)',
    meeting: 'সৎসঙ্গ / বৈঠক (√)',
  },
  christianity: {
    scripture: 'বাইবেল অধ্যয়ন (√)',
    secondary_scripture: 'গসপেল/স্তোত্র পাঠ (সংখ্যা)',
    literature: 'খ্রিস্টীয় সাহিত্য অধ্যয়ন (পৃষ্ঠা)',
    congregation: 'গির্জায়/সমবেত প্রার্থনা (বার)',
    dawati_visit: 'সুসমাচার প্রচার/সাক্ষাৎ (কতবার)',
    kormi_visit: 'ফেলোশিপ সদস্য সাক্ষাৎ (কতবার)',
    kormi_contact: 'সদস্য যোগাযোগ (কতবার)',
    book_dist: 'বই/পুস্তিকা বিলি (কতটি)',
    meeting: 'ফেলোশিপ বৈঠক (√)',
  },
  buddhism: {
    scripture: 'ত্রিপিটক অধ্যয়ন (√)',
    secondary_scripture: 'জাতক/সূত্র পাঠ (সংখ্যা)',
    literature: 'বৌদ্ধ সাহিত্য অধ্যয়ন (পৃষ্ঠা)',
    congregation: 'বিহারে/সমবেত বন্দনা (বার)',
    dawati_visit: 'ধম্ম প্রচার/সাক্ষাৎ (কতবার)',
    kormi_visit: 'সংঘ সদস্য সাক্ষাৎ (কতবার)',
    kormi_contact: 'সদস্য যোগাযোগ (কতবার)',
    book_dist: 'বই/পুস্তিকা বিলি (কতটি)',
    meeting: 'ধম্ম আলোচনা / বৈঠক (√)',
  },
  other: {
    scripture: 'নৈতিক পাঠ/অধ্যয়ন (√)',
    secondary_scripture: 'অনুপ্রেরণামূলক পাঠ (সংখ্যা)',
    literature: 'মানবিক/দর্শন সাহিত্য (পৃষ্ঠা)',
    congregation: 'মেডিটেশন/ধ্যান (বার)',
    dawati_visit: 'শুভাকাঙ্ক্ষী সাক্ষাৎ (কতবার)',
    kormi_visit: 'স্বেচ্ছাসেবক সাক্ষাৎ (কতবার)',
    kormi_contact: 'টিম যোগাযোগ (কতবার)',
    book_dist: 'বই/লিফলেট বিলি (কতটি)',
    meeting: 'সামাজিক বৈঠক (√)',
  },
};

export function getColumnsForReligion(religion: ReligionType): SocialReligiousColumn[] {
  const labels = RELIGION_LABELS[religion];
  return [
    { id: 'date', orderIndex: 1, label: 'তারিখ', type: 'date', isDefault: true, isEnabled: true },
    { id: 'scripture', orderIndex: 2, label: labels.scripture, type: 'checkbox', isDefault: true, isEnabled: true },
    { id: 'secondary_scripture', orderIndex: 3, label: labels.secondary_scripture, type: 'number', isDefault: false, isEnabled: false },
    { id: 'literature', orderIndex: 4, label: labels.literature, type: 'number', isDefault: false, isEnabled: false },
    { id: 'congregation', orderIndex: 5, label: labels.congregation, type: 'number', isDefault: false, isEnabled: false },
    { id: 'dawati_visit', orderIndex: 6, label: labels.dawati_visit, type: 'number', isDefault: false, isEnabled: false },
    { id: 'kormi_visit', orderIndex: 7, label: labels.kormi_visit, type: 'number', isDefault: false, isEnabled: false },
    { id: 'kormi_contact', orderIndex: 8, label: labels.kormi_contact, type: 'number', isDefault: false, isEnabled: false },
    { id: 'book_dist', orderIndex: 9, label: labels.book_dist, type: 'number', isDefault: false, isEnabled: false },
    { id: 'social_work', orderIndex: 10, label: 'সামাজিক কাজ (√)', type: 'social_dropdown', isDefault: true, isEnabled: true },
    { id: 'report_keeping', orderIndex: 11, label: 'রিপোর্ট রাখা (√)', type: 'checkbox', isDefault: true, isEnabled: true },
    { id: 'self_criticism', orderIndex: 12, label: 'আত্মসমালোচনা (√)', type: 'checkbox', isDefault: true, isEnabled: true },
    { id: 'meeting', orderIndex: 13, label: labels.meeting, type: 'checkbox', isDefault: true, isEnabled: true },
    { id: 'time_spent', orderIndex: 14, label: 'সময়দান (ঘণ্টা)', type: 'number', isDefault: true, isEnabled: true },
    { id: 'comment', orderIndex: 15, label: 'মন্তব্য', type: 'text', isDefault: true, isEnabled: true },
  ];
}

export function createInitialEntries(daysInMonth: number, columns: SocialReligiousColumn[]): DailyEntry[] {
  return Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1;
    const values: Record<string, boolean | number | string | null> = {};
    columns.forEach((col) => {
      if (col.type === 'checkbox' || col.type === 'social_dropdown') {
        values[col.id] = false;
      } else if (col.type === 'number') {
        values[col.id] = null;
      } else if (col.type === 'text') {
        values[col.id] = '';
      }
    });
    return { day, values };
  });
}