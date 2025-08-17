// components/MacroDialog.tsx
import Slider from "@react-native-community/slider";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { palette } from "../theme";

type Macro = { carb: number; protein: number; fat: number };
type Props = {
  open: boolean;
  initial: Macro;
  onClose: () => void;
  onSave: (v: Macro) => void;
};

export default function MacroDialog({ open, initial, onClose, onSave }: Props) {
  const [carb, setCarb] = useState(initial.carb ?? 50);
  const [protein, setProtein] = useState(initial.protein ?? 25);

  // 합계 100% 유지
  const fat = useMemo(() => {
    const rest = 100 - Math.round(carb) - Math.round(protein);
    return Math.max(0, rest);
  }, [carb, protein]);

  const save = () => onSave({ carb: Math.round(carb), protein: Math.round(protein), fat });

  return (
    <Portal>
      <Dialog visible={open} onDismiss={onClose} style={{ borderRadius: 18 }}>
        <Dialog.Content>
          <Text style={{ fontSize: 20, fontWeight: "900", marginBottom: 8 }}>
            탄수화물 · 단백질 · 지방 비율 (합계 100%)
          </Text>

          <Row label={`탄수화물 ${Math.round(carb)}%`}>
            <Slider
              value={carb}
              onValueChange={setCarb}
              minimumValue={10}
              maximumValue={80}
              step={1}
              minimumTrackTintColor={palette.success}
              thumbTintColor={palette.success}
            />
          </Row>

          <Row label={`단백질 ${Math.round(protein)}%`}>
            <Slider
              value={protein}
              onValueChange={setProtein}
              minimumValue={10}
              maximumValue={80}
              step={1}
              minimumTrackTintColor={palette.primary}
              thumbTintColor={palette.primary}
            />
          </Row>

          <Text style={{ marginTop: 4, fontSize: 16 }}>지방 {fat}%</Text>
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
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, fontWeight: "700" }}>{label}</Text>
      {children}
    </View>
  );
}
