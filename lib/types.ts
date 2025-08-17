// lib/types.ts
export type Profile = {
  email: string;
  sex: "male" | "female";
  age: number;
  targetKcal: number;
  macro: { carb: number; protein: number; fat: number };
  prefers: string[];
  allergens: string[];
};
