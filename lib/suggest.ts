// lib/suggest.ts
export type Macro = { carb:number; protein:number; fat:number };
export type Profile = { targetKcal:number; macro:Macro; prefers:string[]; allergens:string[] };
export type Suggestion = { title:string; reason:string; items:string[] };

function pickBase(prefers:string[]){
  const map: Record<string,string[]> = {
    "한식": ["닭가슴살 비빔밥(밥 1/2)", "두부스테이크 + 샐러드", "연어 덮밥(소스 적게)"],
    "샐러드": ["치킨 샐러드 + 달걀", "그릭요거트 + 견과", "콩샐러드"],
    "면": ["메밀소바(곱배기X)", "쌀국수(면 2/3)", "곤약면 비빔"],
    "덮밥": ["포케(밥 1/2)", "채소많은 비빔밥(고추장 적게)", "큐브스테이크 덮밥(밥 1/2)"],
    "양식": ["연어 스테이크 + 사이드샐러드", "구운 치킨 + 구운야채", "통밀 파스타(소스 적게)"],
    "일식": ["사시미 덮밥(밥 1/2)", "연어/참치 초밥(밥 적게)", "가정식 작은 접시들"],
  };
  for (const p of prefers) if (map[p]) return map[p];
  return ["두부스테이크", "구운 닭가슴살 + 샐러드", "연어포케(밥 1/2)"];
}

export function suggestNextMeal(
  meal: { kcal:number; macro:Macro; allergens:string[] },
  profile: Profile
): Suggestion[] {
  const s: Suggestion[] = [];
  const perMeal = Math.round(profile.targetKcal/3);
  const kcalDiff = meal.kcal - perMeal;

  if (kcalDiff > 120) {
    s.push({
      title: "다음 끼니는 가볍게",
      reason: `이번 끼니가 목표 대비 +${kcalDiff} kcal 높아요.`,
      items: ["샐러드 + 삶은 달걀", "두부/콩 단백질 위주", "밥·빵·면은 반 공기 이하"],
    });
  } else if (kcalDiff < -120) {
    s.push({
      title: "부족한 에너지를 보충",
      reason: `이번 끼니가 목표 대비 ${Math.abs(kcalDiff)} kcal 낮아요.`,
      items: ["고구마/현미 소량 추가", "단백질 1서빙 보강", "아보카도/견과 소량"],
    });
  }

  const total = meal.macro.carb + meal.macro.protein + meal.macro.fat || 1;
  const pct = {
    carb: Math.round((meal.macro.carb/total)*100),
    protein: Math.round((meal.macro.protein/total)*100),
    fat: Math.round((meal.macro.fat/total)*100),
  };
  const gap = (k: keyof Macro)=> pct[k] - profile.macro[k];

  if (gap("protein") < -10) s.push({
    title: "단백질 보강",
    reason: "단백질 비율이 목표보다 낮았어요.",
    items: ["계란/닭가슴살/연어", "그릭요거트 + 견과", "두부/콩 반찬"],
  });
  if (gap("carb") > 10) s.push({
    title: "탄수화물 줄이기",
    reason: "탄수화물 비율이 높았어요.",
    items: ["밥·면 1/2로", "채소 양 늘리기", "당류/소스 줄이기"],
  });
  if (gap("fat") > 10) s.push({
    title: "지방 가볍게",
    reason: "지방 비율이 높았어요.",
    items: ["구이·찜 위주", "버터/마요 적게", "견과는 소량"],
  });

  const hit = meal.allergens.filter(a=> profile.allergens.includes(a));
  if (hit.length) s.push({
    title: "알레르겐 주의",
    reason: `${hit.join(", ")} 성분이 포함됐어요.`,
    items: ["성분표 확인", "동일 알레르겐은 다음 끼니 회피"],
  });

  s.push({
    title: "선호 기반 추천",
    reason: "선호 카테고리를 반영했어요.",
    items: pickBase(profile.prefers),
  });

  return s;
}
