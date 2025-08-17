// lib/eval.ts
export function evaluate(
  meal: { kcal:number; macro:{carb:number; protein:number; fat:number} },
  profile: { targetKcal:number; macro:{carb:number; protein:number; fat:number}; allergens:string[] },
  foodAllergens: string[]
) {
  let score = 100;
  const msgs:string[] = [];

  // 끼니 기준 칼로리 목표(대충 1/3) 비교
  const targetPerMeal = Math.round(profile.targetKcal / 3);
  const diff = meal.kcal - targetPerMeal;
  if (Math.abs(diff) > 150) {
    score -= 10;
    msgs.push(diff > 0 ? "이번 끼니 칼로리가 목표보다 높아요." : "조금 더 드셔도 좋습니다.");
  }

  // 비율 차이(±10% 이상이면 감점)
  const total = meal.macro.carb + meal.macro.protein + meal.macro.fat || 1;
  const pct = {
    carb: Math.round((meal.macro.carb / total) * 100),
    protein: Math.round((meal.macro.protein / total) * 100),
    fat: Math.round((meal.macro.fat / total) * 100),
  };
  (["carb","protein","fat"] as const).forEach(k=>{
    const want = profile.macro[k]; const got = pct[k];
    if (Math.abs(got - want) > 10) {
      score -= 5;
      const label = k==="carb" ? "탄수화물" : k==="protein" ? "단백질" : "지방";
      msgs.push(`${label} 비율이 목표와 차이가 있어요.`);
    }
  });

  // 알레르겐 경고
  const hit = foodAllergens.filter(a => profile.allergens.includes(a));
  if (hit.length) {
    score -= 20;
    msgs.push(`알레르겐(${hit.join(", ")}) 포함! 주의하세요.`);
  }

  if (score > 95) msgs.unshift("아주 좋아요! 목표와 잘 맞아요.");
  else if (score > 80) msgs.unshift("전체적으로 괜찮아요.");
  else msgs.unshift("균형이 조금 아쉬워요. 다음 끼니 조절을 추천!");

  return { score: Math.max(0, Math.min(100, score)), advice: msgs };
}
