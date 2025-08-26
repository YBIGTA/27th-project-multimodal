// app/(tabs)/index.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { Card, Chip, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadJSON } from "../../lib/storage";
import { menuAPI } from "../../lib/api"; // Import menuAPI
import { palette, radius, space } from "../../theme";
import type { Profile } from "../../lib/types";
import { useFocusEffect } from "@react-navigation/native";

const W = Dimensions.get("window").width;

type MenuItem = {
  id: string;
  name: string;
  kcal?: number; // Now optional, as it comes from backend
  macro?: { carb_g: number; protein_g: number; fat_g: number }; // Now optional, as it comes from backend
  category: string; // Simplified, as it comes from backend
  // Add other fields from MenuWithNutrition if needed for display
};

// nutrition 그램 → %로 환산
function macroPercentFromGrams(n?: {
  carb_g?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
}) {
  const cg = Number(n?.carb_g ?? 0);
  const pg = Number(n?.protein_g ?? 0);
  const fg = Number(n?.fat_g ?? 0);

  const cKcal = cg * 4;
  const pKcal = pg * 4;
  const fKcal = fg * 9;
  const total = cKcal + pKcal + fKcal;

  if (total <= 0) return { carb: 50, protein: 25, fat: 25 }; // 폴백

  const carb = Math.round((cKcal / total) * 100);
  const protein = Math.round((pKcal / total) * 100);
  let fat = 100 - carb - protein; // 합 100 보정
  if (fat < 0) fat = 0;
  return { carb, protein, fat };
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cat, setCat] = useState<string>("전체"); // Changed type to string
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<string[]>([]); // New state for dynamic categories

  // ✅ 실제 추천 결과
  const [items, setItems] = useState<MenuItem[]>([]);

  // 프로필 로드 (화면 포커스 시 다시 로드)
  useFocusEffect(
    useCallback(() => {
      const loadProfile = async () => {
        const p = await loadJSON<Profile | null>("profile", null);
        console.log("Loaded profile:", p);
        setProfile(p);
        setLoading(false);
      };
      loadProfile();
    }, [])
  );

  // Set categories from profile
  useEffect(() => {
    console.log("Profile in useEffect:", profile);
    if (profile?.like_cuisines && profile.like_cuisines.length > 0) {
      setCategories(["전체", ...profile.like_cuisines]);
    } else {
      // Fallback if profile or preferences are not available
      const fetchAllCategories = async () => {
        try {
          const response = await menuAPI.getMenuCategories();
          setCategories(["전체", ...response.data]);
        } catch (error) {
          console.error("Failed to fetch categories:", error);
          setCategories(["전체"]);
        }
      };
      fetchAllCategories();
    }
  }, [profile]);

  // ✅ Fetch menus by category
  const fetchMenus = useCallback(
    async (category: string) => { // category is now required
      try {
        let allMenus: any[] = [];
        if (category === "전체") {
          if (profile?.like_cuisines && profile.like_cuisines.length > 0) {
            const menuPromises = profile.like_cuisines.map(c => menuAPI.getMenusByCategory(c));
            const results = await Promise.all(menuPromises);
            allMenus = results.flatMap(res => res.data);
          } else {
            // Fallback to searching all menus if no preferences are set
            const res = await menuAPI.searchMenu("");
            allMenus = res.data;
          }
        } else {
          const res = await menuAPI.getMenusByCategory(category);
          allMenus = res.data;
        }

        // The response from getMenusByCategory will be List[MenuWithNutrition]
        const mapped: MenuItem[] = (allMenus ?? []).map((m: any, i: number) => {
          // Need to map backend MenuWithNutrition schema to frontend MenuItem type
          return {
            id: String(m.menu_id ?? m.food_code ?? i + 1),
            name: m.std_name ?? "이름 없음",
            kcal: m.kcal ?? 0, // Use kcal from backend
            macro: m.macro ?? { carb_g: 0, protein_g: 0, fat_g: 0 }, // Use macro from backend
            category: m.category ?? "기타",
          };
        });

        setItems(mapped); // Set items directly
      } catch (e) {
        console.error("메뉴 불러오기 실패:", e);
        setItems([]); // 실패 시 빈 리스트
      }
    },
    [profile] // Add profile to dependency array
  );

  // First load/category change
  useEffect(() => {
    if (!loading) fetchMenus(cat);
  }, [loading, cat, fetchMenus]);

  // 당겨서 새로고침
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMenus(cat);
    setRefreshing(false);
  }, [fetchMenus, cat]);

  // 선호 카테고리 약한 정렬 (This logic might be removed if not needed for simple menu listing)
  // const data = useMemo(() => {
  //   const prefers = profile?.prefers ?? [];
  //   if (!items.length || !prefers.length) return items;
  //   const copy = [...items];
  //   copy.sort((a, b) => Number(prefers.includes(b.category)) - Number(prefers.includes(a.category)));
  //   return copy;
  // }, [items, profile]);
  // For now, just use items directly
  const data = items;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* 히어로 헤더 */}
      <View style={{ paddingHorizontal: space(2), paddingTop: space(1) }}>
        <View
          style={{
            backgroundColor: palette.primary,
            borderRadius: radius.xl,
            paddingVertical: space(3),
            paddingHorizontal: space(3),
          }}
        >
          <Text style={{ color: "white", fontSize: 22, fontWeight: "800" }}>
            BOBZIP의 추천 메뉴
          </Text>
          <Text style={{ color: "white", opacity: 0.9, marginTop: 6 }}>
            {profile?.daily_kcal_goal
              ? `목표 ${profile.daily_kcal_goal} kcal • 탄수화물 ${profile.macro_ratio?.carb_g ?? 50}g / 단백질 ${profile.macro_ratio?.protein_g ?? 25}g / 지방 ${profile.macro_ratio?.fat_g ?? 25}g`
              : "목표를 설정하면 더 정확히 추천해줘요"}
          </Text>
        </View>
      </View>

      {/* 카테고리 칩 */}
      <View
        style={{
          paddingHorizontal: space(2),
          paddingTop: space(2),
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {categories.map((c) => (
          <Chip
            key={c}
            selected={cat === c}
            onPress={() => setCat(c)}
            compact
            style={{ backgroundColor: cat === c ? palette.primary : "#F3F4F6" }}
            textStyle={{
              color: cat === c ? "white" : palette.text,
              fontWeight: cat === c ? "700" : "500",
            }}
          >
            {c}
          </Chip>
        ))}
      </View>

      {/* 리스트 (이미지 없음: 텍스트만) */}
      {loading ? (
        <View style={{ padding: space(2), gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <Card key={i} style={{ borderRadius: radius.lg, padding: 14 }}>
              <View style={{ height: 18, backgroundColor: "#E5E7EB", borderRadius: 6, width: "60%", marginBottom: 8 }} />
              <View style={{ height: 12, backgroundColor: "#E5E7EB", borderRadius: 6, width: "40%" }} />
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
            gap: 12,
            paddingBottom: 24,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <Card style={{ borderRadius: radius.lg, padding: 14, backgroundColor: palette.card }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
                {item.name}
              </Text>
              <Text style={{ color: "#4B5563", marginTop: 4 }}>
                {item.category} • {item.kcal ? `${Math.round(item.kcal)} kcal` : "영양정보 없음"}
              </Text>
              {item.macro && ( // Only display macro if available
                <Text style={{ color: "#6B7280", marginTop: 2, fontSize: 12 }}>
                  탄수화물 {Math.round(item.macro.carb_g)}g / 단백질 {Math.round(item.macro.protein_g)}g / 지방 {Math.round(item.macro.fat_g)}g
                </Text>
              )}
            </Card>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
