import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  ImageBackground,
  Pressable,
  View,
} from "react-native";
import { Card, Chip, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadJSON } from "../../lib/storage";
import { palette, radius, space } from "../../theme";

const W = Dimensions.get("window").width;

type Profile = {
  targetKcal?: number;
  macro?: { carb: number; protein: number; fat: number };
  prefers?: string[];
};

type MenuItem = {
  id: string;
  name: string;
  photo: string; // 이미지 URL(데모)
  kcal: number;
  macro: { carb: number; protein: number; fat: number }; // %
  category: "한식" | "일식" | "양식" | "샐러드" | "면" | "덮밥";
};

// ─────────────────────────────────────────────────────
// 데모용 데이터 (나중에 DB 연동 시 이 부분만 API 호출로 교체)
const MOCK: MenuItem[] = [
  {
    id: "1",
    name: "연어 포케",
    photo:
      "https://images.unsplash.com/photo-1552749412-5b94f5b1b8ab?q=80&w=1600&auto=format&fit=crop",
    kcal: 540,
    macro: { carb: 45, protein: 30, fat: 25 },
    category: "덮밥",
  },
  {
    id: "2",
    name: "치킨 샐러드",
    photo:
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1600&auto=format&fit=crop",
    kcal: 420,
    macro: { carb: 30, protein: 40, fat: 30 },
    category: "샐러드",
  },
  {
    id: "3",
    name: "메밀 소바",
    photo:
      "https://images.unsplash.com/photo-1604908176997-431ca5c4a70e?q=80&w=1600&auto=format&fit=crop",
    kcal: 560,
    macro: { carb: 60, protein: 20, fat: 20 },
    category: "면",
  },
  {
    id: "4",
    name: "두부 스테이크 정식",
    photo:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=1600&auto=format&fit=crop",
    kcal: 500,
    macro: { carb: 40, protein: 35, fat: 25 },
    category: "한식",
  },
  {
    id: "5",
    name: "연어 스테이크",
    photo:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1600&auto=format&fit=crop",
    kcal: 580,
    macro: { carb: 25, protein: 45, fat: 30 },
    category: "양식",
  },
  {
    id: "6",
    name: "사시미 덮밥",
    photo:
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1600&auto=format&fit=crop",
    kcal: 620,
    macro: { carb: 50, protein: 30, fat: 20 },
    category: "일식",
  },
];

const CATS = ["전체", "한식", "일식", "양식", "샐러드", "면", "덮밥"] as const;
// ─────────────────────────────────────────────────────

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cat, setCat] = useState<(typeof CATS)[number]>("전체");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await loadJSON<Profile | null>("profile", null);
      setProfile(p);
      // 데모 느낌: 로딩 스켈레톤을 잠깐 보여주기
      setTimeout(() => setLoading(false), 600);
    })();
  }, []);

  const data = useMemo(() => {
    let arr = [...MOCK];
    // 선호 카테고리를 약하게 반영(상단으로 정렬)
    const prefers = profile?.prefers ?? [];
    if (prefers.length) {
      arr.sort((a, b) => {
        const pa = prefers.includes(a.category);
        const pb = prefers.includes(b.category);
        return Number(pb) - Number(pa);
      });
    }
    // 카테고리 필터
    if (cat !== "전체") arr = arr.filter((m) => m.category === cat);
    return arr;
  }, [cat, profile]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* 히어로 헤더 */}
      <View style={{ paddingHorizontal: space(2), paddingTop: space(1) }}>
        <LinearGradient
          colors={["#8B5CF6", "#6D28D9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.xl,
            paddingVertical: space(3),
            paddingHorizontal: space(3),
          }}
        >
          <Text style={{ color: "white", fontSize: 22, fontWeight: "800" }}>
            오늘의 추천 메뉴
          </Text>
          <Text style={{ color: "white", opacity: 0.9, marginTop: 6 }}>
            {profile?.targetKcal
              ? `목표 ${profile.targetKcal} kcal • C${profile.macro?.carb ?? 50}/P${profile.macro?.protein ?? 25}/F${profile.macro?.fat ?? 25}`
              : "목표를 설정하면 더 정확히 추천해줘요"}
          </Text>
        </LinearGradient>
      </View>

      {/* 카테고리 필터 */}
      <View
        style={{
          paddingHorizontal: space(2),
          paddingTop: space(2),
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {CATS.map((c) => (
          <Chip
            key={c}
            selected={cat === c}
            onPress={() => setCat(c)}
            compact
            style={{ backgroundColor: cat === c ? "#EDE9FE" : "#F3F4F6" }}
            textStyle={{
              color: cat === c ? "#6D28D9" : "#111827",
              fontWeight: cat === c ? "700" : "500",
            }}
          >
            {c}
          </Chip>
        ))}
      </View>

      {/* 리스트 */}
      {loading ? (
        <View style={{ padding: space(2), gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <Card key={i} style={{ borderRadius: radius.lg }}>
              <View
                style={{
                  height: 160,
                  backgroundColor: "#E5E7EB",
                  borderTopLeftRadius: radius.lg,
                  borderTopRightRadius: radius.lg,
                }}
              />
              <View style={{ padding: 12, gap: 6 }}>
                <View style={{ height: 16, backgroundColor: "#E5E7EB", borderRadius: 6 }} />
                <View style={{ height: 12, backgroundColor: "#E5E7EB", borderRadius: 6, width: "60%" }} />
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{
            paddingHorizontal: space(2),
            paddingVertical: space(2),
            gap: 14,
            paddingBottom: 24,
          }}
          renderItem={({ item }) => <MenuCard item={item} profile={profile} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────
// 카드 + 매크로바
function MenuCard({ item, profile }: { item: MenuItem; profile: Profile | null }) {
  const width = W - space(2) * 2;

  return (
    <Pressable
      onPress={() => {}}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
    >
      <Card style={{ borderRadius: radius.lg, overflow: "hidden" }}>
        <ImageBackground
          source={{ uri: item.photo }}
          style={{ width: "100%", height: 180, justifyContent: "flex-end" }}
          imageStyle={{ resizeMode: "cover" }}
        >
          {/* 상단 라벨 */}
          <View
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              backgroundColor: "rgba(0,0,0,0.45)",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>
              {item.kcal} kcal
            </Text>
          </View>

          {/* 하단 그라데이션 블러 */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
            style={{ width: "100%", padding: 12 }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "800" }}>
              {item.name}
            </Text>
            <Text style={{ color: "white", opacity: 0.9, marginTop: 2 }}>
              {item.category} • C {item.macro.carb}% · P {item.macro.protein}% · F {item.macro.fat}%
            </Text>
          </LinearGradient>
        </ImageBackground>

        {/* 본문: 간단 매크로 바 + 버튼 행 */}
        <View style={{ padding: 12, gap: 10 }}>
          <MacroBar macro={item.macro} target={profile?.macro} width={width - 24} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip compact style={{ backgroundColor: "#EEF2FF" }} textStyle={{ color: "#4338CA" }}>
              깔끔한 맛
            </Chip>
            <Chip compact style={{ backgroundColor: "#ECFDF5" }} textStyle={{ color: "#065F46" }}>
              단백질 +
            </Chip>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function MacroBar({
  macro,
  target,
  width,
}: {
  macro: { carb: number; protein: number; fat: number };
  target?: { carb: number; protein: number; fat: number };
  width: number;
}) {
  // 실제 비율 (합 100 기준으로 들어온다고 가정)
  const c = macro.carb;
  const p = macro.protein;
  const f = macro.fat;

  return (
    <View style={{ gap: 6 }}>
      {/* 색 막대 */}
      <View
        style={{
          width,
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "#E5E7EB",
          flexDirection: "row",
        }}
      >
        <View style={{ width: `${c}%`, backgroundColor: "#60A5FA" }} />
        <View style={{ width: `${p}%`, backgroundColor: "#34D399" }} />
        <View style={{ width: `${f}%`, backgroundColor: "#F59E0B" }} />
      </View>
      {/* 라벨 */}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "#374151" }}>탄수화물 {c}%</Text>
        <Text style={{ color: "#374151" }}>단백질 {p}%</Text>
        <Text style={{ color: "#374151" }}>지방 {f}%</Text>
      </View>
      {/* 목표가 있으면 작은 가이드 텍스트 */}
      {target && (
        <Text style={{ color: "#6B7280", fontSize: 12 }}>
          목표 C{target.carb}/P{target.protein}/F{target.fat} 대비 추천
        </Text>
      )}
    </View>
  );
}
