// app/(tabs)/my.tsx
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Card, Chip, Divider, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import MacroDialog from "../../components/MacroDialog";
import MultiSelectDialog from "../../components/MultiSelectDialog";
import RingProgress from "../../components/RingProgress";
import TargetKcalDialog from "../../components/TargetKcalDialog";

import { getTodaySummary } from "../../lib/records";
import { loadJSON, saveJSON } from "../../lib/storage";
import type { Profile } from "../../lib/types";
import { palette, radius, space } from "../../theme";

const CAT_OPTIONS = ["한식","중식","일식","양식","면","덮밥","샐러드","디저트","분식"];
const ALLERGEN_OPTIONS = ["계란","우유","땅콩","대두","밀","갑각류","생선","돼지고기","소고기"];

export default function My() {
  const router = useRouter();
  const tabH = useBottomTabBarHeight();

  const [token, setToken]   = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [today, setToday]   = useState<{ totalKcal:number; items:any[] } | null>(null);

  // 다이얼로그 on/off
  const [openMacro, setOpenMacro]   = useState(false);
  const [openPref,  setOpenPref]    = useState(false);
  const [openAller, setOpenAller]   = useState(false);
  const [openTarget, setOpenTarget] = useState(false);

  const reload = useCallback(async () => {
    const t = await loadJSON<string | null>("token", null);
    const p = await loadJSON<Profile | null>("profile", null);
    setToken(t);
    setProfile(p);
    const s = await getTodaySummary();
    setToday({ totalKcal: s.totalKcal, items: s.items });
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // 진행률 (0~1)
  const progress = useMemo(() => {
    const tgt = profile?.targetKcal ?? 0;
    const cur = today?.totalKcal ?? 0;
    if (!tgt) return 0;
    const r = cur / tgt;
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }, [profile?.targetKcal, today?.totalKcal]);

  // 저장 핸들러
  const patchProfile = async (next: Profile) => {
    setProfile(next);
    await saveJSON("profile", next);
  };
  const onSaveMacro = async (m: {carb:number; protein:number; fat:number}) => {
    if(!profile) return;
    patchProfile({ ...profile, macro: m });
  };
  const onSavePrefers  = async (arr: string[]) => profile && patchProfile({ ...profile, prefers: arr });
  const onSaveAllergens= async (arr: string[]) => profile && patchProfile({ ...profile, allergens: arr });
  const onSaveTarget   = async (kcal: number) => profile && patchProfile({ ...profile, targetKcal: kcal });

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.bg }}>
      {/* 전체 스크롤 가능 + 탭바 패딩 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: space(2),
          gap: space(2),
          paddingBottom: tabH + 24,
        }}
      >
        <Text style={{ fontSize:22, fontWeight:"800" }}>마이페이지</Text>

        {/* 상태 카드 */}
        <Card style={{ borderRadius: radius.lg, overflow: "hidden" }}>
          <Card.Content style={{ gap: 10 }}>
            {token && profile ? (
              <>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize:16, fontWeight:"700" }}>
                    {profile.email?.split("@")[0]} 님
                  </Text>
                  <Text style={{ color:"#6B7280" }}>
                    목표 {profile.targetKcal ?? "-"} kcal · C{profile.macro?.carb ?? 50}/P{profile.macro?.protein ?? 25}/F{profile.macro?.fat ?? 25}
                  </Text>
                </View>

                {/* 목표 달성 현황 */}
                <View style={{ alignItems:"center", marginTop: 4 }}>
                  <Text style={{ fontWeight:"700", marginBottom: 8 }}>오늘 목표 달성 현황</Text>
                  <RingProgress size={140} strokeWidth={12} progress={progress} color={palette.primary} />
                  <Text style={{ marginTop: 6 }}>
                    {(today?.totalKcal ?? 0)} / {(profile?.targetKcal ?? "-")} kcal
                  </Text>
                  <Button
                    mode="outlined"
                    style={{ marginTop: 8 }}
                    onPress={() => setOpenTarget(true)}
                  >
                    오늘 목표 수정
                  </Button>
                </View>

                <Divider style={{ marginVertical: 8 }} />

                {/* 선호/알레르기 — 긴 경우도 줄바꿈 */}
                <View style={{ gap: 8 }}>
                  <Text>선호 카테고리</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                    {(profile.prefers ?? []).length
                      ? (profile.prefers ?? []).map((p, i)=>(<Chip key={p+i} compact>{p}</Chip>))
                      : <Text style={{ color:"#6B7280" }}>없음</Text>}
                  </View>

                  <Text style={{ marginTop:4 }}>알레르기</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                    {(profile.allergens ?? []).length
                      ? (profile.allergens ?? []).map((a, i)=>(<Chip key={a+i} compact>{a}</Chip>))
                      : <Text style={{ color:"#6B7280" }}>없음</Text>}
                  </View>
                </View>

                <Divider style={{ marginVertical: 8 }} />

                <Text style={{ fontWeight:"700" }}>오늘 요약</Text>
                <Text>섭취 합계: {today?.totalKcal ?? 0} kcal (기록 {today?.items.length ?? 0}건)</Text>

                {/* 액션 버튼: 줄바꿈 허용 */}
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginTop:8 }}>
                  <Button mode="contained" onPress={() => setOpenMacro(true)}>비율 수정</Button>
                  <Button mode="outlined"  onPress={() => setOpenPref(true)}>선호 수정</Button>
                  <Button mode="outlined"  onPress={() => setOpenAller(true)}>알레르기 수정</Button>
                </View>
              </>
            ) : (
              <>
                <Text style={{ marginBottom: 8 }}>로그인이 필요해요.</Text>
                <View style={{ flexDirection:"row", gap:8, flexWrap:"wrap" }}>
                  <Button mode="contained" onPress={() => router.push("/login")}>로그인</Button>
                  <Button mode="outlined"  onPress={() => router.push("/signup")}>회원가입</Button>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* 빠른 메뉴 카드 */}
        {token && profile && (
          <Card style={{ borderRadius: radius.lg, overflow:"hidden" }}>
            <Card.Content style={{ gap:8 }}>
              <Text style={{ fontWeight:"700" }}>빠른 메뉴</Text>
              <View style={{ flexDirection:"row", gap:8, flexWrap:"wrap" }}>
                <Button mode="outlined" onPress={() => router.push("/upload")}>사진 업로드</Button>
                <Button mode="outlined" onPress={() => router.push("/calendar")}>식단 기록</Button>
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* 다이얼로그들 */}
      <TargetKcalDialog
        open={openTarget}
        initial={profile?.targetKcal}
        onClose={() => setOpenTarget(false)}
        onSave={onSaveTarget}
      />
      <MacroDialog
        open={openMacro}
        initial={{
          carb: profile?.macro?.carb ?? 50,
          protein: profile?.macro?.protein ?? 25,
          fat: profile?.macro?.fat ?? 25,
        }}
        onClose={() => setOpenMacro(false)}
        onSave={onSaveMacro}
      />
      <MultiSelectDialog
        title="선호 카테고리"
        options={CAT_OPTIONS}
        initial={profile?.prefers ?? []}
        open={openPref}
        onClose={() => setOpenPref(false)}
        onSave={onSavePrefers}
      />
      <MultiSelectDialog
        title="알레르기"
        options={ALLERGEN_OPTIONS}
        initial={profile?.allergens ?? []}
        open={openAller}
        onClose={() => setOpenAller(false)}
        onSave={onSaveAllergens}
      />
    </SafeAreaView>
  );
}