import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { ActivityIndicator, Card, Chip, Divider, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import ChatDemo from "../../components/ChatDemo"; // ✅ 채팅
import FancyButton from "../../components/FancyButton";
import Section from "../../components/Section";
import { apiInfer, InferenceResp } from "../../lib/api";
import { evaluate } from "../../lib/eval";
import { addRecord } from "../../lib/records";
import { loadJSON } from "../../lib/storage";
import { suggestNextMeal } from "../../lib/suggest"; // ✅ 추천
import { palette, radius, space } from "../../theme";

type Profile = {
  targetKcal?: number;
  macro?: { carb:number; protein:number; fat:number };
  allergens?: string[];
  prefers?: string[];
};

export default function Upload() {
  const tabBarH = useBottomTabBarHeight();
  const [uri, setUri]   = useState<string | null>(null);
  const [res, setRes]   = useState<InferenceResp | null>(null);
  const [loading, setLoading] = useState(false);

  const [evalMsg, setEvalMsg] =
    useState<{score:number; advice:string[]} | null>(null);
  const [suggest, setSuggest] =
    useState<{title:string; reason:string; items:string[]}[] | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async ()=>{ setProfile(await loadJSON<Profile | null>("profile", null)); })();
  }, []);

  const resetStates = ()=>{
    setRes(null);
    setEvalMsg(null);
    setSuggest(null);
  };

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { alert("앨범 권한이 필요해요."); return; }
    const { canceled, assets } = await ImagePicker.launchImageLibraryAsync({ quality:0.9 });
    if (!canceled && assets?.[0]?.uri){ setUri(assets[0].uri); resetStates(); }
  };

  const snap = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { alert("카메라 권한이 필요해요."); return; }
    const { canceled, assets } = await ImagePicker.launchCameraAsync({ quality:0.9 });
    if (!canceled && assets?.[0]?.uri){ setUri(assets[0].uri); resetStates(); }
  };

  const infer = async () => {
    if (!uri) return;
    setLoading(true);
    try{
      // 리사이즈
      const resized = await ImageManipulator.manipulateAsync(
        uri, [{ resize: { width: 640 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      // 업로드 폼
      const file = { uri: resized.uri, name:"upload.jpg", type:"image/jpeg" } as any;
      const form = new FormData(); form.append("file", file);

      // 데모 인식 API
      const data = await apiInfer(form);
      setRes(data);

      // 안전한 프로필(없어도 채팅이 나오도록)
      const safe: Required<Profile> = {
        targetKcal: profile?.targetKcal ?? 1800,
        macro: profile?.macro ?? { carb:50, protein:25, fat:25 },
        allergens: profile?.allergens ?? [],
        prefers: profile?.prefers ?? [],
      };

      const picked = data?.nutrition?.[0];
      if (picked) {
        // 총평
        setEvalMsg(
          evaluate(
            { kcal: picked.kcal, macro: picked.macro },
            { targetKcal: safe.targetKcal, macro: safe.macro, allergens: safe.allergens },
            picked.allergens
          )
        );
        // 추천
        setSuggest(
          suggestNextMeal(
            { kcal: picked.kcal, macro: picked.macro, allergens: picked.allergens },
            { targetKcal: safe.targetKcal, macro: safe.macro, prefers: safe.prefers, allergens: safe.allergens }
          )
        );
      } else {
        // 그래도 채팅이 뜨도록 기본 제안 한 세트
        setEvalMsg({ score: 80, advice: ["이번 끼니 데이터가 부족하지만 전반적으로 무난해요."] });
        setSuggest([{ title:"다음 끼니 가볍게", reason:"데모 기본 제안", items:["샐러드 + 단백질", "밥 1/2", "소스·당류 줄이기"] }]);
      }

      // 디버깅용(원하면 콘솔 확인)
      console.log("evalMsg:", evalMsg);
      console.log("suggest:", suggest);
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = async () => {
    if (!res) return;
    const n = res.nutrition[0];
    await addRecord({ date: new Date().toISOString().slice(0,10), menu: n?.name, kcal: n?.kcal, macro: n?.macro });
    alert("오늘 기록에 저장했어요!");
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(2), gap: space(2), paddingBottom: tabBarH + 24 }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700" }}>사진 업로드</Text>

        <Section>
          {uri ? (
            <Image source={{ uri }} style={{ height: 260, borderRadius: radius.md }} />
          ) : (
            <Card mode="contained" style={{ height: 260, backgroundColor:"#EEF0F6", borderRadius: radius.md, alignItems:"center", justifyContent:"center" }}>
              <Text style={{ color:"#6B7280" }}>여기에 미리보기가 보여요</Text>
            </Card>
          )}
          <View style={{ height: 10 }} />
          <FancyButton title="앨범에서 선택" onPress={pick} />
          <View style={{ height: 8 }} />
          <FancyButton title="카메라로 촬영" variant="outline" onPress={snap} />
          <View style={{ height: 8 }} />
          <FancyButton title={loading ? "인식 중..." : "인식하기"} variant="outline" onPress={infer} />
        </Section>

        {loading && <ActivityIndicator animating size="small" style={{ marginTop: 6 }} />}

        {!!res && (
          <Section title="인식 결과">
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap: 8 }}>
              {res.menuCandidates.map((m, i)=>(<Chip key={m.name+i} compact selected={i===0}>{m.name}</Chip>))}
            </View>

            <Divider style={{ marginVertical: 10 }} />

            {res.nutrition[0] && (
              <Card style={{ borderRadius: radius.md }}>
                <Card.Title title={res.nutrition[0].name} />
                <Card.Content style={{ gap: 6 }}>
                  <Text>칼로리: {res.nutrition[0].kcal} kcal</Text>
                  <Text>비율: 탄수화물 {res.nutrition[0].macro.carb}% · 단백질 {res.nutrition[0].macro.protein}% · 지방 {res.nutrition[0].macro.fat}%</Text>
                  <Text>알레르겐: {res.nutrition[0].allergens.join(", ") || "없음"}</Text>
                </Card.Content>
              </Card>
            )}

            {evalMsg && (
              <View style={{ gap: 6, marginTop: 10 }}>
                <Text style={{ fontWeight:"700" }}>총평 · 점수 {evalMsg.score}</Text>
                {evalMsg.advice.map((m, i)=>(<Text key={i}>• {m}</Text>))}
              </View>
            )}

            <View style={{ height: 10 }} />
            <FancyButton title="캘린더에 저장" variant="outline" onPress={saveRecord} />
          </Section>
        )}

        {/* ✅ 채팅은 조건 완화: evalMsg 또는 suggest 중 하나만 있어도 보여주기 */}
        {(res?.nutrition?.[0] && (evalMsg || suggest)) && (
          <Section title="대화형 답변 (데모)">
            <ChatDemo
              mealName={res!.nutrition[0].name ?? "이번 식사"}
              score={evalMsg?.score ?? 80}
              advice={evalMsg?.advice ?? ["이번 끼니 데이터가 부족하지만 전반적으로 무난해요."]}
              suggestions={suggest ?? [{ title:"다음 끼니 가볍게", reason:"데모 기본 제안", items:["샐러드 + 단백질", "밥 1/2", "소스·당류 줄이기"] }]}
            />
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
