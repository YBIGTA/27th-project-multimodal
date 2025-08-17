// app/(tabs)/calendar.tsx
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
    "1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"
  ],
  monthNamesShort: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
  dayNames: ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"],
  dayNamesShort: ["일","월","화","수","목","금","토"],
  today: "오늘",
};
LocaleConfig.defaultLocale = "ko";

type Rec = {
  id?: string | number;
  date: string;           // YYYY-MM-DD
  menu?: string;
  kcal?: number;
  macro?: { carb:number; protein:number; fat:number };
};

export default function CalendarTab() {
  const [all, setAll] = useState<Rec[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
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

  // 달력 표시용 마킹(기록이 있는 날짜 점 표시, 선택 날짜는 보라색)
  const marked = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of all) {
      m[r.date] = { ...(m[r.date] || {}), marked: true, dotColor: "#7C3AED" };
    }
    m[date] = { ...(m[date] || {}), selected: true, selectedColor: "#7C3AED" };
    return m;
  }, [all, date]);

  const totalKcal = items.reduce((s, it) => s + (it.kcal ?? 0), 0);

  const onToday = () => setDate(new Date().toISOString().slice(0,10));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.bg }}>
      <View style={{ padding: space(2), gap: space(2) }}>
        <Text style={{ fontSize:22, fontWeight:"800" }}>식단 기록</Text>

        {/* 달력 */}
        <Card style={{ borderRadius: radius.lg }}>
          <Card.Content>
            <Calendar
              markingType="dot"
              markedDates={marked}
              onDayPress={(d: DateData) => setDate(d.dateString)}
              theme={{
                todayTextColor: "#7C3AED",
                arrowColor: "#7C3AED",
                selectedDayBackgroundColor: "#7C3AED",
                textDayFontWeight: "600",
              }}
            />
            <View style={{ flexDirection:"row", justifyContent:"space-between", marginTop: 8 }}>
              <Text style={{ fontWeight:"700" }}>{date} 기록</Text>
              <Button compact onPress={onToday}>오늘로</Button>
            </View>
          </Card.Content>
        </Card>

        {/* 선택 날짜 요약 */}
        <Card style={{ borderRadius: radius.lg }}>
          <Card.Content style={{ gap:6 }}>
            <Text>합계: <Text style={{ fontWeight:"700" }}>{totalKcal} kcal</Text></Text>
            <Divider />
            {items.length === 0 ? (
              <Text style={{ color:"#6B7280", marginTop: 6 }}>이 날의 기록이 없어요.</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(it) => String(it.id)}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <Card mode="contained" style={{ borderRadius: 12, backgroundColor:"#F8FAFF" }}>
                    <Card.Content style={{ flexDirection:"row", justifyContent:"space-between" }}>
                      <View>
                        <Text style={{ fontWeight:"700" }}>{item.menu ?? "메뉴"}</Text>
                        {item.macro ? (
                          <Text style={{ color:"#6B7280" }}>
                            C{item.macro.carb}% · P{item.macro.protein}% · F{item.macro.fat}%
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontWeight:"700" }}>{item.kcal ?? 0} kcal</Text>
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
