// app/(tabs)/upload.tsx
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { ActivityIndicator, Button, Card, Divider, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRouter } from "expo-router"; // ← 추가
// import ChatDemo from "../../components/ChatDemo"; // ← 제거
import FancyButton from "../../components/FancyButton";
import Section from "../../components/Section";
import { apiInfer, type InferenceResp } from "@/lib/api";
import { evaluate } from "../../lib/eval";
import { addRecord } from "../../lib/records";
import { loadJSON } from "../../lib/storage";
import { suggestNextMeal } from "../../lib/suggest";
import { palette, radius, space } from "../../theme";

type Profile = {
  targetKcal?: number;
  macro?: { carb: number; protein: number; fat: number };
  allergens?: string[];
  prefers?: string[];
};

type Step = "select" | "recognize";

export default function Upload() {
  const tabBarH = useBottomTabBarHeight();
  const router = useRouter(); // ← 추가

  // 단계/데이터 상태
  const [step, setStep] = useState<Step>("select");
  const [uri, setUri] = useState<string | null>(null);

  // 인식/평가/추천 상태
  const [res, setRes] = useState<InferenceResp | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0); // 선택된 후보 인덱스
  const [loading, setLoading] = useState(false);
  const [evalMsg, setEvalMsg] = useState<{ score: number; advice: string[] } | null>(null);
  const [suggest, setSuggest] = useState<{ title: string; reason: string; items: string[] }[] | null>(null);

  // 사용자 프로필
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    (async () => {
      setProfile(await loadJSON<Profile | null>("profile", null));
    })();
  }, []);

  const resetInferenceStates = () => {
    setRes(null);
    setEvalMsg(null);
    setSuggest(null);
    setSelectedIndex(0);
  };

  // ── 1) 이미지 선택/촬영 → 선택되면 자동으로 recognize 단계로 이동 ───────────────
  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { alert("앨범 권한이 필요해요."); return; }
    const { canceled, assets } = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    if (!canceled && assets?.[0]?.uri) {
      setUri(assets[0].uri);
      resetInferenceStates();
      setStep("recognize"); // 다음 단계로 이동
    }
  };

  const snap = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { alert("카메라 권한이 필요해요."); return; }
    const { canceled, assets } = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!canceled && assets?.[0]?.uri) {
      setUri(assets[0].uri);
      resetInferenceStates();
      setStep("recognize"); // 다음 단계로 이동
    }
  };

  // ── 2) 인식하기 ─────────────────────────────────────────────────────────────
  const infer = async () => {
    if (!uri) return;
    setLoading(true);
    try {
      const resized = await ImageManipulator.manipulateAsync(
        uri, [{ resize: { width: 640 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      const response = await fetch(resized.uri);
      const blob = await response.blob();
      const form = new FormData();
      form.append("file", blob, "upload.jpg");

      const data = await apiInfer(form);
      setRes(data);
      setSelectedIndex(0); // 새 결과 받으면 첫번째 항목으로 초기화

      const safe: Required<Profile> = {
        targetKcal: profile?.targetKcal ?? 1800,
        macro: profile?.macro ?? { carb: 50, protein: 25, fat: 25 },
        allergens: profile?.allergens ?? [],
        prefers: profile?.prefers ?? [],
      };

      const picked = data?.nutrition?.[0]; // 평가는 일단 첫번째 기준으로
      if (picked) {
        setEvalMsg(
          evaluate(
            { kcal: picked.kcal, macro: picked.macro },
            { targetKcal: safe.targetKcal, macro: safe.macro, allergens: safe.allergens },
            picked.allergens
          )
        );
        setSuggest(
          suggestNextMeal(
            { kcal: picked.kcal, macro: picked.macro, allergens: picked.allergens },
            { targetKcal: safe.targetKcal, macro: safe.macro, prefers: safe.prefers, allergens: safe.allergens }
          )
        );
      } else {
        setEvalMsg({ score: 80, advice: ["이번 끼니 데이터가 부족하지만 전반적으로 무난해요."] });
        setSuggest([{ title: "다음 끼니 가볍게", reason: "데모 기본 제안", items: ["샐러드 + 단백질", "밥 1/2", "소스·당류 줄이기"] }]);
      }
    } finally {
      setLoading(false);
    }
  };

  // 기록 저장 (선택된 항목 기준)
  const saveRecord = async () => {
    if (!res || !res.nutrition[selectedIndex]) return;
    const n = res.nutrition[selectedIndex];
    await addRecord({ date: new Date().toISOString().slice(0, 10), menu_id: n.menu_id, menu: n.name, kcal: n.kcal, macro: n.macro });
    alert("오늘 기록에 저장했어요!");
  };

  const title = useMemo(() => step === "select" ? "사진 업로드" : "미리보기", [step]);
  const selectedNutrition = res?.nutrition?.[selectedIndex];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(2), gap: space(2), paddingBottom: tabBarH + 24 }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700" }}>{title}</Text>

        {step === "select" && (
          <Section>
            <Card mode="contained" style={{ height: 260, backgroundColor: "#EEF0F6", borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#6B7280" }}>이미지를 선택하거나 촬영해주세요</Text>
            </Card>
            <View style={{ height: 10 }} />
            <FancyButton title="앨범에서 선택" onPress={pick} />
            <View style={{ height: 8 }} />
            <FancyButton title="카메라로 촬영" variant="outline" onPress={snap} />
          </Section>
        )}

        {step === "recognize" && (
          <>
            <Section>
              {uri ? (
                <Image source={{ uri }} style={{ height: 260, borderRadius: radius.md }} />
              ) : (
                <Card mode="contained" style={{ height: 260, backgroundColor: "#EEF0F6", borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#6B7280" }}>이미지를 먼저 선택해주세요</Text>
                </Card>
              )}
              <View style={{ height: 10 }} />
              <FancyButton title={loading ? "인식 중..." : "인식하기"} onPress={infer} />
              <View style={{ height: 8 }} />
              <FancyButton title="다른 사진 선택" variant="outline" onPress={() => { setStep("select"); setUri(null); resetInferenceStates(); }} />
            </Section>

            {loading && <ActivityIndicator animating size="small" style={{ marginTop: 6 }} />}

            {!!res && (
              <Section title="인식 결과 (후보 선택)">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {res.menuCandidates.map((m, i) => (
                    <Button key={m.name + i} mode={i === selectedIndex ? "contained" : "outlined"} onPress={() => setSelectedIndex(i)}>
                      {m.name}
                    </Button>
                  ))}
                </View>

                <Divider style={{ marginVertical: 10 }} />

                {selectedNutrition && (
                  <Card style={{ borderRadius: radius.md, backgroundColor: "#f4ffdfff" }}>
                    <Card.Title title={selectedNutrition.name} />
                    <Card.Content style={{ gap: 6 }}>
                      <Text>칼로리: {selectedNutrition.kcal} kcal</Text>
                      <Text>
                        영양소: 탄수화물 {selectedNutrition.macro.carb}g · 단백질 {selectedNutrition.macro.protein}g · 지방 {selectedNutrition.macro.fat}g
                      </Text>
                    </Card.Content>
                  </Card>
                )}

                <View style={{ height: 10 }} />
                <FancyButton title="이 메뉴로 캘린더에 저장" variant="outline" onPress={selectedNutrition ? saveRecord : undefined} />
              </Section>
            )}

            {/* LLM 상담으로 이동 버튼 (ChatDemo 제거, mealName만 전달) */}
            {(res?.nutrition?.[0] && (evalMsg || suggest)) && (
              <Section title="LLM 상담">
                <FancyButton
                  title="헬핏과 대화 시작하기"
                  onPress={() => {
                    const picked = res!.nutrition[selectedIndex] ?? res!.nutrition[0];
                    router.push({
                      pathname: "/(modals)/chat",
                      params: {
                        mealName: picked.name ?? "이번 식사",
                        fr: encodeURIComponent(JSON.stringify({
                          food_name: picked.name,
                          confidence: 1,
                          nutrition_info: picked,
                          serving_size: picked?.serving_g,
                        })),
                      },
                    });
                  }}
                />
              </Section>
            )}

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
