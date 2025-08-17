import { Text, View } from "react-native";
import { palette, radius, space } from "../theme";

export default function Section({ title, right, children }:{
  title?:string; right?:React.ReactNode; children:React.ReactNode;
}){
  return (
    <View style={{ gap:8 }}>
      {(title || right) && (
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-end", paddingHorizontal:4 }}>
          <Text style={{ fontSize:18, fontWeight:"700", color: palette.text }}>{title}</Text>
          {right}
        </View>
      )}
      <View style={{ backgroundColor:"#fff", borderRadius: radius.lg, padding: space(2), shadowColor:"#000", shadowOpacity:0.06, shadowRadius:12, elevation:2 }}>
        {children}
      </View>
    </View>
  );
}
