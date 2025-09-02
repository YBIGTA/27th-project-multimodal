// components/MacroDialog.tsx
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Dialog, Portal, Text, TextInput } from "react-native-paper";
import { palette } from "../theme";

type Macro = { carb: number; protein: number; fat: number };
type Props = {
  open: boolean;
  initial: Macro;
  onClose: () => void;
  onSave: (v: Macro) => void;
};

export default function MacroDialog({ open, initial, onClose, onSave }: Props) {
  // 초기값: 합계 100에 가깝도록 보정
  const [carb, setCarb] = useState<number>(Math.round(initial.carb ?? 50));
  const [protein, setProtein] = useState<number>(Math.round(initial.protein ?? 25));
  const [fat, setFat] = useState<number>(
    Math.max(0, 100 - Math.round(initial.carb ?? 50) - Math.round(initial.protein ?? 25))
  );

  const total = useMemo(() => Math.round(carb + protein + fat), [carb, protein, fat]);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  // 하나를 바꿀 때 합계=100 유지 로직 -----------------------------
  const updateCarb = (v: number) => {
    let c = clamp(v), p = protein, f = fat;
    const overflow = c + p + f - 100;
    if (overflow > 0) {
      // 지방부터 줄이고, 모자라면 단백질도 줄임
      const reduceFat = Math.min(f, overflow);
      f -= reduceFat;
      const still = overflow - reduceFat;
      if (still > 0) p = Math.max(0, p - still);
    }
    setCarb(c); setProtein(clamp(p)); setFat(clamp(f));
  };

  const updateProtein = (v: number) => {
    let p = clamp(v), c = carb, f = fat;
    const overflow = c + p + f - 100;
    if (overflow > 0) {
      const reduceFat = Math.min(f, overflow);
      f -= reduceFat;
      const still = overflow - reduceFat;
      if (still > 0) c = Math.max(0, c - still);
    }
    setProtein(p); setCarb(clamp(c)); setFat(clamp(f));
  };

  const updateFat = (v: number) => {
    let f = clamp(v), c = carb, p = protein;
    const overflow = c + p + f - 100;
    if (overflow > 0) {
      // 탄수화물부터 줄이고 모자라면 단백질도 줄임(반대로 하고 싶으면 순서만 바꾸세요)
      const reduceCarb = Math.min(c, overflow);
      c -= reduceCarb;
      const still = overflow - reduceCarb;
      if (still > 0) p = Math.max(0, p - still);
    }
    setFat(f); setCarb(clamp(c)); setProtein(clamp(p));
  };
  // -------------------------------------------------------------

  const save = () => onSave({ carb: clamp(carb), protein: clamp(protein), fat: clamp(fat) });

  return (
    <Portal>
      <Dialog visible={open} onDismiss={onClose} style={{ borderRadius: 18, backgroundColor: "#eef6deff" }}>
        <Dialog.Content>
          <Text style={{ fontSize: 20, fontWeight: "900", marginBottom: 8 }}>
            탄수화물 · 단백질 · 지방 비율 (합계 100%)
          </Text>

          <Row label={`탄수화물 ${carb}%`}>
            <TextInput
              value={String(carb)}
              onChangeText={(text) => updateCarb(Number(text) || 0)}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 8 }}
            />
          </Row>

          <Row label={`단백질 ${protein}%`}>
            <TextInput
              value={String(protein)}
              onChangeText={(text) => updateProtein(Number(text) || 0)}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 8 }}
            />
          </Row>

          <Row label={`지방 ${fat}%`}>
            <TextInput
              value={String(fat)}
              onChangeText={(text) => updateFat(Number(text) || 0)}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 8 }}
            />
          </Row>

          <Text style={{ marginTop: 4, fontSize: 14, textAlign: "right", opacity: 0.7 }}>
            합계 {total}%
          </Text>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onClose} textColor={palette.muted}>취소</Button>
          <Button onPress={() => { save(); onClose(); }} mode="contained">
            적용
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ marginBottom: 6, fontWeight: "700" }}>{label}</Text>
      {children}
    </View>
  );
}