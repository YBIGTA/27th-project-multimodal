// theme.ts
import { configureFonts, MD3LightTheme, MD3Theme } from "react-native-paper";

export const palette = {
  primary: "#7C3AED",
  primaryDark: "#5B21B6",
  bg: "#F6F7FB",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  success: "#10B981",
  warn: "#F59E0B",
  danger: "#EF4444",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24 };
export const space = (n = 1) => 8 * n;

/** MD3 타입스케일 키로 설정 (타입 명시 없이 사용) */
const fontConfig = {
  displayLarge:   { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },
  displayMedium:  { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },
  displaySmall:   { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },

  headlineLarge:  { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },
  headlineMedium: { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },
  headlineSmall:  { fontFamily: "NotoSansKR_700Bold",  fontWeight: "700" as const },

  titleLarge:     { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },
  titleMedium:    { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },
  titleSmall:     { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },

  labelLarge:     { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },
  labelMedium:    { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },
  labelSmall:     { fontFamily: "Inter_600SemiBold",   fontWeight: "600" as const },

  bodyLarge:      { fontFamily: "NotoSansKR_400Regular", fontWeight: "400" as const },
  bodyMedium:     { fontFamily: "NotoSansKR_400Regular", fontWeight: "400" as const },
  bodySmall:      { fontFamily: "NotoSansKR_400Regular", fontWeight: "400" as const },
} as const;

export const paperTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    background: palette.bg,
    surface: palette.card,
    onSurface: palette.text,
  },
  roundness: 14,
  // ⬇️ 버전 차이로 인한 타입불일치 방지용 캐스팅
  fonts: configureFonts({ config: fontConfig as any }),
};
