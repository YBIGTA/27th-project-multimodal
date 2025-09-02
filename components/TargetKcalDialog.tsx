// components/TargetKcalDialog.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import {
  Button,
  Dialog,
  Portal,
  Text,
  TextInput,
} from "react-native-paper";

type Props = {
  open: boolean;
  initial?: number;
  onClose: () => void;
  onSave: (value: number) => void;
};

export default function TargetKcalDialog({ open, initial, onClose, onSave }: Props) {
  const [value, setValue] = useState(String(initial ?? 2000));

  const handleSave = () => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 600 && num <= 6000) {
      onSave(num);
      onClose();
    }
  };

  return (
    <Portal>
      <Dialog
        visible={open}
        onDismiss={onClose}
        style={styles.dialog} // 🔹 크기 조정 스타일 적용
      >
        <Dialog.Title>오늘 목표 칼로리</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.helper}>600~6000 kcal 범위의 값을 입력하세요.</Text>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={value}
            onChangeText={setValue}
            style={styles.input}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>취소</Button>
          <Button onPress={handleSave}>저장</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: "center",
    width: "85%",   // 🔹 화면 폭의 85% 정도만 사용
    borderRadius: 12,
    backgroundColor: "#eef6deff"
  },
  input: {
    marginTop: 12,
    backgroundColor: "white",
  },
  helper: {
    marginBottom: 8,
    color: "gray",
  },
});