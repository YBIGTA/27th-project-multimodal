// lib/api.ts
export type Box = { x:number; y:number; w:number; h:number; label?:string; score?:number };

export type InferenceResp = {
  imageUrl: string;
  boxes: Box[];
  menuCandidates: Array<{ name:string; score:number }>;
  nutrition: {
    name: string;
    kcal: number;
    macro: { carb:number; protein:number; fat:number };
    allergens: string[];
  }[];
};

// 데모용: 가짜 응답. 추후 fetch(...)로 교체하면 됨.
export async function apiInfer(form: FormData): Promise<InferenceResp> {
  await new Promise(r => setTimeout(r, 600)); // 로딩 느낌
  return {
    imageUrl: "local-selected",
    boxes: [{ x:0.08, y:0.12, w:0.84, h:0.6, label:"불고기덮밥", score:0.92 }],
    menuCandidates: [
      { name:"불고기덮밥", score:0.92 },
      { name:"소불고기정식", score:0.73 },
      { name:"돼지불고기덮밥", score:0.61 },
    ],
    nutrition: [{
      name:"불고기덮밥",
      kcal: 620,
      macro: { carb:85, protein:23, fat:15 },
      allergens:["대두","밀","계란"]
    }]
  };
}
