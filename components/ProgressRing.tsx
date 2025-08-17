// components/ProgressRing.tsx
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

export default function ProgressRing({
  size = 160,
  stroke = 14,
  progress = 0,            // 0 ~ 1
  labelTop,
  labelMid,
  labelBot,
}: {
  size?: number;
  stroke?: number;
  progress?: number;
  labelTop?: string;
  labelMid?: string;       // 가운데 굵은 숫자 등
  labelBot?: string;
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(progress, 0), 1);
  const dash = circumference * pct;
  const gap = circumference - dash;

  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <Svg width={size} height={size}>
        {/* 배경 링 */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="#E5E7EB"
          strokeWidth={stroke}
          fill="none"
        />
        {/* 진행 링 */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="#7C3AED"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          rotation="-90"
          origin={`${cx},${cy}`}
          strokeDasharray={`${dash},${gap}`}
        />
      </Svg>

      {/* 가운데 라벨 */}
      <View style={{ position: "absolute", alignItems: "center" }}>
        {labelTop ? <Text style={{ color:"#6B7280" }}>{labelTop}</Text> : null}
        {labelMid ? <Text style={{ fontSize: 22, fontWeight: "800" }}>{labelMid}</Text> : null}
        {labelBot ? <Text style={{ color:"#6B7280" }}>{labelBot}</Text> : null}
      </View>
    </View>
  );
}
