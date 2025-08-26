// components/Chat.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { loadJSON } from '../lib/storage'; // Import loadJSON
import { jwtDecode } from 'jwt-decode'; // Import jwtDecode

/* === Types === */
export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
};

export interface FoodRecognitionResult {
  food_name: string;
  confidence: number;
  nutrition_info?: { [key: string]: any };
  serving_size?: number;
}

type QuickKey = "overview" | "balance" | "pairing" | "planner";
type ThemeKey = "light" | "glass" | "dark";

export interface ChatProps {
  mealName?: string;
  apiBase?: string;
  onSend?: (
    text: string,
    ctx: { quick?: QuickKey; menuName?: string; history: Message[] }
  ) => Promise<string> | string;
  initialFoodRecognition?: FoodRecognitionResult; // New prop
}

/* === Data === */
const QUICK_MENUS: Array<{ key: QuickKey; label: string; emoji: string; guide: string }> = [
  { key: "overview", label: "영양 한눈에", emoji: "👀", guide: "칼로리·탄단지·나트륨 핵심만 요약해 드릴게요." },
  { key: "balance", label: "균형 플러스", emoji: "⚖️", guide: "함께 먹으면 좋은 영양 균형 기반 반찬/사이드를 추천해 드릴게요." },
  { key: "pairing", label: "푸드 페어링", emoji: "🧩", guide: "음료·반찬 조합에 대한 정보를 칼로리 관리 / 영양 균형 / 건강·성분 관점에서 분석해 드릴게요." },
  { key: "planner", label: "칼로리 플래너", emoji: "📅", guide: "남은 칼로리에 맞춰 목표를 달성하기 위한 음식을 추천해 드릴게요." },
];

const QUICK_TIPS: Record<QuickKey, string> = {
  overview: `\n예) "영양 정보 줘"`,
  balance: `\n예) "김치찌개랑 어울리는 메뉴 추천"`,
  pairing: `\n예) "갈비탕에 제로콜라 먹어도 될까?"`,
  planner: `\n예) "남은 칼로리 맞춰 저녁 추천"`,
};

/* === Utils === */
const niceId = () => Math.random().toString(36).slice(2);
const envApiBase = () => 'https://bobproject-server.onrender.com/v1';

const welcomeText = (mealName?: string) =>
  `안녕하세요, 헬핏이에요! 😊
${mealName ? `${mealName} 드셨군요.` : "만나서 반가워요."} 오늘도 가볍게 건강 챙겨봐요.

아래 퀵 메뉴를 누르거나, 편하게 질문해 주세요.
예) 갈비탕+제로콜라 같이 먹어도 될까? / 오늘 목표 채우려면 저녁 뭐 먹지?`;

interface DecodedToken {
  sub: string;
  // Add other properties if needed
}

const getUserIdFromToken = async (): Promise<string | null> => {
  const token = await loadJSON<string | null>("token", null);
  console.log("getUserIdFromToken: Raw token: ", token);
  if (token) {
    try {
      const decoded: DecodedToken = jwtDecode(token);
      console.log("getUserIdFromToken: Decoded token: ", decoded);
      return decoded.sub;
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  }
  console.log("getUserIdFromToken: No token found.");
  return null;
};

/* === UI atoms === */
function Avatar({ emoji }: { emoji: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
    </View>
  );
}

function Bubble({ role, text, loading }: { role: Message["role"]; text: string; loading?: boolean }) {
  const isUser = role === "user";
  const bubbleStyle = isUser ? styles.userBubble : styles.assistBubble;
  const textStyle = isUser ? styles.userText : styles.assistText;
  return (
    <View style={[styles.bubble, bubbleStyle]}>
      <Text style={[styles.bubbleText, textStyle]}>{loading ? "…" : text}</Text>
    </View>
  );
}

function Chip({
  label,
  emoji,
  onPress,
  anim,
}: {
  label: string;
  emoji: string;
  onPress?: () => void;
  anim: Animated.Value;
}) {
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : undefined]}
      >
        <Text style={styles.chipEmoji}>{emoji}</Text>
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* === Main === */
export default function Chat({ mealName, apiBase, onSend, initialFoodRecognition }: ChatProps) {
  const router = useRouter();

  // 1초 지연 후 환영문 → 이후 퀵칩 순차 등장
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>("glass");

  const chipsAnims = useRef(QUICK_MENUS.map(() => new Animated.Value(0))).current;
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setMessages([{ id: niceId(), role: "assistant", text: welcomeText(mealName), createdAt: Date.now() }]);
      Animated.stagger(
        90,
        chipsAnims.map(a =>
          Animated.timing(a, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start();
    }, 1000);
    return () => clearTimeout(t);
  }, [mealName]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, loading]);

  const pushUser = (text: string) =>
    setMessages(m => [...m, { id: niceId(), role: "user", text, createdAt: Date.now() }]);
  const pushBot = (text: string) =>
    setMessages(m => [...m, { id: niceId(), role: "assistant", text, createdAt: Date.now() }]);

  const callApi = async (text: string, quick?: QuickKey) => {
    if (onSend) {
      const r = await onSend(text, { quick, menuName: mealName, history: messages });
      return typeof r === "string" ? r : String(r ?? "");
    }

    const base = apiBase || envApiBase();
    if (!base) return demoReply(text, quick);

    const userId = await getUserIdFromToken(); // Get user ID
    const token = await loadJSON<string | null>("token", null); // Load token for Authorization header

    if (!userId || !token) {
      console.error("User not authenticated. userId or token is null.");
      throw new Error("User not authenticated. Please log in.");
    }

    console.log("Chatbot API Call Details:");
    console.log("  Base URL:", base);
    console.log("  User ID:", userId);

    const requestBody: any = { // Temporarily use 'any' for flexibility
      message: text,
      user_context: {
        user_id: userId,
        // Add other user context fields if necessary, e.g., profile, preferences
      },
    };

    if (initialFoodRecognition) {
      requestBody.food_recognition = initialFoodRecognition;
    }

    console.log("  Request Body:", JSON.stringify(requestBody, null, 2));

    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/chatbot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`, // Add Authorization header
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        console.error("Chatbot API Response Not OK:");
        console.error("  Status:", res.status);
        console.error("  Status Text:", res.statusText);
        const errorBody = await res.text();
        console.error("  Response Body:", errorBody);
        throw new Error(`LLM 서버 오류: ${res.status} ${res.statusText} - ${errorBody}`);
      }

      const data = await res.json();
      return data.response ?? "";
    } catch (error) {
      console.error("Error during chatbot API call:", error);
      throw error; // Re-throw to be caught by handleSend
    }
  };


  const handleSend = async (text: string, quick?: QuickKey) => {
    const t = text.trim();
    if (!t) return;
    pushUser(t);
    setDraft("");
    setLoading(true);
    try {
      const reply = await callApi(t, quick);
      pushBot(reply || "(응답이 비었어요)");
    } catch {
      pushBot("앗, 잠시 문제가 있었어요. 다시 한 번만 부탁드릴게요 🙏");
    } finally {
      setLoading(false);
    }
  };

  const handleQuick = (q: QuickKey) => {
    const qm = QUICK_MENUS.find(x => x.key === q)!;
    pushBot(`${qm.emoji} ${qm.label}\n${qm.guide}${QUICK_TIPS[q]}`);
    inputRef.current?.focus();
  };

  return (
    <LinearGradient
      colors={
        theme === "dark" ? ["#0f1115", "#0b0e13"] :
          theme === "glass" ? ["#f8fbff", "#ebffc2ff"] :
            ["#ffffff", "#f6f7fb"]
      }
      style={{ flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }}
    >
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.headerWrap}>
          <Text style={styles.headerTitle}>헬핏</Text>

          {/* 닫기 버튼 */}
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#555" />
          </Pressable>

          <View style={styles.themeRow}>
            {(["light", "glass", "dark"] as ThemeKey[]).map(t => (
              <Pressable
                key={t}
                onPress={() => setTheme(t)}
                style={[styles.themeBtn, theme === t ? styles.themeBtnActive : undefined]}
              >
                <Text style={[styles.themeBtnText, theme === t ? styles.themeBtnTextActive : undefined]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Chat List */}
        <View style={styles.chatWrap}>
          <FlatList
            ref={listRef}
            data={
              [...messages,
              ...(loading ? [{ id: "loading", role: "assistant", text: "", createdAt: Date.now() } as Message] : []),
              ]}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={[styles.row, item.role === "user" ? styles.rowRight : styles.rowLeft]}>
                {item.role !== "user" && <Avatar emoji="🩺" />}
                <Bubble role={item.role} text={item.text} loading={item.id === "loading"} />
                {item.role === "user" && <Avatar emoji="🙂" />}
              </View>
            )}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Quick Chips — 중앙 배치 */}
        <View style={styles.quickRow}>
          {QUICK_MENUS.map((q, i) => (
            <Chip
              key={q.key}
              label={q.label}
              emoji={q.emoji}
              onPress={() => handleQuick(q.key)}
              anim={chipsAnims[i]}
            />
          ))}
        </View>

        {/* Input */}
        <View style={[styles.inputWrap, theme === "glass" && { backgroundColor: "#ffffff38" }]}>
          <View style={[styles.inputBox, theme === "glass" && { backgroundColor: "#ffffffcc" }]}>
            <TextInput
              ref={inputRef}
              placeholder="무엇이든 편하게 물어보세요…"
              placeholderTextColor="#9aa1ad"
              value={draft}
              onChangeText={setDraft}
              multiline
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={() => handleSend(draft)}
            />
            <Pressable
              onPress={() => handleSend(draft)}
              style={({ pressed }) => [styles.sendBtn, pressed ? styles.sendBtnPressed : undefined]}
            >
              <Text style={styles.sendText}>➤</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>예: "갈비탕 + 제로콜라 같이 먹어도 돼?"</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/* === Demo reply === */
function demoReply(text: string, quick?: QuickKey) {
  switch (quick) {
    case "overview":
      return "[영양 한눈에]\n총 620kcal / 탄단지 55·25·20 / 나트륨은 조금 높아요.";
    case "balance":
      return "[균형 플러스]\n부족: 식이섬유/비타민 C → 시금치나물·방울토마토·현미밥";
    case "pairing":
      return "[푸드 페어링]\n제로음료로 칼로리 부담↓ / 나트륨↑ → 채소/물 함께 권장";
    case "planner":
      return "[칼로리 플래너]\n남은 480kcal·P35g → 닭가슴살샐러드·연어덮밥 하프·요거트";
    default:
      return `좋아요! "${text}" 기준으로 도와볼게요.`;
  }
}

/* === Styles === */
const styles = StyleSheet.create({
  headerWrap: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#222" },

  closeBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffffaa",
  },

  themeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  themeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f2ffd7ff",
  },
  themeBtnActive: { backgroundColor: "#d6ff83ff", borderColor: "#3c5949" },
  themeBtnText: { fontSize: 11, color: "#6b6f7c" },
  themeBtnTextActive: { color: "#3c5949", fontWeight: "700" },

  chatWrap: { flex: 1, paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end", alignSelf: "flex-end" },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
  },

  bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  assistBubble: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ececec" },
  userBubble: { backgroundColor: "#92bc3d" },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  assistText: { color: "#23262b" },
  userText: { color: "white" },

  // ⬇ 중앙 배치
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    justifyContent: "center",
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8e0ff",
    backgroundColor: "#ffffffcc",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: "#3c5949",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  chipPressed: { transform: [{ scale: 0.98 }] },
  chipEmoji: { fontSize: 14, marginRight: 6 },
  chipText: { fontSize: 13, color: "#4a4f57", fontWeight: "700" },

  inputWrap: { padding: 12, paddingBottom: Platform.select({ ios: 22, android: 12 }), gap: 6 },
  inputBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: "#e9e6ff",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: { flex: 1, minHeight: 38, maxHeight: 120, fontSize: 15, color: "#222", paddingRight: 8 },
  sendBtn: { height: 38, minWidth: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#92bc3d" },
  sendBtnPressed: { transform: [{ scale: 0.98 }] },
  sendText: { color: "white", fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 11, color: "#8a8fa3", paddingHorizontal: 16 },
});
