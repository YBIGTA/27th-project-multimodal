import { LinearGradient } from "expo-linear-gradient";
import { MotiView, useAnimationState } from "moti";
import { Pressable, Text, View } from "react-native";
import { palette, radius } from "../theme";

type Props = { title:string; onPress:()=>void; variant?: "primary"|"outline" };

export default function FancyButton({ title, onPress, variant="primary" }:Props){
  const state = useAnimationState({
    idle:{ scale:1 },
    pressed:{ scale:0.97 }
  });

  if(variant==="outline"){
    return (
      <Pressable
        onPress={onPress}
        onPressIn={()=>state.transitionTo("pressed")}
        onPressOut={()=>state.transitionTo("idle")}
        android_ripple={{ color:"#00000011" }}
        style={{ borderWidth:1, borderColor:"#E5E7EB", borderRadius: radius.lg, overflow:"hidden" }}
      >
        <MotiView state={state} transition={{ type:"timing", duration:120 }}>
          <View style={{ paddingVertical:14, paddingHorizontal:18, alignItems:"center" }}>
            <Text style={{ fontWeight:"700", color: palette.primary }}>{title}</Text>
          </View>
        </MotiView>
      </Pressable>
    );
  }

  // primary (그라데이션 + 그림자)
  return (
    <Pressable
      onPress={onPress}
      onPressIn={()=>state.transitionTo("pressed")}
      onPressOut={()=>state.transitionTo("idle")}
      android_ripple={{ color:"#ffffff33" }}
      style={{ borderRadius: radius.lg, overflow:"hidden", shadowColor: palette.primary, shadowOpacity:0.25, shadowRadius:10, elevation:4 }}
    >
      <MotiView state={state} transition={{ type:"timing", duration:120 }}>
        <LinearGradient
          colors={[palette.primary, palette.primaryDark]}
          start={{x:0,y:0}} end={{x:1,y:1}}
          style={{ paddingVertical:14, paddingHorizontal:18, alignItems:"center" }}
        >
          <Text style={{ color:"#fff", fontWeight:"700" }}>{title}</Text>
        </LinearGradient>
      </MotiView>
    </Pressable>
  );
}
