import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { saveLocalData } from '../utils/firebaseSync';

type EntryKind = 'fuel' | 'maintenance';
type VehicleCategory = 'Bike' | 'Car' | 'Scooty' | 'Pickup / Van' | 'Other';

interface VehicleProfile {
  id: string;
  name: string;
  category: VehicleCategory;
  customCategory?: string;
  regNo?: string;
}

interface PendingFuelReading {
  id: string;
  date: string; // DD/MM/YYYY
  reading: number;
  notes?: string;
  createdAt: number;
}

interface PurchasedPartItem {
  id: string;
  name: string;
  brand?: string;
  quantity: number;
  price: number;
}

interface SavedItemTemplate {
  name: string;
  brand?: string;
  quantity: number;
  price: number;
  usedAt: number;
}

interface VehicleLogEntry {
  id: string;
  vehicleId: string;
  kind: EntryKind;
  date: string; // DD/MM/YYYY
  finishDate?: string;
  finishReading?: number;
  hasFinishReading?: boolean;
  reading: number;
  hasReading?: boolean;
  fuelLtr: number;
  ratePerLitre: number;
  taka: number;
  serviceName: string;
  serviceCharge: number;
  purchasedItems: PurchasedPartItem[];
  notes?: string;
  createdAt: number;
}

interface VehicleStoreData {
  vehicles: VehicleProfile[];
  selectedVehicleId: string | null;
  pendingFuelByVehicle: Record<string, PendingFuelReading | null>;
  entries: VehicleLogEntry[];
}

interface ComputedRow {
  entry: VehicleLogEntry;
  usage: number | null;
  days: number | null;
  kmPerDay: number | null;
  mileage: number | null;
  costPerDay: number | null;
  costPerKm: number | null;
  itemsTotalCost: number;
}

const STORAGE_KEY = '@vehicle_logsheet_table_v7';
const SAVED_ITEMS_KEY = '@vehicle_saved_items_v1';

const VEHICLE_CATEGORIES: VehicleCategory[] = [
  'Bike',
  'Car',
  'Scooty',
  'Pickup / Van',
  'Other',
];

const parseOptionalNum = (val: unknown): number | null => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const parseNum = (val: unknown): number => {
  const parsed = parseOptionalNum(val);
  return parsed !== null ? parsed : 0;
};

const fmtFixed = (val: number | null | undefined, decimals = 2): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '-';
  return val.toFixed(decimals);
};

const formatDateParts = (day: number, month: number, year: number): string => {
  const d = String(day).padStart(2, '0');
  const m = String(month).padStart(2, '0');
  return `${d}/${m}/${year}`;
};

const getTodayDDMMYYYY = (): string => {
  const now = new Date();
  return formatDateParts(now.getDate(), now.getMonth() + 1, now.getFullYear());
};

const parseDDMMYYYY = (dateStr: string): Date | null => {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const year = Number(parts[2]);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  const dt = new Date(year, month, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
};

const getDaysInMonth = (month: number, year: number): number => {
  return new Date(year, month, 0).getDate();
};

const diffDaysBetween = (startStr: string, endStr: string): number | null => {
  const d1 = parseDDMMYYYY(startStr);
  const d2 = parseDDMMYYYY(endStr);
  if (!d1 || !d2) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diff = Math.round((utc2 - utc1) / msPerDay);
  return diff >= 0 ? diff : null;
};

const formatVehicleType = (v: VehicleProfile): string => {
  if (v.category === 'Other') {
    return v.customCategory?.trim() ? v.customCategory.trim() : 'Other';
  }
  return v.category;
};

export default function VehicleExpenseScreen() {
  const router = useRouter();
  const { manage: manageParam } = useLocalSearchParams<{ manage?: string }>();
  const canManageVehicleData = manageParam === '1';

  const [store, setStore] = useState<VehicleStoreData>({
    vehicles: [],
    selectedVehicleId: null,
    pendingFuelByVehicle: {},
    entries: [],
  });

  const [savedItemMemory, setSavedItemMemory] = useState<SavedItemTemplate[]>(
    []
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [finishModalVisible, setFinishModalVisible] = useState(false);
  const [finishDateInput, setFinishDateInput] = useState<string>(
    getTodayDDMMYYYY()
  );
  const [finishReadingInput, setFinishReadingInput] = useState<string>('');
  const [finishNotesInput, setFinishNotesInput] = useState<string>('');

  const [cancelPendingModalVisible, setCancelPendingModalVisible] =
    useState(false);
  const [cancelPendingCooldown, setCancelPendingCooldown] = useState<number>(0);
  const cancelPendingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'entry' | 'finish'>(
    'entry'
  );
  const [pickerYear, setPickerYear] = useState<number>(
    new Date().getFullYear()
  );
  const [pickerMonth, setPickerMonth] = useState<number>(
    new Date().getMonth() + 1
  );
  const [pickerDay, setPickerDay] = useState<number>(new Date().getDate());

  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehNameInput, setVehNameInput] = useState<string>('');
  const [vehCategoryInput, setVehCategoryInput] =
    useState<VehicleCategory>('Bike');
  const [vehCustomCategoryInput, setVehCustomCategoryInput] =
    useState<string>('');
  const [vehRegNoInput, setVehRegNoInput] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<VehicleLogEntry | null>(
    null
  );
  const [deleteChecked, setDeleteChecked] = useState<boolean>(false);
  const [deleteCooldown, setDeleteCooldown] = useState<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [kind, setKind] = useState<EntryKind>('fuel');
  const [dateInput, setDateInput] = useState<string>(getTodayDDMMYYYY());
  const [notesInput, setNotesInput] = useState<string>('');

  const [readingInput, setReadingInput] = useState<string>('');
  const [fuelLtrInput, setFuelLtrInput] = useState<string>('');
  const [rateInput, setRateInput] = useState<string>('');
  const [takaInput, setTakaInput] = useState<string>('');

  const [serviceNameInput, setServiceNameInput] = useState<string>('');
  const [servicePriceInput, setServicePriceInput] = useState<string>('');
  const [serviceItems, setServiceItems] = useState<PurchasedPartItem[]>([]);

  const [showItemSubForm, setShowItemSubForm] = useState<boolean>(false);
  const [partNameInput, setPartNameInput] = useState<string>('');
  const [partBrandInput, setPartBrandInput] = useState<string>('');
  const [partQtyInput, setPartQtyInput] = useState<string>('1');
  const [partPriceInput, setPartPriceInput] = useState<string>('');

  const handleBackPress = useCallback(() => {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      // Fallback below
    }
    router.replace('/');
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [raw, rawItems] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SAVED_ITEMS_KEY),
        ]);

        if (!isMounted) return;

        if (raw) {
          const parsed = JSON.parse(raw) as Partial<VehicleStoreData>;
          const loadedVehicles = Array.isArray(parsed.vehicles)
            ? parsed.vehicles
            : [];
          const activeId =
            parsed.selectedVehicleId &&
            loadedVehicles.some((v) => v.id === parsed.selectedVehicleId)
              ? parsed.selectedVehicleId
              : (loadedVehicles[0]?.id ?? null);

          setStore({
            vehicles: loadedVehicles,
            selectedVehicleId: activeId,
            pendingFuelByVehicle:
              parsed.pendingFuelByVehicle &&
              typeof parsed.pendingFuelByVehicle === 'object'
                ? parsed.pendingFuelByVehicle
                : {},
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
          });
        }

        if (rawItems) {
          const parsedItems = JSON.parse(rawItems);
          if (Array.isArray(parsedItems)) {
            setSavedItemMemory(parsedItems);
          }
        }
      } catch (e) {
        console.log('Failed to load vehicle log data:', e);
      }
    };
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
      if (cancelPendingTimerRef.current) {
        clearInterval(cancelPendingTimerRef.current);
      }
    };
  }, []);

  const saveStore = useCallback(async (next: VehicleStoreData) => {
    setStore(next);
    try {
      await saveLocalData(STORAGE_KEY, next);
    } catch (e) {
      console.log('Failed to save vehicle log data:', e);
    }
  }, []);

  const persistSavedItemMemory = useCallback(
    async (items: SavedItemTemplate[]) => {
      setSavedItemMemory(items);
      try {
        await saveLocalData(SAVED_ITEMS_KEY, items);
      } catch (e) {
        console.log('Failed to save item memory:', e);
      }
    },
    []
  );

  const recordItemToMemory = useCallback(
    async (part: PurchasedPartItem) => {
      const keyName = part.name.trim().toLowerCase();
      const keyBrand = (part.brand || '').trim().toLowerCase();
      const filtered = savedItemMemory.filter(
        (m) =>
          !(
            m.name.trim().toLowerCase() === keyName &&
            (m.brand || '').trim().toLowerCase() === keyBrand
          )
      );
      const nextMemory: SavedItemTemplate[] = [
        {
          name: part.name.trim(),
          brand: part.brand?.trim() || undefined,
          quantity: part.quantity,
          price: part.price,
          usedAt: Date.now(),
        },
        ...filtered,
      ].slice(0, 30);
      await persistSavedItemMemory(nextMemory);
    },
    [savedItemMemory, persistSavedItemMemory]
  );

  const openDatePicker = (target: 'entry' | 'finish', currentStr: string) => {
    const parsed = parseDDMMYYYY(currentStr) || new Date();
    setDatePickerTarget(target);
    setPickerYear(parsed.getFullYear());
    setPickerMonth(parsed.getMonth() + 1);
    setPickerDay(parsed.getDate());
    setDatePickerVisible(true);
  };

  const handleConfirmPickedDate = () => {
    const maxDay = getDaysInMonth(pickerMonth, pickerYear);
    const safeDay = Math.min(pickerDay, maxDay);
    const formatted = formatDateParts(safeDay, pickerMonth, pickerYear);
    if (datePickerTarget === 'finish') {
      setFinishDateInput(formatted);
    } else {
      setDateInput(formatted);
    }
    setDatePickerVisible(false);
  };

  const activeVehicle = useMemo(() => {
    if (!store.selectedVehicleId) return null;
    return (
      store.vehicles.find((v) => v.id === store.selectedVehicleId) || null
    );
  }, [store.vehicles, store.selectedVehicleId]);

  const activePendingFuel = useMemo(() => {
    if (!activeVehicle) return null;
    return store.pendingFuelByVehicle[activeVehicle.id] || null;
  }, [store.pendingFuelByVehicle, activeVehicle]);

  const vehicleEntries = useMemo(() => {
    if (!activeVehicle) return [];
    return store.entries.filter((e) => e.vehicleId === activeVehicle.id);
  }, [store.entries, activeVehicle]);

  const handleSelectVehicle = async (vehicleId: string) => {
    await saveStore({
      ...store,
      selectedVehicleId: vehicleId,
    });
  };

  const openAddVehicleModal = () => {
    setEditingVehicleId(null);
    setVehNameInput('');
    setVehCategoryInput('Bike');
    setVehCustomCategoryInput('');
    setVehRegNoInput('');
    setVehicleModalVisible(true);
  };

  const openEditVehicleModal = (vehicle: VehicleProfile) => {
    setEditingVehicleId(vehicle.id);
    setVehNameInput(vehicle.name);
    setVehCategoryInput(vehicle.category);
    setVehCustomCategoryInput(vehicle.customCategory || '');
    setVehRegNoInput(vehicle.regNo || '');
    setVehicleModalVisible(true);
  };

  const handleSaveVehicle = async () => {
    const cleanName = vehNameInput.trim();
    if (!cleanName) {
      Alert.alert(
        'তথ্য অসম্পূর্ণ',
        'অনুগ্রহ করে গাড়ির নাম লিখুন (যেমন: Pulsar 150, Corolla)।'
      );
      return;
    }
    if (vehCategoryInput === 'Other' && !vehCustomCategoryInput.trim()) {
      Alert.alert(
        'তথ্য অসম্পূর্ণ',
        'Other সিলেক্ট করলে গাড়ির ধরন লিখুন।'
      );
      return;
    }

    const updatedVehicle: VehicleProfile = {
      id:
        editingVehicleId ||
        `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      category: vehCategoryInput,
      customCategory:
        vehCategoryInput === 'Other'
          ? vehCustomCategoryInput.trim()
          : undefined,
      regNo: vehRegNoInput.trim() || undefined,
    };

    await saveStore({
      ...store,
      vehicles: editingVehicleId
        ? store.vehicles.map((vehicle) =>
            vehicle.id === editingVehicleId ? updatedVehicle : vehicle
          )
        : [...store.vehicles, updatedVehicle],
      selectedVehicleId: editingVehicleId
        ? store.selectedVehicleId
        : updatedVehicle.id,
    });

    setVehNameInput('');
    setVehCategoryInput('Bike');
    setVehCustomCategoryInput('');
    setVehRegNoInput('');
    setVehicleModalVisible(false);
  };

  const handleDeleteActiveVehicle = () => {
    if (!activeVehicle) return;
    const hasEntries = store.entries.some(
      (entry) => entry.vehicleId === activeVehicle.id
    );
    const hasPendingReading = Boolean(
      store.pendingFuelByVehicle[activeVehicle.id]
    );
    if (hasEntries || hasPendingReading) {
      Alert.alert(
        'Vehicle has records',
        'Delete this vehicle’s fuel and maintenance records and pending reading first.'
      );
      return;
    }

    Alert.alert('Delete Vehicle', `Delete ${activeVehicle.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const vehicles = store.vehicles.filter(
            (vehicle) => vehicle.id !== activeVehicle.id
          );
          void saveStore({
            ...store,
            vehicles,
            selectedVehicleId: vehicles[0]?.id ?? null,
          });
        },
      },
    ]);
  };

  const openFinishReadingModal = () => {
    if (!activeVehicle) return;
    setFinishDateInput(activePendingFuel?.date || getTodayDDMMYYYY());
    setFinishReadingInput(
      activePendingFuel !== null ? String(activePendingFuel.reading) : ''
    );
    setFinishNotesInput(activePendingFuel?.notes || '');
    setFinishModalVisible(true);
  };

  const handleSaveFinishReading = async () => {
    if (!activeVehicle) return;
    const cleanDate = finishDateInput.trim() || getTodayDDMMYYYY();
    if (!parseDDMMYYYY(cleanDate)) {
      Alert.alert(
        'তারিখ সঠিক নয়',
        'অনুগ্রহ করে DD/MM/YYYY ফরম্যাটে তারিখ লিখুন।'
      );
      return;
    }

    const parsedR = parseOptionalNum(finishReadingInput);
    if (parsedR === null || parsedR < 0) {
      Alert.alert(
        'রিডিং প্রয়োজন',
        'তেল শেষ বা রিজার্ভে পড়ার মিটার রিডিং (0 বা তার বেশি) লিখুন।'
      );
      return;
    }

    const pendingObj: PendingFuelReading = {
      id: activePendingFuel?.id || `pf-${Date.now()}`,
      date: cleanDate,
      reading: parsedR,
      notes: finishNotesInput.trim() || undefined,
      createdAt: Date.now(),
    };

    await saveStore({
      ...store,
      pendingFuelByVehicle: {
        ...store.pendingFuelByVehicle,
        [activeVehicle.id]: pendingObj,
      },
    });

    setFinishModalVisible(false);
  };

  const requestCancelPendingFinish = () => {
    if (!activeVehicle || !activePendingFuel) return;
    if (cancelPendingTimerRef.current) {
      clearInterval(cancelPendingTimerRef.current);
    }
    setCancelPendingModalVisible(true);
    setCancelPendingCooldown(2);
    cancelPendingTimerRef.current = setInterval(() => {
      setCancelPendingCooldown((prev) => {
        if (prev <= 1) {
          if (cancelPendingTimerRef.current) {
            clearInterval(cancelPendingTimerRef.current);
            cancelPendingTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const closeCancelPendingModal = () => {
    if (cancelPendingTimerRef.current) {
      clearInterval(cancelPendingTimerRef.current);
      cancelPendingTimerRef.current = null;
    }
    setCancelPendingModalVisible(false);
    setCancelPendingCooldown(0);
  };

  const handleConfirmClearPendingFinish = async () => {
    if (!activeVehicle || cancelPendingCooldown > 0) return;
    const vehId = activeVehicle.id;
    closeCancelPendingModal();
    await saveStore({
      ...store,
      pendingFuelByVehicle: {
        ...store.pendingFuelByVehicle,
        [vehId]: null,
      },
    });
  };

  const onFuelLtrChange = (text: string) => {
    setFuelLtrInput(text);
    const ltr = parseNum(text);
    const rate = parseNum(rateInput);
    if (ltr > 0 && rate > 0) {
      setTakaInput((ltr * rate).toFixed(2));
    }
  };

  const onRateChange = (text: string) => {
    setRateInput(text);
    const ltr = parseNum(fuelLtrInput);
    const rate = parseNum(text);
    if (ltr > 0 && rate > 0) {
      setTakaInput((ltr * rate).toFixed(2));
    }
  };

  const resetItemSubForm = () => {
    setPartNameInput('');
    setPartBrandInput('');
    setPartQtyInput('1');
    setPartPriceInput('');
    setShowItemSubForm(false);
  };

  const handleSelectMemoryItem = (tpl: SavedItemTemplate) => {
    setShowItemSubForm(true);
    setPartNameInput(tpl.name);
    setPartBrandInput(tpl.brand || '');
    setPartQtyInput(String(tpl.quantity || 1));
    setPartPriceInput(tpl.price > 0 ? String(tpl.price) : '');
  };

  const handleAddServiceItem = async () => {
    if (!partNameInput.trim()) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে Item-এর নাম লিখুন।');
      return;
    }
    const qty = Math.max(1, parseNum(partQtyInput) || 1);
    const price = parseNum(partPriceInput);
    if (price <= 0) {
      Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে Item-এর দাম (Price) লিখুন।');
      return;
    }

    const newPart: PurchasedPartItem = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: partNameInput.trim(),
      brand: partBrandInput.trim() || undefined,
      quantity: qty,
      price: Math.round(price * 100) / 100,
    };

    setServiceItems((prev) => [...prev, newPart]);
    await recordItemToMemory(newPart);
    resetItemSubForm();
  };

  const handleRemoveServiceItem = (partId: string) => {
    setServiceItems((prev) => prev.filter((p) => p.id !== partId));
  };

  const openAddModal = (defaultKind: EntryKind = 'fuel') => {
    if (!activeVehicle) return;
    setEditingId(null);
    setKind(defaultKind);

    const lastFuel = [...vehicleEntries]
      .reverse()
      .find((e) => e.kind === 'fuel');
    if (defaultKind === 'fuel' && activePendingFuel) {
      setDateInput(activePendingFuel.date || getTodayDDMMYYYY());
      setReadingInput(String(activePendingFuel.reading));
      setNotesInput(activePendingFuel.notes || '');
    } else {
      setDateInput(getTodayDDMMYYYY());
      setReadingInput('');
      setNotesInput('');
    }

    setFuelLtrInput('');
    setRateInput(
      lastFuel && lastFuel.ratePerLitre > 0 ? String(lastFuel.ratePerLitre) : ''
    );
    setTakaInput('');

    setServiceNameInput('');
    setServicePriceInput('');
    setServiceItems([]);
    resetItemSubForm();

    setModalVisible(true);
  };

  const openEditModal = (item: VehicleLogEntry) => {
    setEditingId(item.id);
    setKind(item.kind);
    setDateInput(item.date);
    const hasR =
      item.hasReading !== undefined ? item.hasReading : item.reading > 0;
    setReadingInput(hasR ? String(item.reading) : '');
    setFuelLtrInput(item.fuelLtr > 0 ? String(item.fuelLtr) : '');
    setRateInput(item.ratePerLitre > 0 ? String(item.ratePerLitre) : '');
    setTakaInput(item.taka > 0 ? String(item.taka) : '');

    setServiceNameInput(item.serviceName || '');
    setServicePriceInput(
      item.serviceCharge > 0 ? String(item.serviceCharge) : ''
    );
    setServiceItems(
      Array.isArray(item.purchasedItems) ? item.purchasedItems : []
    );
    resetItemSubForm();
    setNotesInput(item.notes || '');

    setModalVisible(true);
  };

  const serviceItemsTotal = useMemo(() => {
    return serviceItems.reduce((sum, item) => sum + item.price, 0);
  }, [serviceItems]);

  const handleSave = async () => {
    if (!activeVehicle) return;
    const cleanDate = dateInput.trim() || getTodayDDMMYYYY();
    if (!parseDDMMYYYY(cleanDate)) {
      Alert.alert(
        'তারিখ সঠিক নয়',
        'অনুগ্রহ করে DD/MM/YYYY ফরম্যাটে তারিখ লিখুন (যেমন: 22/11/2026)।'
      );
      return;
    }

    if (kind === 'fuel') {
      const parsedReading = parseOptionalNum(readingInput);
      const hasReading = parsedReading !== null && parsedReading >= 0;
      const reading = hasReading ? parsedReading : 0;

      let ltr = parseNum(fuelLtrInput);
      const rate = parseNum(rateInput);
      let taka = parseNum(takaInput);

      if (taka <= 0 && ltr > 0 && rate > 0) {
        taka = Math.round(ltr * rate * 100) / 100;
      } else if (ltr <= 0 && taka > 0 && rate > 0) {
        ltr = Math.round((taka / rate) * 100) / 100;
      }

      if (taka <= 0) {
        Alert.alert(
          'তথ্য অসম্পূর্ণ',
          'অনুগ্রহ করে Fuel (Ltr) বা Taka লিখুন।'
        );
        return;
      }

      const existingEntry = editingId
        ? store.entries.find((e) => e.id === editingId)
        : undefined;

      const finishDate =
        !editingId && activePendingFuel
          ? activePendingFuel.date
          : existingEntry?.finishDate;
      const finishReading =
        !editingId && activePendingFuel
          ? activePendingFuel.reading
          : existingEntry?.finishReading;
      const hasFinishReading =
        !editingId && activePendingFuel
          ? true
          : (existingEntry?.hasFinishReading ?? finishReading !== undefined);

      const record: VehicleLogEntry = {
        id: editingId || `vlog-${Date.now()}`,
        vehicleId: activeVehicle.id,
        kind: 'fuel',
        date: cleanDate,
        finishDate,
        finishReading,
        hasFinishReading,
        reading,
        hasReading,
        fuelLtr: Math.round(ltr * 100) / 100,
        ratePerLitre: Math.round(rate * 100) / 100,
        taka: Math.round(taka * 100) / 100,
        serviceName: '',
        serviceCharge: 0,
        purchasedItems: [],
        notes: notesInput.trim() || undefined,
        createdAt: existingEntry ? existingEntry.createdAt : Date.now(),
      };

      const nextEntries = editingId
        ? store.entries.map((e) => (e.id === editingId ? record : e))
        : [...store.entries, record];

      nextEntries.sort((a, b) => {
        const da = parseDDMMYYYY(a.date)?.getTime() || 0;
        const db = parseDDMMYYYY(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return a.createdAt - b.createdAt;
      });

      const nextPending = { ...store.pendingFuelByVehicle };
      if (!editingId && activePendingFuel) {
        nextPending[activeVehicle.id] = null;
      }

      await saveStore({
        ...store,
        entries: nextEntries,
        pendingFuelByVehicle: nextPending,
      });
      setModalVisible(false);
    } else {
      if (!serviceNameInput.trim()) {
        Alert.alert('তথ্য অসম্পূর্ণ', 'অনুগ্রহ করে Service Name লিখুন।');
        return;
      }
      const srvCharge = parseNum(servicePriceInput);
      const totalServiceCost =
        Math.round((srvCharge + serviceItemsTotal) * 100) / 100;

      if (totalServiceCost <= 0) {
        Alert.alert(
          'তথ্য অসম্পূর্ণ',
          'অনুগ্রহ করে সার্ভিস প্রাইস অথবা কেনা আইটেমের দাম লিখুন।'
        );
        return;
      }

      const existingEntry = editingId
        ? store.entries.find((e) => e.id === editingId)
        : undefined;

      const record: VehicleLogEntry = {
        id: editingId || `vlog-${Date.now()}`,
        vehicleId: activeVehicle.id,
        kind: 'maintenance',
        date: cleanDate,
        reading: 0,
        hasReading: false,
        fuelLtr: 0,
        ratePerLitre: 0,
        taka: 0,
        serviceName: serviceNameInput.trim(),
        serviceCharge: Math.round(srvCharge * 100) / 100,
        purchasedItems: serviceItems,
        notes: notesInput.trim() || undefined,
        createdAt: existingEntry ? existingEntry.createdAt : Date.now(),
      };

      for (const part of serviceItems) {
        await recordItemToMemory(part);
      }

      const nextEntries = editingId
        ? store.entries.map((e) => (e.id === editingId ? record : e))
        : [...store.entries, record];

      nextEntries.sort((a, b) => {
        const da = parseDDMMYYYY(a.date)?.getTime() || 0;
        const db = parseDDMMYYYY(b.date)?.getTime() || 0;
        if (da !== db) return da - db;
        return a.createdAt - b.createdAt;
      });

      await saveStore({
        ...store,
        entries: nextEntries,
      });
      setModalVisible(false);
    }
  };

  const requestDeleteEntry = (item: VehicleLogEntry) => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
    setDeleteTarget(item);
    setDeleteChecked(false);
    setDeleteCooldown(3);

    cooldownTimerRef.current = setInterval(() => {
      setDeleteCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const closeDeleteModal = () => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    setDeleteTarget(null);
    setDeleteChecked(false);
    setDeleteCooldown(0);
  };

  const confirmDeleteEntry = async () => {
    if (!deleteTarget || !deleteChecked || deleteCooldown > 0) return;
    const targetId = deleteTarget.id;
    closeDeleteModal();
    await saveStore({
      ...store,
      entries: store.entries.filter((e) => e.id !== targetId),
    });
  };

  const entryHasValidReading = (e: VehicleLogEntry): boolean => {
    if (e.kind !== 'fuel') return false;
    if (e.hasReading !== undefined) return e.hasReading;
    return e.reading > 0;
  };

  const getEffectiveReading = (e: VehicleLogEntry): number | null => {
    if (e.kind !== 'fuel') return null;
    if (
      e.hasFinishReading &&
      typeof e.finishReading === 'number' &&
      e.finishReading >= 0
    ) {
      return e.finishReading;
    }
    return entryHasValidReading(e) ? e.reading : null;
  };

  const getEffectiveDate = (e: VehicleLogEntry): string => {
    if (e.hasFinishReading && e.finishDate) {
      return e.finishDate;
    }
    return e.date;
  };

  const { displayRows, averageSummary, targetInfo } = useMemo(() => {
    const fuelEntries = vehicleEntries.filter((e) => e.kind === 'fuel');
    const prevFuelById = new Map<string, VehicleLogEntry>();
    for (let i = 1; i < fuelEntries.length; i++) {
      prevFuelById.set(fuelEntries[i].id, fuelEntries[i - 1]);
    }

    const rowsWithCalc: ComputedRow[] = vehicleEntries.map((entry) => {
      const itemsTotalCost = Array.isArray(entry.purchasedItems)
        ? entry.purchasedItems.reduce((s, it) => s + parseNum(it.price), 0)
        : 0;

      if (entry.kind !== 'fuel') {
        return {
          entry,
          usage: null,
          days: null,
          kmPerDay: null,
          mileage: null,
          costPerDay: null,
          costPerKm: null,
          itemsTotalCost,
        };
      }

      const prev = prevFuelById.get(entry.id) || null;
      const prevR = prev ? getEffectiveReading(prev) : null;
      const currR = getEffectiveReading(entry);

      const canCalcUsage = prevR !== null && currR !== null && currR >= prevR;

      const usage = canCalcUsage ? currR - prevR : null;
      const prevDateStr = prev ? getEffectiveDate(prev) : null;
      const currDateStr = getEffectiveDate(entry);
      const days = prevDateStr ? diffDaysBetween(prevDateStr, currDateStr) : null;

      const kmPerDay =
        usage !== null && days !== null && days > 0 ? usage / days : null;
      const fuelUsedForSegment =
        prev && prev.fuelLtr > 0 ? prev.fuelLtr : entry.fuelLtr;
      const fuelCostForSegment =
        prev && prev.taka > 0 ? prev.taka : entry.taka;

      const mileage =
        usage !== null && fuelUsedForSegment > 0
          ? usage / fuelUsedForSegment
          : null;
      const costPerDay =
        days !== null && days > 0 ? fuelCostForSegment / days : null;
      const costPerKm =
        usage !== null && usage > 0 ? fuelCostForSegment / usage : null;

      return {
        entry,
        usage,
        days,
        kmPerDay,
        mileage,
        costPerDay,
        costPerKm,
        itemsTotalCost,
      };
    });

    const effectiveReadings = fuelEntries
      .map((e) => getEffectiveReading(e))
      .filter((r): r is number => r !== null);

    const firstReading =
      effectiveReadings.length > 0 ? effectiveReadings[0] : null;
    const lastReading =
      effectiveReadings.length > 0
        ? effectiveReadings[effectiveReadings.length - 1]
        : null;
    const totalReadingDiff =
      firstReading !== null &&
      lastReading !== null &&
      effectiveReadings.length >= 2
        ? Math.max(0, lastReading - firstReading)
        : null;

    const readingRangeText =
      firstReading === null || lastReading === null
        ? '-'
        : effectiveReadings.length === 1
          ? `${firstReading}`
          : `${firstReading}-${lastReading}`;

    const totalFuelLtr = fuelEntries.reduce((s, e) => s + e.fuelLtr, 0);
    const fuelRates = fuelEntries
      .filter((e) => e.ratePerLitre > 0)
      .map((e) => e.ratePerLitre);
    const avgRate =
      fuelRates.length > 0
        ? fuelRates.reduce((a, b) => a + b, 0) / fuelRates.length
        : null;

    const totalFuelTaka = fuelEntries.reduce((s, e) => s + e.taka, 0);

    const totalServiceCharge = vehicleEntries.reduce(
      (s, e) =>
        s + (e.kind === 'maintenance' ? parseNum(e.serviceCharge) : 0),
      0
    );
    const totalItemsCost = rowsWithCalc.reduce(
      (s, r) => s + r.itemsTotalCost,
      0
    );

    const usageList = rowsWithCalc
      .map((r) => r.usage)
      .filter((v): v is number => v !== null);
    const totalUsage = usageList.reduce((a, b) => a + b, 0);

    const daysList = rowsWithCalc
      .map((r) => r.days)
      .filter((v): v is number => v !== null);
    const totalDays = daysList.reduce((a, b) => a + b, 0);

    const kmPerDayList = rowsWithCalc
      .map((r) => r.kmPerDay)
      .filter((v): v is number => v !== null);
    const avgKmPerDay =
      kmPerDayList.length > 0
        ? kmPerDayList.reduce((a, b) => a + b, 0) / kmPerDayList.length
        : null;

    const mileageList = rowsWithCalc
      .map((r) => r.mileage)
      .filter((v): v is number => v !== null);
    const avgMileage =
      mileageList.length > 0
        ? mileageList.reduce((a, b) => a + b, 0) / mileageList.length
        : null;

    const costPerDayList = rowsWithCalc
      .map((r) => r.costPerDay)
      .filter((v): v is number => v !== null);
    const avgCostPerDay =
      costPerDayList.length > 0
        ? costPerDayList.reduce((a, b) => a + b, 0) / costPerDayList.length
        : null;

    const costPerKmList = rowsWithCalc
      .map((r) => r.costPerKm)
      .filter((v): v is number => v !== null);
    const avgCostPerKm =
      costPerKmList.length > 0
        ? costPerKmList.reduce((a, b) => a + b, 0) / costPerKmList.length
        : null;

    const lastFuelEntry =
      fuelEntries.length > 0 ? fuelEntries[fuelEntries.length - 1] : null;
    const lastRowCalc = lastFuelEntry
      ? rowsWithCalc.find((r) => r.entry.id === lastFuelEntry.id)
      : null;
    const referenceMileage =
      lastRowCalc?.mileage && lastRowCalc.mileage > 0
        ? lastRowCalc.mileage
        : avgMileage && avgMileage > 0
          ? avgMileage
          : null;

    const currentFuelQty = lastFuelEntry?.fuelLtr || 0;
    const baseReadingForTarget = activePendingFuel
      ? activePendingFuel.reading
      : lastFuelEntry
        ? getEffectiveReading(lastFuelEntry)
        : null;

    const estimatedRangeKm =
      currentFuelQty > 0 && referenceMileage !== null
        ? currentFuelQty * referenceMileage
        : null;
    const nextTargetReading =
      baseReadingForTarget !== null && estimatedRangeKm !== null
        ? Math.round(baseReadingForTarget + estimatedRangeKm)
        : null;

    const newestFirstRows = [...rowsWithCalc].reverse();

    return {
      displayRows: newestFirstRows,
      averageSummary: {
        readingRangeText,
        totalReadingDiff,
        totalFuelLtr: totalFuelLtr > 0 ? totalFuelLtr : null,
        avgRate,
        totalFuelTaka: totalFuelTaka > 0 ? totalFuelTaka : null,
        totalServiceCharge:
          totalServiceCharge > 0 ? totalServiceCharge : null,
        totalItemsCost: totalItemsCost > 0 ? totalItemsCost : null,
        totalUsage: totalUsage > 0 ? totalUsage : null,
        totalDays: totalDays > 0 ? totalDays : null,
        avgKmPerDay,
        avgMileage,
        avgCostPerDay,
        avgCostPerKm,
      },
      targetInfo: {
        baseReadingForTarget,
        currentFuelQty,
        referenceMileage,
        estimatedRangeKm,
        nextTargetReading,
      },
    };
  }, [vehicleEntries, activePendingFuel]);

  const canConfirmDelete = deleteChecked && deleteCooldown === 0;
  const maxPickerDays = getDaysInMonth(pickerMonth, pickerYear);
  const pickerDaysArray = Array.from({ length: maxPickerDays }, (_, i) => i + 1);
  const pickerMonthsArray = Array.from({ length: 12 }, (_, i) => i + 1);
  const currentYear = new Date().getFullYear();
  const pickerYearsArray = Array.from(
    { length: 12 },
    (_, i) => currentYear - 8 + i
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>
            {canManageVehicleData
              ? 'Manage Vehicle Records'
              : 'Vehicle Log & Expense Sheet'}
          </Text>
          <Text style={styles.headerSub}>
            {activeVehicle
              ? `${activeVehicle.name} (${formatVehicleType(activeVehicle)})`
              : 'কোনো Vehicle যোগ করা হয়নি'}
          </Text>
        </View>
      </View>

      {!activeVehicle ? (
        <View style={styles.emptyInitialState}>
          <View style={styles.emptyCard}>
            <Ionicons name="car-sport-outline" size={44} color="#1D4ED8" />
            <Text style={styles.emptyInitialTitle}>
              কোনো Vehicle যুক্ত করা নেই
            </Text>
            <Text style={styles.emptyInitialSub}>
              {canManageVehicleData
                ? 'No vehicle is available to manage. Add a vehicle from the Vehicle page.'
                : 'হিসাব শুরু করতে প্রথমে একটি Vehicle (Bike, Car বা Other) যোগ করুন।'}
            </Text>
            {!canManageVehicleData && (
              <TouchableOpacity
                style={styles.primaryAddVehicleBtn}
                onPress={openAddVehicleModal}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.primaryAddVehicleText}>Add Vehicle</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.vehicleBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
            >
              <View style={styles.vehicleChipsRow}>
                {store.vehicles.map((veh) => {
                  const isSelected = veh.id === activeVehicle.id;
                  return (
                    <TouchableOpacity
                      key={veh.id}
                      style={[
                        styles.vehicleChip,
                        isSelected && styles.vehicleChipActive,
                      ]}
                      onPress={() => void handleSelectVehicle(veh.id)}
                    >
                      <Ionicons
                        name={
                          veh.category === 'Car'
                            ? 'car-outline'
                            : veh.category === 'Bike' ||
                                veh.category === 'Scooty'
                              ? 'bicycle-outline'
                              : 'bus-outline'
                        }
                        size={15}
                        color={isSelected ? '#FFFFFF' : '#334155'}
                      />
                      <Text
                        style={[
                          styles.vehicleChipText,
                          isSelected && styles.vehicleChipTextActive,
                        ]}
                      >
                        {veh.name} • {formatVehicleType(veh)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {!canManageVehicleData && (
              <TouchableOpacity
                style={styles.addVehicleBtn}
                onPress={openAddVehicleModal}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={15}
                  color="#1D4ED8"
                />
                <Text style={styles.addVehicleBtnText}>+ Vehicle</Text>
              </TouchableOpacity>
            )}

            {canManageVehicleData && (
              <>
                <TouchableOpacity
                  style={styles.profileActionBtn}
                  onPress={() => openEditVehicleModal(activeVehicle)}
                  accessibilityLabel="Edit selected vehicle"
                >
                  <Ionicons name="create-outline" size={16} color="#1D4ED8" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileActionBtn}
                  onPress={handleDeleteActiveVehicle}
                  accessibilityLabel="Delete selected vehicle"
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </>
            )}
          </View>

          {activePendingFuel && (
            <View style={styles.pendingBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTitle}>
                  ⏳ Fuel Finish Reading: {activePendingFuel.reading} km (
                  {activePendingFuel.date})
                </Text>
                <Text style={styles.pendingSub}>
                  {canManageVehicleData
                    ? '"+ Fuel (Load)" চাপলে Date ও Reading দুটোই অটো বসে যাবে।'
                    : 'This pending reading can be used from Vehicle Management in Settings.'}
                </Text>
              </View>
              {canManageVehicleData && (
                <TouchableOpacity
                  onPress={requestCancelPendingFinish}
                  style={styles.pendingClearBtn}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={12}
                    color="#92400E"
                  />
                  <Text style={styles.pendingClearText}>বাতিল</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.targetCard}>
            <View style={styles.targetHeader}>
              <Ionicons name="flag" size={16} color="#FFFFFF" />
              <Text style={styles.targetTitle}>
                TARGET (পরবর্তী রিফুয়েলিং পূর্বাভাস)
              </Text>
            </View>
            {targetInfo.nextTargetReading !== null ? (
              <View style={styles.targetGrid}>
                <View style={styles.targetItem}>
                  <Text style={styles.targetLabel}>Current Fuel</Text>
                  <Text style={styles.targetVal}>
                    {targetInfo.currentFuelQty.toFixed(2)} Ltr
                  </Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={styles.targetLabel}>Prev. Milage</Text>
                  <Text style={styles.targetVal}>
                    {fmtFixed(targetInfo.referenceMileage, 2)} km/L
                  </Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={styles.targetLabel}>চলতে পারবে</Text>
                  <Text style={styles.targetVal}>
                    ~{fmtFixed(targetInfo.estimatedRangeKm, 1)} km
                  </Text>
                </View>
                <View style={[styles.targetItem, styles.targetHighlightBox]}>
                  <Text style={styles.targetHighlightLabel}>Target Reading</Text>
                  <Text style={styles.targetHighlightVal}>
                    {targetInfo.nextTargetReading} km
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.targetEmptyText}>
                কমপক্ষে ২টি Fuel এন্ট্রি (Reading সহ, ০ থেকে শুরু হলেও চলবে)
                দিলে আগের Milage ও বর্তমান তেলের ভিত্তিতে পরবর্তী Target Reading
                দেখাবে।
              </Text>
            )}
          </View>

          {canManageVehicleData && (
            <View style={styles.quickBar}>
              <TouchableOpacity
                style={styles.finishChip}
                onPress={openFinishReadingModal}
              >
                <Text style={styles.finishChipText}>
                  ⏱ Fuel Finish Reading
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => openAddModal('fuel')}
              >
                <Text style={styles.quickChipText}>+ Fuel (Load)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => openAddModal('maintenance')}
              >
                <Text style={styles.quickChipText}>+ Servicing</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            style={styles.verticalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableContainer}>
                <View style={[styles.tableRow, styles.avgRow]}>
                  <View style={[styles.cell, styles.colDate]}>
                    <Text style={styles.avgText}>AVERAGE &gt;&gt;</Text>
                  </View>
                  <View style={[styles.cell, styles.colReading]}>
                    <Text style={styles.avgText}>
                      {averageSummary.readingRangeText}
                    </Text>
                    {averageSummary.totalReadingDiff !== null && (
                      <Text style={styles.avgSubText}>
                        ({averageSummary.totalReadingDiff} km)
                      </Text>
                    )}
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.totalFuelLtr, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.avgRate, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.totalFuelTaka, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colService]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.totalServiceCharge, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colItem]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.totalItemsCost, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.totalUsage, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colDays]}>
                    <Text style={styles.avgText}>
                      {averageSummary.totalDays !== null
                        ? String(averageSummary.totalDays)
                        : '-'}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.avgKmPerDay, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.avgMileage, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.avgCostPerDay, 2)}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.avgText}>
                      {fmtFixed(averageSummary.avgCostPerKm, 2)}
                    </Text>
                  </View>
                  {canManageVehicleData && (
                    <View style={[styles.cell, styles.colAction]}>
                      <Text style={styles.avgText}>-</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.tableRow, styles.headerRow]}>
                  <View style={[styles.cell, styles.colDate]}>
                    <Text style={styles.headerText}>Date</Text>
                  </View>
                  <View style={[styles.cell, styles.colReading]}>
                    <Text style={styles.headerText}>Reading</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Fuel (Ltr)</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Rate/Litre</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Taka (Fuel)</Text>
                  </View>
                  <View style={[styles.cell, styles.colService]}>
                    <Text style={styles.headerText}>Service</Text>
                  </View>
                  <View style={[styles.cell, styles.colItem]}>
                    <Text style={styles.headerText}>Item / Parts</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Usage</Text>
                  </View>
                  <View style={[styles.cell, styles.colDays]}>
                    <Text style={styles.headerText}>Days</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Km/D</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Milage</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Cost/Day</Text>
                  </View>
                  <View style={[styles.cell, styles.colNum]}>
                    <Text style={styles.headerText}>Cost/Km</Text>
                  </View>
                  {canManageVehicleData && (
                    <View style={[styles.cell, styles.colAction]}>
                      <Text style={styles.headerText}>Action</Text>
                    </View>
                  )}
                </View>

                {displayRows.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>
                      {canManageVehicleData
                        ? 'কোনো এন্ট্রি নেই। Fuel Finish Reading, + Fuel (Load) বা + Servicing চাপুন।'
                        : 'No vehicle records are available.'}
                    </Text>
                  </View>
                ) : (
                  displayRows.map((row, index) => {
                    const { entry, itemsTotalCost } = row;
                    const effReading = getEffectiveReading(entry);
                    const effDate = getEffectiveDate(entry);
                    const isLatest = index === 0;
                    const itemsLabel =
                      entry.kind === 'maintenance' &&
                      entry.purchasedItems.length > 0
                        ? entry.purchasedItems
                            .map(
                              (p) =>
                                `${p.name}${p.brand ? ` (${p.brand})` : ''} x${p.quantity}: ${p.price.toFixed(2)}`
                            )
                            .join(', ')
                        : '-';

                    return (
                      <View
                        key={entry.id}
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.zebraRow,
                          entry.kind === 'maintenance' && styles.nonFuelRow,
                          isLatest && styles.latestRowHighlight,
                        ]}
                      >
                        <View style={[styles.cell, styles.colDate]}>
                          <Text style={styles.cellText}>{effDate}</Text>
                          {isLatest && (
                            <Text style={styles.latestBadge}>বর্তমান</Text>
                          )}
                        </View>
                        <View style={[styles.cell, styles.colReading]}>
                          <Text style={styles.cellTextNum}>
                            {effReading !== null ? String(effReading) : '-'}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {entry.fuelLtr > 0
                              ? fmtFixed(entry.fuelLtr, 2)
                              : '-'}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {entry.ratePerLitre > 0
                              ? fmtFixed(entry.ratePerLitre, 2)
                              : '-'}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text
                            style={[styles.cellTextNum, { fontWeight: '700' }]}
                          >
                            {entry.kind === 'fuel' && entry.taka > 0
                              ? fmtFixed(entry.taka, 2)
                              : '-'}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colService]}>
                          {entry.kind === 'maintenance' ? (
                            <Text style={styles.cellTextLeft} numberOfLines={2}>
                              🔧 {entry.serviceName}
                              {entry.serviceCharge > 0
                                ? ` (${entry.serviceCharge.toFixed(2)})`
                                : ''}
                            </Text>
                          ) : (
                            <Text style={styles.cellText}>-</Text>
                          )}
                        </View>
                        <View style={[styles.cell, styles.colItem]}>
                          {entry.kind === 'maintenance' &&
                          itemsTotalCost > 0 ? (
                            <Text style={styles.cellTextLeft} numberOfLines={2}>
                              {itemsLabel}
                            </Text>
                          ) : (
                            <Text style={styles.cellText}>-</Text>
                          )}
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {fmtFixed(row.usage, 2)}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colDays]}>
                          <Text style={styles.cellTextNum}>
                            {row.days !== null ? String(row.days) : '-'}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {fmtFixed(row.kmPerDay, 2)}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {fmtFixed(row.mileage, 2)}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {fmtFixed(row.costPerDay, 2)}
                          </Text>
                        </View>
                        <View style={[styles.cell, styles.colNum]}>
                          <Text style={styles.cellTextNum}>
                            {fmtFixed(row.costPerKm, 2)}
                          </Text>
                        </View>
                        {canManageVehicleData && (
                          <View
                            style={[
                              styles.cell,
                              styles.colAction,
                              styles.actionCell,
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => openEditModal(entry)}
                            >
                              <Ionicons
                                name="create-outline"
                                size={16}
                                color="#2563EB"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => requestDeleteEntry(entry)}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color="#DC2626"
                              />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </ScrollView>
        </>
      )}

      <Modal
        visible={cancelPendingModalVisible}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.deleteHeaderRow}>
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color="#D97706"
              />
              <Text style={[styles.deleteModalTitle, { color: '#92400E' }]}>
                Pending Finish Reading বাতিল করবেন?
              </Text>
            </View>
            <Text style={styles.deleteWarningText}>
              ভুল চাপে যেন মুছে না যায় সেজন্য নিশ্চিত করুন। বাতিল করলে সেভ করা
              Finish Reading ({activePendingFuel?.reading} km) মুছে যাবে।
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={closeCancelPendingModal}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  রাখুন
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={cancelPendingCooldown > 0}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor:
                      cancelPendingCooldown > 0 ? '#FCD34D' : '#D97706',
                  },
                ]}
                onPress={() => void handleConfirmClearPendingFinish()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {cancelPendingCooldown > 0
                    ? `অপেক্ষা করুন (${cancelPendingCooldown}s)`
                    : 'হ্যাঁ, বাতিল করুন'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={datePickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              📅 তারিখ নির্বাচন করুন (DD/MM/YYYY)
            </Text>

            <View style={styles.pickerColsRow}>
              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>দিন</Text>
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {pickerDaysArray.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.pickerOption,
                        pickerDay === d && styles.pickerOptionActive,
                      ]}
                      onPress={() => setPickerDay(d)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          pickerDay === d && styles.pickerOptionTextActive,
                        ]}
                      >
                        {String(d).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>মাস</Text>
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {pickerMonthsArray.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.pickerOption,
                        pickerMonth === m && styles.pickerOptionActive,
                      ]}
                      onPress={() => setPickerMonth(m)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          pickerMonth === m && styles.pickerOptionTextActive,
                        ]}
                      >
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.pickerCol}>
                <Text style={styles.pickerColLabel}>বছর</Text>
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {pickerYearsArray.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={[
                        styles.pickerOption,
                        pickerYear === y && styles.pickerOptionActive,
                      ]}
                      onPress={() => setPickerYear(y)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          pickerYear === y && styles.pickerOptionTextActive,
                        ]}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={() => setDatePickerVisible(false)}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  বাতিল
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleConfirmPickedDate}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  তারিখ বসান
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={finishModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                ⏱ Fuel Finish Reading সেভ করুন
              </Text>
              <Text style={styles.helperNote}>
                তেল শেষ হওয়ার Date ও Reading সেভ করে রাখুন। পরে &ldquo;+ Fuel
                (Load)&rdquo; খুললে Date ও Reading দুটোই অটো বসে যাবে।
              </Text>

              <Text style={styles.label}>Date (DD/MM/YYYY)</Text>
              <View style={styles.dateInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={finishDateInput}
                  onChangeText={setFinishDateInput}
                  placeholder="22/11/2026"
                />
                <TouchableOpacity
                  style={styles.pickDateBtn}
                  onPress={() => openDatePicker('finish', finishDateInput)}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color="#1D4ED8"
                  />
                  <Text style={styles.pickDateBtnText}>Pick Date</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: 12 }]}>
                Meter Reading (0 বা তার বেশি) *
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={finishReadingInput}
                onChangeText={setFinishReadingInput}
                placeholder="যেমন: 6265"
              />

              <Text style={styles.label}>নোট (ঐচ্ছিক)</Text>
              <TextInput
                style={styles.input}
                value={finishNotesInput}
                onChangeText={setFinishNotesInput}
                placeholder="যেমন: Reserve-e porlo"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => setFinishModalVisible(false)}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>
                    বাতিল
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#D97706' }]}
                  onPress={() => void handleSaveFinishReading()}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                    Reading সেভ করুন
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={vehicleModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                {editingVehicleId ? 'Edit Vehicle' : 'নতুন Vehicle যোগ করুন'}
              </Text>

              <Text style={styles.label}>Vehicle Name *</Text>
              <TextInput
                style={styles.input}
                value={vehNameInput}
                onChangeText={setVehNameInput}
                placeholder="যেমন: Apache RTR, Toyota Allion"
              />

              <Text style={styles.label}>ধরন (Bike / Car / Other)</Text>
              <View style={styles.catChipsWrap}>
                {VEHICLE_CATEGORIES.map((cat) => {
                  const active = vehCategoryInput === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => setVehCategoryInput(cat)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          active && styles.catChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {vehCategoryInput === 'Other' && (
                <>
                  <Text style={styles.label}>অন্য ধরন লিখুন *</Text>
                  <TextInput
                    style={styles.input}
                    value={vehCustomCategoryInput}
                    onChangeText={setVehCustomCategoryInput}
                    placeholder="যেমন: CNG, Microbus, Boat"
                  />
                </>
              )}

              <Text style={styles.label}>রেজিস্ট্রেশন / নম্বর (ঐচ্ছিক)</Text>
              <TextInput
                style={styles.input}
                value={vehRegNoInput}
                onChangeText={setVehRegNoInput}
                placeholder="যেমন: Rajshahi Metro-La-12-3456"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => setVehicleModalVisible(false)}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>
                    বাতিল
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => void handleSaveVehicle()}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                    {editingVehicleId ? 'Save Vehicle' : 'Vehicle যোগ করুন'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.deleteHeaderRow}>
              <Ionicons name="warning-outline" size={22} color="#DC2626" />
              <Text style={styles.deleteModalTitle}>
                ডিলিট নিশ্চিতকরণ (সতর্কতা)
              </Text>
            </View>

            <Text style={styles.deleteWarningText}>
              এই এন্ট্রিটি মুছে ফেললে হিসাবের Usage, Days ও গড় মান পরিবর্তন হতে
              পারে এবং এটি ফিরিয়ে আনা যাবে না।
            </Text>

            {deleteTarget && (
              <View style={styles.deletePreviewBox}>
                <Text style={styles.deletePreviewLine}>
                  তারিখ: {getEffectiveDate(deleteTarget)}
                </Text>
                {deleteTarget.kind === 'fuel' ? (
                  <>
                    <Text style={styles.deletePreviewLine}>
                      রিডিং: {getEffectiveReading(deleteTarget) ?? '-'} | জ্বালানি:{' '}
                      {deleteTarget.fuelLtr} Ltr
                    </Text>
                    <Text style={styles.deletePreviewLine}>
                      টাকা: ৳{deleteTarget.taka.toFixed(2)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.deletePreviewLine}>
                      সার্ভিস: {deleteTarget.serviceName}
                    </Text>
                    <Text style={styles.deletePreviewLine}>
                      সার্ভিস + পার্টস: ৳
                      {(
                        deleteTarget.serviceCharge +
                        (deleteTarget.purchasedItems || []).reduce(
                          (s, p) => s + p.price,
                          0
                        )
                      ).toFixed(2)}
                    </Text>
                  </>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.deleteCheckRow}
              onPress={() => setDeleteChecked((v) => !v)}
            >
              <Ionicons
                name={deleteChecked ? 'checkbox' : 'square-outline'}
                size={22}
                color="#DC2626"
              />
              <Text style={styles.deleteCheckLabel}>
                আমি বুঝতে পারছি এবং এই এন্ট্রিটি স্থায়ীভাবে ডিলিট করতে চাই
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                onPress={closeDeleteModal}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>
                  বাতিল
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canConfirmDelete}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: canConfirmDelete ? '#DC2626' : '#FCA5A5',
                  },
                ]}
                onPress={() => void confirmDeleteEntry()}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {deleteCooldown > 0
                    ? `অপেক্ষা করুন (${deleteCooldown}s)`
                    : 'স্থায়ীভাবে ডিলিট'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={styles.modalTitle}>
                {editingId ? 'এন্ট্রি আপডেট করুন' : 'নতুন হিসাব যোগ করুন'}
              </Text>

              <Text style={styles.label}>ধরন নির্বাচন করুন</Text>
              <View style={styles.kindRow}>
                {(
                  [
                    { id: 'fuel', label: '⛽ Fuel Load' },
                    { id: 'maintenance', label: '🔧 Servicing' },
                  ] as const
                ).map((k) => (
                  <TouchableOpacity
                    key={k.id}
                    style={[styles.kindBtn, kind === k.id && styles.kindBtnActive]}
                    onPress={() => setKind(k.id)}
                  >
                    <Text
                      style={[
                        styles.kindBtnText,
                        kind === k.id && styles.kindBtnTextActive,
                      ]}
                    >
                      {k.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {kind === 'fuel' ? (
                <>
                  {!editingId && activePendingFuel && (
                    <Text style={styles.autoFillNote}>
                      ✓ Finish Reading ({activePendingFuel.reading} km) ও Date (
                      {activePendingFuel.date}) অটো বসানো হয়েছে।
                    </Text>
                  )}

                  <Text style={styles.label}>Fuel Load Date (DD/MM/YYYY)</Text>
                  <View style={styles.dateInputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={dateInput}
                      onChangeText={setDateInput}
                      placeholder="22/11/2026"
                    />
                    <TouchableOpacity
                      style={styles.pickDateBtn}
                      onPress={() => openDatePicker('entry', dateInput)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#1D4ED8"
                      />
                      <Text style={styles.pickDateBtnText}>Pick Date</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>
                    Reading (0 বা তার বেশি)
                  </Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={readingInput}
                    onChangeText={setReadingInput}
                    placeholder="0 বা 6265"
                  />

                  <View style={styles.rowGap}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Fuel (Ltr)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={fuelLtrInput}
                        onChangeText={onFuelLtrChange}
                        placeholder="2.89"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Rate/Litre</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={rateInput}
                        onChangeText={onRateChange}
                        placeholder="122.00"
                      />
                    </View>
                  </View>

                  <Text style={styles.label}>Taka (মোট টাকা)</Text>
                  <TextInput
                    style={[styles.input, { fontWeight: '700' }]}
                    keyboardType="numeric"
                    value={takaInput}
                    onChangeText={setTakaInput}
                    placeholder="250.00"
                  />

                  <Text style={styles.label}>নোট (ঐচ্ছিক)</Text>
                  <TextInput
                    style={styles.input}
                    value={notesInput}
                    onChangeText={setNotesInput}
                    placeholder="পাম্পের নাম বা তথ্য..."
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Date (DD/MM/YYYY)</Text>
                  <View style={styles.dateInputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={dateInput}
                      onChangeText={setDateInput}
                      placeholder="22/11/2026"
                    />
                    <TouchableOpacity
                      style={styles.pickDateBtn}
                      onPress={() => openDatePicker('entry', dateInput)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#1D4ED8"
                      />
                      <Text style={styles.pickDateBtnText}>Pick Date</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>
                    Service Name
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={serviceNameInput}
                    onChangeText={setServiceNameInput}
                    placeholder="যেমন: Full Servicing, Engine Oil Change"
                  />

                  <Text style={styles.label}>Price (সার্ভিস চার্জ - Tk.)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={servicePriceInput}
                    onChangeText={setServicePriceInput}
                    placeholder="যেমন: 500"
                  />

                  <View style={styles.itemsSection}>
                    <View style={styles.itemsHeader}>
                      <Text style={styles.itemsSectionTitle}>
                        কেনা যন্ত্রাংশ / Items ({serviceItems.length})
                      </Text>
                      {!showItemSubForm && (
                        <TouchableOpacity
                          style={styles.addItemBtn}
                          onPress={() => setShowItemSubForm(true)}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={16}
                            color="#FFFFFF"
                          />
                          <Text style={styles.addItemBtnText}>Add Item</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {savedItemMemory.length > 0 && (
                      <View style={styles.memoryBox}>
                        <Text style={styles.memoryTitle}>
                          আগের Item তালিকা (যেকোনো জায়গায় ক্লিক করলে অটো বসবে):
                        </Text>
                        {savedItemMemory.slice(0, 8).map((tpl, idx) => (
                          <TouchableOpacity
                            key={`${tpl.name}-${tpl.brand || ''}-${idx}`}
                            style={styles.memoryRow}
                            activeOpacity={0.7}
                            onPress={() => handleSelectMemoryItem(tpl)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.memoryItemName}>
                                {tpl.name} {tpl.brand ? `(${tpl.brand})` : ''}
                              </Text>
                              <Text style={styles.memoryItemSub}>
                                Qty: {tpl.quantity} • ৳{tpl.price.toFixed(2)}
                              </Text>
                            </View>
                            <Ionicons
                              name="arrow-down-circle-outline"
                              size={18}
                              color="#1D4ED8"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {serviceItems.map((part) => (
                      <View key={part.id} style={styles.partRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.partNameText}>
                            {part.name} {part.brand ? `(${part.brand})` : ''}
                          </Text>
                          <Text style={styles.partMetaText}>
                            Qty: {part.quantity} • Price: ৳{part.price.toFixed(2)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRemoveServiceItem(part.id)}
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#DC2626"
                          />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {showItemSubForm && (
                      <View style={styles.subFormBox}>
                        <Text style={styles.subFormTitle}>নতুন Item যোগ করুন</Text>

                        <Text style={styles.label}>Item Name *</Text>
                        <TextInput
                          style={styles.input}
                          value={partNameInput}
                          onChangeText={setPartNameInput}
                          placeholder="যেমন: Air Filter, Mobil, Spark Plug"
                        />

                        <Text style={styles.label}>Brand (Optional)</Text>
                        <TextInput
                          style={styles.input}
                          value={partBrandInput}
                          onChangeText={setPartBrandInput}
                          placeholder="যেমন: Motul, Yamaha, Bosch"
                        />

                        <View style={styles.rowGap}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Quantity</Text>
                            <TextInput
                              style={styles.input}
                              keyboardType="numeric"
                              value={partQtyInput}
                              onChangeText={setPartQtyInput}
                              placeholder="1"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Price (Tk.) *</Text>
                            <TextInput
                              style={styles.input}
                              keyboardType="numeric"
                              value={partPriceInput}
                              onChangeText={setPartPriceInput}
                              placeholder="350"
                            />
                          </View>
                        </View>

                        <View style={styles.subFormActions}>
                          <TouchableOpacity
                            style={[
                              styles.smallBtn,
                              { backgroundColor: '#E2E8F0' },
                            ]}
                            onPress={resetItemSubForm}
                          >
                            <Text
                              style={{
                                color: '#334155',
                                fontWeight: '600',
                                fontSize: 12,
                              }}
                            >
                              বাতিল
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.smallBtn,
                              { backgroundColor: '#16A34A' },
                            ]}
                            onPress={() => void handleAddServiceItem()}
                          >
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontWeight: '700',
                                fontSize: 12,
                              }}
                            >
                              Item যোগ করুন
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    <View style={styles.serviceTotalBar}>
                      <Text style={styles.serviceTotalLabel}>
                        সর্বমোট Servicing + Item:
                      </Text>
                      <Text style={styles.serviceTotalValue}>
                        ৳
                        {(
                          parseNum(servicePriceInput) + serviceItemsTotal
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#E2E8F0' }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={{ color: '#334155', fontWeight: '600' }}>
                    বাতিল
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => void handleSave()}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                    সেভ করুন
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
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
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyInitialState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyInitialTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyInitialSub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 18,
  },
  primaryAddVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 9,
  },
  primaryAddVehicleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  vehicleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  vehicleChipsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  vehicleChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  vehicleChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  vehicleChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addVehicleBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  profileActionBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginHorizontal: 10,
    marginTop: 8,
    padding: 9,
    borderRadius: 8,
    gap: 8,
  },
  pendingTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  pendingSub: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2,
  },
  pendingClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  pendingClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  targetCard: {
    backgroundColor: '#1E3A8A',
    marginHorizontal: 10,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  targetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  targetGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  targetItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRadius: 7,
    alignItems: 'center',
  },
  targetHighlightBox: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  targetLabel: {
    fontSize: 9.5,
    color: '#475569',
    fontWeight: '700',
  },
  targetVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  targetHighlightLabel: {
    fontSize: 9.5,
    color: '#DBEAFE',
    fontWeight: '700',
  },
  targetHighlightVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  targetEmptyText: {
    fontSize: 11.5,
    color: '#F1F5F9',
    lineHeight: 16,
  },
  quickBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginTop: 8,
  },
  finishChip: {
    flex: 1.25,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
  },
  finishChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  quickChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  verticalScroll: {
    flex: 1,
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    margin: 8,
    borderWidth: 1,
    borderColor: '#94A3B8',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  avgRow: {
    backgroundColor: '#FEF9C3',
    minHeight: 42,
  },
  headerRow: {
    backgroundColor: '#1E293B',
    minHeight: 38,
  },
  zebraRow: {
    backgroundColor: '#F8FAFC',
  },
  nonFuelRow: {
    backgroundColor: '#F0FDF4',
  },
  latestRowHighlight: {
    backgroundColor: '#EFF6FF',
  },
  latestBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
    marginTop: 1,
  },
  cell: {
    height: '100%',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  colDate: { width: 102 },
  colReading: { width: 92 },
  colNum: { width: 78 },
  colService: { width: 145 },
  colItem: { width: 165 },
  colDays: { width: 54 },
  colAction: { width: 64 },
  avgText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  avgSubText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
    textAlign: 'right',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cellText: {
    fontSize: 11.5,
    color: '#0F172A',
    textAlign: 'center',
  },
  cellTextNum: {
    fontSize: 11.5,
    color: '#0F172A',
    textAlign: 'right',
  },
  cellTextLeft: {
    fontSize: 11,
    color: '#0F172A',
    textAlign: 'left',
  },
  actionCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRightWidth: 0,
  },
  emptyRow: {
    padding: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    maxHeight: '88%',
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
  helperNote: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 12,
    lineHeight: 17,
  },
  autoFillNote: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 8,
    borderRadius: 7,
    marginBottom: 10,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  pickDateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  pickerColsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pickerCol: {
    flex: 1,
  },
  pickerColLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 6,
  },
  pickerList: {
    maxHeight: 170,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  pickerOption: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickerOptionActive: {
    backgroundColor: '#2563EB',
  },
  pickerOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  catChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  catChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deleteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  deleteModalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#B91C1C',
  },
  deleteWarningText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 10,
    lineHeight: 17,
  },
  deletePreviewBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 3,
  },
  deletePreviewLine: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F1D1D',
  },
  deleteCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  deleteCheckLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 5,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kindBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  kindBtnActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  kindBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  kindBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#0F172A',
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  itemsSection: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemsSectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  addItemBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  memoryBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  memoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 6,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 5,
  },
  memoryItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  memoryItemSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  partNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  partMetaText: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2,
  },
  subFormBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  subFormTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 8,
  },
  subFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  serviceTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 8,
    marginTop: 4,
  },
  serviceTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  serviceTotalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  modalActions: {
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