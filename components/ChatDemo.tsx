// components/ChatDemo.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Card, Text } from "react-native-paper";

type ChatMsg = { id: string; role: "user" | "ai"; text: string };

type Props = {
  mealName: string;
  score: number;
  advice: string[];
  suggestions: { title: string; reason: string; items: string[] }[];
};

// 고유 ID 생성 함수
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export default function ChatDemo({ mealName, score, advice, suggestions }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { id: genId("u"), role: "user", text: `오늘 식사는 ${mealName}이에요.` },
  ]);

  useEffect(() => {
    const base: ChatMsg[] = [
      { id: genId("ai"), role: "ai", text: `총평 점수는 ${score}점이에요.` },
      { id: genId("ai"), role: "ai", text: advice.length ? advice.join("\n") : "전반적으로 괜찮아요!" },
    ];

    const fromSug: ChatMsg[] = suggestions.flatMap((s) => ([
      { id: genId("sug"), role: "ai", text: `• ${s.title}` },
      { id: genId("sug"), role: "ai", text: `이유: ${s.reason}` },
      { id: genId("sug"), role: "ai", text: `제안: ${s.items.slice(0,3).join(" · ")}` },
    ]));

    const queue = base.concat(fromSug);

    let t = 0;
    queue.forEach(m => {
      t += 450;
      const timer = setTimeout(() => setMsgs(prev => [...prev, m]), t);
      return () => clearTimeout(timer);
    });
  }, [mealName, score, advice, suggestions]);

  return (
    <View style={{ gap: 8 }}>
      {msgs.map(item => (
        <View
          key={item.id}
          style={{
            alignSelf: item.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
          }}
        >
          <Card
            style={{
              backgroundColor: item.role === "user" ? "#7C3AED" : "#EEF0F6",
              borderRadius: 14,
            }}
          >
            <Text
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: item.role === "user" ? "white" : "#111827",
                lineHeight: 20,
              }}
            >
              {item.text}
            </Text>
          </Card>
        </View>
      ))}
    </View>
  );
}