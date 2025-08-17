// lib/records.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "records";

export type RecordItem = {
  id?: string | number;
  date: string; // YYYY-MM-DD
  menu?: string;
  kcal?: number;
  macro?: { carb: number; protein: number; fat: number };
};

export async function addRecord(item: RecordItem) {
  const raw = await AsyncStorage.getItem(KEY);
  const list: RecordItem[] = raw ? JSON.parse(raw) : [];
  list.unshift({ id: Date.now(), ...item });
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

export async function listRecords(): Promise<RecordItem[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function listRecordsByDate(date: string): Promise<RecordItem[]> {
  const all = await listRecords();
  return all.filter((r) => r.date === date);
}

export async function getTodaySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const items = await listRecordsByDate(today);

  const totalKcal = items.reduce((sum, it) => sum + (it.kcal ?? 0), 0);
  const totalMacro = items.reduce(
    (acc, it) => ({
      carb: acc.carb + (it.macro?.carb ?? 0),
      protein: acc.protein + (it.macro?.protein ?? 0),
      fat: acc.fat + (it.macro?.fat ?? 0),
    }),
    { carb: 0, protein: 0, fat: 0 }
  );

  return { date: today, items, totalKcal, totalMacro };
}
