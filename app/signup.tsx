// app/signup.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { HelperText, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import MacroDialog from "../components/MacroDialog";
import MultiSelectDialog from "../components/MultiSelectDialog";
import { saveJSON } from "../lib/storage";
import type { Profile } from "../lib/types";
import { palette } from "../theme";

const CAT_OPTIONS = ["한식","중식","일식","양식","면","덮밥","샐러드","디저트","분식"];
const ALLERGEN_OPTIONS = ["계란","우유","땅콩","대두","밀","갑각류","생선","돼지고기","소고기"];

type Macro = { carb:number; protein:number; fat:number };

export default function Signup() {
  const router = useRouter();

  // 입력값 (초기 전부 빈값)
  const [email, setEmail]   = useState<string>("");
  const [pw, setPw]         = useState<string>("");
  const [sex, setSex]       = useState<Profile["sex"] | "">("");   // ← 빈 문자열 허용
  const [age, setAge]       = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [macro, setMacro]   = useState<Partial<Macro>>({});         // carb/protein/fat 일부만 존재 가능
  const [prefers, setPrefers]     = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);

  // 다이얼로그 on/off
  const [openPref, setOpenPref]   = useState(false);
  const [openAller, setOpenAller] = useState(false);
  const [openMacro, setOpenMacro] = useState(false);

  // 유효성
  const ageNum = Number(age);
  const tgtNum = Number(target);
  const invalid =
    !email.includes("@") ||
    !pw ||
    !sex || // 성별 미선택
    isNaN(ageNum) || ageNum < 1 ||
    isNaN(tgtNum) || tgtNum < 800;

  const onSubmit = async () => {
    if (invalid) return;

    // 매크로 비었으면 기본값 보정
    const finalMacro: Macro = {
      carb: macro.carb ?? 50,
      protein: macro.protein ?? 25,
      fat: macro.fat ?? 25,
    };

    const profile: Profile = {
      email,
      sex: sex as Profile["sex"],
      age: ageNum,
      targetKcal: tgtNum,
      macro: finalMacro,
      prefers,
      allergens,
    };

    await saveJSON("token", "FAKE_TOKEN");
    await saveJSON("profile", profile);
    router.replace("/");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* 헤더 */}
      <View>
        <LinearGradient
          colors={[palette.primary, "#A78BFA"]}
          style={{ height: 96, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
        />
        <Text style={{ position:"absolute", alignSelf:"center", bottom:10, fontSize:24, fontWeight:"800", color:"white" }}>
          회원가입
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal:14, paddingTop:10, paddingBottom:24, rowGap:12 }}
        >
          {/* 카드 컨테이너 */}
          <View
            style={{
              backgroundColor:"#fff",
              borderRadius:14,
              padding:14,
              rowGap:10,
              shadowColor:"#000",
              shadowOpacity:0.06,
              shadowRadius:6,
              shadowOffset:{ width:0, height:3 },
              elevation:2,
            }}
          >
            <TextInput
              mode="outlined"
              label="이메일"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              dense
              style={{ marginBottom:-6 }}
            />
            <HelperText type={email ? "info" : "error"} visible>
              {email ? "" : "이메일을 입력하세요"}
            </HelperText>

            <TextInput
              mode="outlined"
              label="비밀번호"
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              dense
              style={{ marginBottom:-6 }}
            />
            <HelperText type={pw ? "info" : "error"} visible>
              {pw ? "" : "비밀번호를 입력하세요"}
            </HelperText>

            <Text style={{ fontWeight:"700", marginTop:2 }}>성별</Text>
            <SegmentedButtons
              value={sex}                                
              onValueChange={(v) => setSex(v as any)}
              buttons={[
                { value:"female", label:"여성" },
                { value:"male",   label:"남성" },
              ]}
              density="small"
              style={{ marginBottom:4 }}
            />

            <View style={{ flexDirection:"row", columnGap:8 }}>
              <TextInput
                mode="outlined"
                label="나이"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                dense
                style={{ flex:1 }}
              />
              <TextInput
                mode="outlined"
                label="목표 칼로리(kcal)"
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                dense
                style={{ flex:1 }}
              />
            </View>

            {/* 트리거 버튼들 */}
            <TinyButton title="탄·단·지 비율 선택" onPress={() => setOpenMacro(true)} />
            <TinyButton title="선호 카테고리 선택" onPress={() => setOpenPref(true)} />
            <TinyButton title="알레르기 선택" onPress={() => setOpenAller(true)} />

            {/* 요약(없으면 '-') */}
            <Text style={{ marginTop:4 }}>
              비율: 탄수화물 {macro.carb ?? "-"}% · 단백질 {macro.protein ?? "-"}% · 지방 {macro.fat ?? "-"}%
            </Text>
            <Text>선호: {prefers.length ? prefers.join(", ") : "없음"}</Text>
            <Text>알레르기: {allergens.length ? allergens.join(", ") : "없음"}</Text>

            <TinyButton title="가입 완료" onPress={onSubmit} disabled={invalid} primary />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 다이얼로그들 */}
      <MacroDialog
        open={openMacro}
        initial={{ carb: macro.carb ?? 50, protein: macro.protein ?? 25, fat: macro.fat ?? 25 }}
        onClose={() => setOpenMacro(false)}
        onSave={setMacro}
      />
      <MultiSelectDialog
        title="선호 카테고리"
        options={CAT_OPTIONS}
        initial={prefers}
        open={openPref}
        onClose={() => setOpenPref(false)}
        onSave={setPrefers}
      />
      <MultiSelectDialog
        title="알레르기"
        options={ALLERGEN_OPTIONS}
        initial={allergens}
        open={openAller}
        onClose={() => setOpenAller(false)}
        onSave={setAllergens}
      />
    </SafeAreaView>
  );
}

/** 작은(컴팩트) 버튼 — 기본은 outline, 눌렀을 때만 색 변함 */
function TinyButton({
  title,
  onPress,
  outline = true,
  primary = false,
  disabled,
}: {
  title: string;
  onPress: () => void;
  outline?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        backgroundColor: primary
          ? (pressed ? "#6D28D9" : "#7C3AED")
          : outline
          ? (pressed ? "#F3F4F6" : "#FFFFFF")
          : (pressed ? "#EDE9FE" : "#F5F3FF"),
        borderWidth: outline ? 1 : 0,
        borderColor: outline ? "#E5E7EB" : "transparent",
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text
        style={{
          color: primary ? "#FFFFFF" : (outline ? "#6D28D9" : "#4B5563"),
          fontWeight: "700",
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
