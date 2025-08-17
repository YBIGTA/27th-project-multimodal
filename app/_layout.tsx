// app/_layout.tsx
import { Inter_400Regular, Inter_600SemiBold, useFonts } from "@expo-google-fonts/inter";
import { NotoSansKR_400Regular, NotoSansKR_700Bold } from "@expo-google-fonts/noto-sans-kr";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { PaperProvider, Portal } from "react-native-paper";
import { paperTheme } from "../theme";

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    NotoSansKR_400Regular,
    NotoSansKR_700Bold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
      {/* Portal.Host로 감싸서 Dialog/BottomSheet 같은 Portal 컴포넌트가
         화면 최상단에서 정상 동작하도록 함 */}
      <Portal.Host>
        <Stack screenOptions={{ headerShown: false }} />
        {/* /(tabs) 그룹, /login, /signup 가 자동으로 포함됩니다 */}
      </Portal.Host>
    </PaperProvider>
  );
}