// components/RingProgress.tsx
import React from "react";
import Svg, { Circle } from "react-native-svg";

type Props = {
  size?: number;          // 전체 크기
  strokeWidth?: number;   // 선 굵기
  progress: number;       // 0 ~ 1
  color?: string;         // 진행 색
  bgColor?: string;       // 배경 링 색
};

export default function RingProgress({
  size = 120,
  strokeWidth = 10,
  progress,
  color = "#7C3AED",
  bgColor = "#E5E7EB",
}: Props) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;                         // 둘레
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 배경 링 */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={bgColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* 진행 링 (위쪽 12시 방향에서 시작하도록 -90deg 회전) */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
