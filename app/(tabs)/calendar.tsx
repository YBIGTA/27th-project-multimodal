// app/(tabs)/calendar.tsx
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { Calendar, DateData, LocaleConfig } from "react-native-calendars";
import { Button, Card, Divider, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { listRecords, listRecordsByDate } from "../../lib/records";
import { palette, radius, space } from "../../theme";

// 한국어 로케일
LocaleConfig.locales["ko"] = {
  monthNames: [
    "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"
  ],
  monthNamesShort: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  dayNames: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
  dayNamesShort: ["일", "월", "화", "수", "목", "금", "토"],
  today: "오늘",
};
LocaleConfig.defaultLocale = "ko";

type Rec = {
  id?: string | number;
  date: string;           // YYYY-MM-DD
  menu?: string;
  kcal?: number;
  macro?: { carb_g: number; protein_g: number; fat_g: number };
};

export default function CalendarTab() {
  const tabBarH = useBottomTabBarHeight();
  const [all, setAll] = useState<Rec[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Rec[]>([]);

  // 전체 기록 로드 + 선택 날짜 기록 로드
  useEffect(() => {
    (async () => {
      const a = await listRecords();
      setAll(a);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const d = await listRecordsByDate(date);
      setItems(d);
    })();
  }, [date]);

  // 달력 표시용 마킹(기록이 있는 날짜 점 표시, 선택 날짜는 테마 색상)
  const marked = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of all) {
      m[r.date] = { ...(m[r.date] || {}), marked: true, dotColor: palette.primary };
    }
    m[date] = { ...(m[date] || {}), selected: true, selectedColor: palette.primary };
    return m;
  }, [all, date]);

  const totalKcal = items.reduce((s, it) => s + (it.kcal ?? 0), 0);

  const onToday = () => setDate(new Date().toISOString().slice(0, 10));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={{ padding: space(2), flex: 1, paddingBottom: tabBarH }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>식단 기록</Text>

        {/* 달력 */}
        <Card style={{ borderRadius: radius.lg, marginBottom: space(2), backgroundColor: palette.card, elevation: 0 }}>
          <Card.Content>
            <Calendar
              markingType="dot"
              markedDates={marked}
              onDayPress={(d: DateData) => setDate(d.dateString)}
              theme={{
                todayTextColor: palette.primary,
                arrowColor: palette.primary,
                selectedDayBackgroundColor: palette.primary,
                textDayFontWeight: "600",
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ fontWeight: "700" }}>{date} 기록</Text>
              <Button compact onPress={onToday}>오늘로</Button>
            </View>
          </Card.Content>
        </Card>

        {/* 선택 날짜 요약 */}
        <Card style={{ borderRadius: radius.lg, flex: 1, marginBottom: space(2), backgroundColor: palette.card, elevation: 0 }}>
          <Card.Content style={{ flex: 1, flexDirection: 'column', justifyContent: 'flex-start' }}>
            <Text>합계: <Text style={{ fontWeight: "700" }}>{Math.round(totalKcal)} kcal</Text></Text>
            <Divider />
            {items.length === 0 ? (
              <Text style={{ color: "#6B7280", marginTop: 6 }}>이 날의 기록이 없어요.</Text>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={items}
                keyExtractor={(it) => String(it.id)}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <Card mode="contained" style={{ borderRadius: 12, backgroundColor: "#F8FAFF" }}>
                    <Card.Content style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View>
                        <Text style={{ fontWeight: "700" }}>{item.menu ?? "메뉴"}</Text>
                        {item.macro ? (
                          <Text style={{ color: "#6B7280" }}>
                            탄수화물 {Math.round(item.macro.carb_g)}g · 단백질 {Math.round(item.macro.protein_g)}g · 지방 {Math.round(item.macro.fat_g)}g
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontWeight: "700" }}>{Math.round(item.kcal ?? 0)} kcal</Text>
                    </Card.Content>
                  </Card>
                )}
              />
            )}
          </Card.Content>
        </Card>
      </View>
    </SafeAreaView>
  );
}
