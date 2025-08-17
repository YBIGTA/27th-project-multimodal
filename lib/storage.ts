// lib/storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export const saveJSON = async (k: string, v: any) =>
  AsyncStorage.setItem(k, JSON.stringify(v));

export const loadJSON = async <T>(k: string, fallback: T): Promise<T> => {
  const v = await AsyncStorage.getItem(k);
  return v ? (JSON.parse(v) as T) : fallback;
};
