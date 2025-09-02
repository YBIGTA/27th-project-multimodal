// components/MultiSelectDialog.tsx
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import { palette, radius } from "../theme";

type Props = {
  title: string;
  options: string[];
  initial: string[];
  open: boolean;
  onClose: () => void;
  onSave: (values: string[]) => void;
};

export default function MultiSelectDialog({
  title, options, initial, open, onClose, onSave
}: Props) {
  const [selected, setSelected] = useState<string[]>(initial ?? []);

  const toggle = (v: string) => {
    setSelected((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  return (
    <Portal>
      <Dialog visible={open} onDismiss={onClose} style={{ borderRadius: 22, backgroundColor: "#eef6deff" }}>
        <Dialog.Content>
          <Text style={{ fontSize: 22, fontWeight: "900", marginBottom: 12 }}>
            {title}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {options.map((opt) => {
              const active = selected.includes(opt);
              return (
                <Pressable
                  key={opt}
                  onPress={() => toggle(opt)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? "transparent" : "#E5E7EB",
                    backgroundColor: active ? "#92bc3d" : "#F5F6FA",
                  }}
                >
                  <Text style={{ color: active ? "white" : "#4B5563", fontWeight: "700" }}>
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onClose} textColor={palette.muted}>취소</Button>
          <Button
            onPress={() => { onSave(selected); onClose(); }}
            mode="contained"
            style={{ borderRadius: radius.md }}
          >
            적용
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
