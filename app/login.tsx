// app/login.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { HelperText, Text, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import TinyButton from "../components/TinyButton"; // 분리했다면 import
import { saveJSON } from "../lib/storage";
import { palette } from "../theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const router = useRouter();

  const invalid = !email.includes("@") || !pw;

  const onLogin = async () => {
    await saveJSON("token", "FAKE_TOKEN");
    await saveJSON("profile", { email });
    router.replace("/");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <View>
        <LinearGradient
          colors={[palette.primary, "#A78BFA"]}
          style={{ height: 96, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
        />
        <Text
          style={{
            position: "absolute",
            alignSelf: "center",
            bottom: 10,
            fontSize: 24,
            fontWeight: "800",
            color: "white",
          }}
        >
          로그인
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24, rowGap: 12 }}
        >
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 14, rowGap: 10, elevation: 2 }}>
            <TextInput
              mode="outlined" label="이메일" value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address" dense style={{ marginBottom: -6 }}
            />
            <HelperText type={email ? "info" : "error"} visible>{email ? "" : "이메일을 입력하세요"}</HelperText>

            <TextInput
              mode="outlined" label="비밀번호" value={pw} onChangeText={setPw}
              secureTextEntry dense style={{ marginBottom: -6 }}
            />
            <HelperText type={pw ? "info" : "error"} visible>{pw ? "" : "비밀번호를 입력하세요"}</HelperText>

            <TinyButton title="시작하기" onPress={onLogin} disabled={invalid} primary />
            <TinyButton title="회원가입" onPress={() => router.push("/signup")} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
