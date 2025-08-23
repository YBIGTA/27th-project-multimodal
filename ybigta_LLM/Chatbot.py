import os 
import warnings
from typing import List, Set, Tuple, Optional
import numpy as np
import pandas as pd
from dotenv import load_dotenv

# --- 경고 억제(필요시) ---
warnings.filterwarnings("ignore", category=FutureWarning)

# --- LangChain / LLM / Embedding ---
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import ChatPromptTemplate, PromptTemplate

# =========================================
# 1) 기본 설정 & 유틸
# =========================================
def load_api_key() -> bool:
    """환경변수에서 GOOGLE_API_KEY 로드/검증"""
    load_dotenv()
    if os.getenv("GOOGLE_API_KEY"):
        return True
    print("🚨 경고: GOOGLE_API_KEY를 찾을 수 없습니다.")
    print("프로젝트 폴더에 .env 파일을 만들고 'GOOGLE_API_KEY=당신의API키' 형식으로 저장해주세요.")
    return False

def contains_any(text: str, keys) -> bool:
    return any(k in text for k in keys)

# 불용(컨텍스트 미갱신) 단어들
NO_CONTEXT_SINGLE_WORDS = {
    "고마워","감사","감사합니다","땡큐","thanks","thankyou","넵","네","응","예","그래",
    "좋아","맞아","오케이","ok","okk","ㅇㅇ","ㅇㅋ","ㅋ","ㅋㅋ","ㅋㅋㅋ","ㅎㅎ","ㅎㅎㅎ",
    "그래요","맞아요","알겠어","알겠습니다","고마웠어","감사해","굿","굿굿","완료","확인"
}

def normalize_text(s: str) -> str:
    return str(s).strip()

# =========================================
# 2) 데이터 로딩 & 정규화
# =========================================
def load_and_normalize_data(file_list):
    """
    여러 CSV를 로드하고 컬럼명을 표준화.
    표준 컬럼:
      food_name, serving_size, unit, calories, protein_g, fat_g, carbs_g, sugars_g, sodium_mg, tags, description
    """
    all_dfs = []
    standard_columns = [
        "food_name", "serving_size", "unit", "calories",
        "protein_g", "fat_g", "carbs_g", "sugars_g", "sodium_mg",
        "tags", "description"
    ]

    for file_path in file_list:
        try:
            df = pd.read_csv(file_path, encoding="utf-8")

            # 다양한 원본 컬럼을 표준 컬럼으로 매핑
            if "one_serving_size(g)" in df.columns:
                df = df.rename(columns={
                    "one_serving_size(g)": "serving_size",
                    "energy_kcal": "calories",
                    "carb_g": "carbs_g",
                })
                df["unit"] = "g"
            elif "serving_size(ml)" in df.columns:
                df = df.rename(columns={
                    "serving_size(ml)": "serving_size",
                    "energy_kcal": "calories",
                    "carb_g": "carbs_g",
                })
                df["unit"] = "ml"
            elif "serving_size(g)" in df.columns:
                df = df.rename(columns={
                    "serving_size(g)": "serving_size",
                    "energy_kcal": "calories",
                    "carb_g": "carbs_g",
                })
                df["unit"] = "g"

            df_aligned = pd.DataFrame()
            for col in standard_columns:
                if col in df.columns:
                    df_aligned[col] = df[col]

            all_dfs.append(df_aligned)
            print(f"✅ '{file_path}' 로드 및 정규화 완료.")
        except FileNotFoundError:
            print(f"❌ 경고: '{file_path}' 파일을 찾을 수 없어 건너뜁니다.")

    if not all_dfs:
        return None

    master_df = pd.concat(all_dfs, ignore_index=True)

    # 숫자 컬럼 안전 변환
    numeric_cols = ["serving_size", "calories", "protein_g", "fat_g", "carbs_g", "sugars_g", "sodium_mg"]
    for col in numeric_cols:
        if col in master_df.columns:
            master_df[col] = pd.to_numeric(master_df[col], errors="coerce")

    print(f"\n🎉 총 {len(all_dfs)}개 파일에서 {len(master_df)}개의 음식 정보를 성공적으로 통합 및 처리했습니다.")
    return master_df

# =========================================
# 3) 음식명 추출 유틸
# =========================================
def build_food_name_set(df: pd.DataFrame) -> Set[str]:
    names = set()
    if "food_name" in df.columns:
        names = set(df["food_name"].dropna().astype(str).map(normalize_text))
    return names

def find_food_in_text(text: str, food_names: Set[str]) -> Optional[str]:
    """
    문장 안에서 등록된 음식명이 포함되어 있으면 길이 긴 것 우선으로 하나 반환.
    """
    t = normalize_text(text)
    for name in sorted(food_names, key=len, reverse=True):
        if name and name in t:
            return name
    return None

def get_context_row_by_name(df: pd.DataFrame, name: str) -> Optional[dict]:
    sub = df[df["food_name"] == name]
    if not sub.empty:
        return sub.iloc[0].to_dict()
    return None

# =========================================
# 4) Retriever 생성 (문서 메타데이터에 영양 수치 + 설명/태그 포함)
# =========================================
def create_rag_retriever(df: pd.DataFrame, embedding_model):
    documents = []
    for _, row in df.iterrows():
        calories_str = "정보 없음"
        if pd.notna(row.get("calories")):
            calories_str = f"{row['calories']:.1f} kcal"

        row_disp = row.fillna("정보 없음")

        content = (
            f"음식명: {row_disp['food_name']}\n"
            f"1회 제공량: {row_disp['serving_size']}{row_disp.get('unit', 'g')}\n"
            f"칼로리: {calories_str}\n"
            f"주요 영양소: 단백질 {row_disp['protein_g']}g, 지방 {row_disp['fat_g']}g, 탄수화물 {row_disp['carbs_g']}g\n"
            f"상세 영양소: 당류 {row_disp['sugars_g']}g, 나트륨 {row_disp['sodium_mg']}mg\n"
            f"특징 태그: {row_disp['tags']}\n"
            f"설명: {row_disp['description']}"
        )

        meta = {
            "food_name": row.get("food_name"),
            "serving_size": float(row["serving_size"]) if pd.notna(row.get("serving_size")) else None,
            "unit": (row.get("unit") if pd.notna(row.get("unit")) else "g"),
            "calories": float(row["calories"]) if pd.notna(row.get("calories")) else None,
            "protein_g": float(row["protein_g"]) if pd.notna(row.get("protein_g")) else None,
            "fat_g": float(row["fat_g"]) if pd.notna(row.get("fat_g")) else None,
            "carbs_g": float(row["carbs_g"]) if pd.notna(row.get("carbs_g")) else None,
            "sugars_g": float(row["sugars_g"]) if pd.notna(row.get("sugars_g")) else None,
            "sodium_mg": float(row["sodium_mg"]) if pd.notna(row.get("sodium_mg")) else None,
            "description": row.get("description", "정보 없음"),
            "tags": row.get("tags", "정보 없음"),
        }

        documents.append(Document(page_content=content, metadata=meta))

    vector_store = FAISS.from_documents(documents, embedding_model)
    return vector_store.as_retriever(search_kwargs={"k": 3})

# =========================================
# 5) 식사량(분량) 조절
# =========================================
def handle_portion_adjustment(llm, user_input: str, base_nutrition_info: dict):
    """사용자 문장에서 섭취 비율을 추출(LLM) → 모든 영양성분을 비율로 재계산."""
    print(f"\n[기능 실행] '{user_input}'에 맞춰 식사량 조절을 시작합니다...")

    nlu_prompt_template = """
    당신은 문장에서 음식 섭취 비율을 정확하게 숫자로 추출하는 AI입니다.
    아래 예시를 참고하여 주어진 문장에서 섭취 비율을 소수점 숫자로만 반환해주세요.
    다른 설명은 절대 추가하지 마세요.

    --- 예시 ---
    문장: "절반만 먹었어"
    답변: 0.5
    문장: "밥 반 공기만 먹었어요"
    답변: 0.5
    문장: "두 배로 먹은 것 같아"
    답변: 2.0
    문장: "3분의 1 정도 먹었습니다"
    답변: 0.33
    문장: "4분의 1만 먹었어"
    답변: 0.25
    문장: "거의 다 먹고 한 숟가락 정도 남겼어"
    답변: 0.9
    문장: "양이 너무 많아서 3분의 2만 먹음"
    답변: 0.67
    문장: "한 그릇 다 먹었어"
    답변: 1.0
    ---

    이제 다음 문장에서 섭취 비율을 숫자로만 추출해주세요.
    문장: '{text}'
    답변:
    """.strip()

    nlu_prompt = PromptTemplate.from_template(nlu_prompt_template)
    nlu_chain = nlu_prompt | llm | StrOutputParser()
    multiplier_str = nlu_chain.invoke({"text": user_input})

    try:
        multiplier = float(multiplier_str)
        print(f"🤖 LLM이 '{user_input}'에서 추출한 섭취 비율: {multiplier}")
    except (ValueError, TypeError):
        multiplier = 1.0
        print(f"🤖 LLM이 비율 추출에 실패하여 기본값(1.0)을 사용합니다.")

    adjusted = {}
    numeric_keys = ["calories", "protein_g", "fat_g", "carbs_g", "sugars_g", "sodium_mg"]
    for key in numeric_keys:
        val = base_nutrition_info.get(key)
        if val is not None and pd.notna(val):
            adjusted[key] = round(float(val) * multiplier, 2)

    return adjusted

# =========================================
# 6) 컨텍스트 세팅(검색 결과 기반)
# =========================================
def set_context_from_query(retriever, user_input: str):
    """retriever 결과의 최상위 문서 메타데이터를 컨텍스트로 사용.(invoke 방식)"""
    try:
        docs = retriever.invoke(user_input)
        if docs:
            return docs[0].metadata
    except Exception:
        pass
    return None

# =========================================
# 7) 곁들일 반찬/음료 추천 (이전 추천 제외 + 음식명 포함 분석/출력)
# =========================================
def handle_recommendation_question(
    llm,
    retriever_side_drink,
    base_nutrition_info,
    k: int = 5,
    exclude_names: Set[str] | None = None
) -> Tuple[str, List[str]]:
    exclude_names = exclude_names or set()
    current_food_name = (base_nutrition_info.get("food_name") or "").strip()
    if current_food_name:
        exclude_names = set(exclude_names) | {current_food_name}

    keys = ["calories","protein_g","fat_g","carbs_g","sugars_g","sodium_mg"]
    nutri_str = ", ".join(f"{k}={base_nutrition_info.get(k,'?')}" for k in keys)

    analysis_prompt = PromptTemplate.from_template(
        "너는 영양 코치야. 음식 이름을 반드시 그대로 문장에 포함시켜서, "
        "'{food_name}'의 영양적 특징을 한 문장으로 요약해줘. "
        "특히 무엇이 풍부하고 무엇이 부족한지 간결히 설명해. "
        "숫자는 과하게 나열하지 말고 핵심만.\n"
        "[영양] {nutri}"
    )
    analysis = (analysis_prompt | llm | StrOutputParser()).invoke({
        "food_name": current_food_name or "이 음식",
        "nutri": nutri_str
    })
    print(f"🤖 LLM 분석 요약: {analysis}")

    search_query_base = (
        f"{analysis} 보완용 반찬 또는 음료 추천. "
        f"고단백·저지방·저당 또는 저나트륨 키워드 우선. "
        f"'{current_food_name}' 제외."
    )
    try:
        docs = retriever_side_drink.invoke(search_query_base)
    except Exception:
        docs = []
    docs = docs or []

    if len(docs) < k:
        for extra in [" 고단백 저지방", " 저당 저나트륨", " 간편"]:
            q = search_query_base + extra
            try:
                more = retriever_side_drink.invoke(q)
            except Exception:
                more = []
            if more:
                docs += more
            seen = set()
            uniq = []
            for d in docs:
                name = (getattr(d, "metadata", {}) or {}).get("food_name") or id(d)
                if name not in seen:
                    uniq.append(d); seen.add(name)
            docs = uniq
            if len(docs) >= k:
                break

    filtered = []
    for d in docs:
        m = getattr(d, "metadata", {}) or {}
        name = (m.get("food_name") or "").strip()
        if not name or name in exclude_names:
            continue
        filtered.append(d)
        if len(filtered) >= max(3, k):
            break

    def doc_to_line(d):
        m = getattr(d, "metadata", {}) or {}
        name = m.get("food_name") or "추천 항목"
        desc = (m.get("description") or "").strip()
        tags = (m.get("tags") or "").strip()
        if not desc:
            pc = getattr(d, "page_content", "") or ""
            for line in pc.splitlines():
                if line.startswith("설명:"):
                    desc = line.replace("설명:", "").strip()
                    break
        extra = f" (태그: {tags})" if tags else ""
        return name, f"- {name}: {desc}{extra}"

    candidate_names: List[str] = []
    candidate_lines: List[str] = []
    for d in filtered:
        nm, line = doc_to_line(d)
        candidate_names.append(nm)
        candidate_lines.append(line)

    candidates_text = "\n".join(candidate_lines) if candidate_lines else "- (후보 없음)"

    recommend_prompt = PromptTemplate.from_template(
        "너는 전문 영양 코치 '헬핏'이야. 아래 [현재 음식 분석]을 참고해, "
        "[후보 목록]에서 2~3개를 골라 추천해줘.\n"
        "설명은 반드시 후보 항목의 설명(description/태그)만을 근거로 간단히 써.\n"
        "아래 [제외 목록]에 있는 항목은 절대 선택하지 마.\n\n"
        "[현재 음식 분석]\n{analysis}\n\n"
        "[후보 목록]\n{candidates}\n\n"
        "[제외 목록]\n{exclude_list}\n\n"
        "[헬핏의 최종 추천]\n"
        "• 형식: '이름 - 한 줄 근거(후보의 설명/태그에서만 인용)'\n"
        "• 금지: 후보에 없는 근거/수치 추가 금지, 의학적 조언 금지"
    )
    final_body = (recommend_prompt | llm | StrOutputParser()).invoke({
        "analysis": analysis,
        "candidates": candidates_text,
        "exclude_list": ", ".join(sorted(list(exclude_names))) if exclude_names else "(없음)"
    })

    final_text = f"{analysis}\n\n{final_body}\n\n※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요."

    used = [nm for nm in candidate_names if nm and (nm in final_text)]
    if len(used) < 2 and candidate_names:
        used = list(dict.fromkeys(used + candidate_names[:3]))[:3]

    return final_text, used

# =========================================
# 7.5) NEW: 상황·판단형 질문 처리 (일반 지식 보완 허용: 정량 수치는 CSV 근거만)
# =========================================
def handle_situational_question(
    llm,
    retriever,                      # 전체 retriever (food+drink+sidedish)
    current_meal_info: dict,
    user_question: str,
    food_names: Set[str]
) -> str:
    """현재 음식 + (질문 속) 추가 항목을 함께 고려해 관점별 답변 생성"""

    main_name = (current_meal_info or {}).get("food_name")
    print(f"\n[기능 3 실행] '{main_name or '알 수 없음'}' 관련 상황 분석 질문...")

    def extract_additional_item(q: str, main_food: str | None) -> str | None:
        t = q.strip()
        if main_food:
            t = t.replace(main_food, "")
        cand = find_food_in_text(t, food_names)
        if cand and cand != main_food:
            return cand
        return None

    add_name = extract_additional_item(user_question, main_name)

    if (add_name is None) and main_name:
        extraction_prompt = PromptTemplate.from_template(
            "다음 문장에서 '{main_food}' 외에 추가로 언급된 음식/음료가 있으면 정확히 이름만 하나 써줘. "
            "없으면 '없음'이라고만 답해. 생성 금지.\n문장: {q}"
        )
        add_try = (extraction_prompt | llm | StrOutputParser()).invoke({
            "main_food": main_name, "q": user_question
        }).strip().strip("'\"")
        if add_try and add_try not in {"없음","없다","none","null"} and add_try in food_names and add_try != main_name:
            add_name = add_try

    print(f"🤖 추가 항목 추출 결과: {add_name or '없음'}")

    def fetch_ctx(name: str | None):
        if not name:
            return []
        try:
            return retriever.invoke(name) or []
        except Exception:
            return []

    main_docs = fetch_ctx(main_name)
    add_docs  = fetch_ctx(add_name)

    if not main_docs and not add_docs:
        return ("헬핏 COACH: 관련 정보를 찾지 못했어요. 음식 이름을 정확히 알려주시면 "
                "칼로리·영양·성분 관점에서 판단을 도와드릴게요. 😊\n"
                "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")

    def pack(docs):
        return "\n\n".join(d.page_content for d in docs)

    context_blocks = []
    if main_docs:
        context_blocks.append(f"[{main_name}] 정보\n" + pack(main_docs))
    if add_docs:
        context_blocks.append(f"[{add_name}] 정보\n" + pack(add_docs))
    combined_context = "\n\n---\n\n".join(context_blocks)

    # ⚠️ 프롬프트: 정량 수치는 참고자료에 있을 때만 사용, 그 외 일반 지식(상식 수준) 보완은 허용
    analysis_prompt_template = """
너는 전문 영양 코치 '헬핏'이야. 아래 [참고자료]를 우선 근거로 [질문]에 대해 관점별로 분석하고 결론을 정리해.

[대상]
- 주 음식: {main_name}
- 추가 항목: {add_name}

[질문]
{question}

[참고자료]
{context}

[작성 지침]
1) 수치(열량/영양성분 mg·g·kcal 등)는 반드시 [참고자료]에 존재할 때만 사용해. 자료에 없으면 정량 수치는 쓰지 말고 개념만 설명해.
2) 다만, 제품/조리/식품군에 대한 일반적·상식 수준의 정보(예: 제로콜라는 무설탕, 인공감미료 사용)는 자연스럽게 보완해도 좋아.
3) 아래 3가지 관점을 모두 포함해 간결한 불릿으로 정리해:
   - 칼로리 관리: 총 섭취 열량에 어떤 영향?
   - 영양 균형: 두 항목 조합의 장점/보완점?
   - 건강·성분: 나트륨, 당류, 인공감미료 등 유의점?
4) 마지막에 한 줄 결론(조건부 가능)을 제시하고,
5) 응답 말미에 꼭 다음 문장을 추가해:
   '※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.'
""".strip()

    analysis_prompt = PromptTemplate.from_template(analysis_prompt_template)
    answer = (analysis_prompt | llm | StrOutputParser()).invoke({
        "main_name": main_name or "(미지정)",
        "add_name": add_name or "(없음)",
        "question": user_question,
        "context": combined_context
    })
    return answer

# =========================================
# 8) 목표 기반 관리: 남은치 계산 + 후보 선별(정확 수치) + LLM 설명
# =========================================
def compute_remaining(user_profile: dict, consumed_today: dict):
    """하루 목표 대비 남은치와 초과 항목 계산."""
    remaining, exceeded = {}, {}
    for k, target in user_profile.items():
        cur = float(consumed_today.get(k, 0) or 0)
        diff = round(target - cur, 2)
        if diff < 0:
            exceeded[k] = -diff
            remaining[k] = 0.0
        else:
            remaining[k] = diff
    return remaining, exceeded

def select_candidates_by_goal(
    df: pd.DataFrame,
    remaining: dict,
    scope: str = "meal",  # "meal"이면 음료(ml) 제외, "all"이면 전체
    top_k: int = 12
) -> pd.DataFrame:
    cand = df.copy()

    if scope == "meal" and "unit" in cand.columns:
        cand = cand[cand["unit"].fillna("").ne("ml")]

    for col in ["calories","protein_g","fat_g","carbs_g","sugars_g","sodium_mg"]:
        if col in cand.columns:
            cand[col] = pd.to_numeric(cand[col], errors="coerce").fillna(0)

    cal_rem = float(remaining.get("calories", 0) or 0)
    if cal_rem > 0:
        cand = cand[cand["calories"] <= max(cal_rem, 120)]  # 최소 허용 120kcal 버퍼

    eps = 1e-6
    protein_rem = float(remaining.get("protein_g", 0) or 0)
    sodium_rem  = float(remaining.get("sodium_mg", 999999) or 999999)

    protein_density = cand["protein_g"] / (cand["calories"] + eps)
    protein_hit     = np.minimum(cand["protein_g"], protein_rem)
    sugar_pen       = cand["sugars_g"].clip(lower=0)
    sodium_over     = (cand["sodium_mg"] - sodium_rem).clip(lower=0)

    score = (3.0 * protein_hit) + (2.0 * protein_density) \
            - (0.6 * sugar_pen) - (0.8 * (sodium_over / 500.0))

    cand = cand.assign(_score=score).sort_values("_score", ascending=False)
    return cand.head(top_k).drop(columns=["_score"], errors="ignore")

def greedy_pick_with_limits(cand_df: pd.DataFrame, remaining: dict, max_items: int = 3):
    """칼로리 한도를 넘지 않도록 2~3개 그리디 선택."""
    picks = []
    cal_left = float(remaining.get("calories", 0) or 99999)
    for _, r in cand_df.iterrows():
        c = float(r.get("calories") or 0)
        if c <= cal_left + 1e-6:  # 약간의 여유
            picks.append(r)
            cal_left -= c
        if len(picks) >= max_items:
            break
    return picks

def handle_goal_planning(
    llm,
    df_all: pd.DataFrame,              # master_df
    user_profile: dict,
    consumed_today: dict,
    scope: str = "meal"                # "meal"=저녁 메뉴 위주, "all"=전체
):
    print("\n[기능 실행] 사용자의 목표 기반 식단 추천을 시작합니다...")

    # 1) 남은 목표 계산
    remaining, exceeded = compute_remaining(user_profile, consumed_today)
    print(f"📊 남은 목표량: {remaining} / 초과: {exceeded or '없음'}")

    # 2) 후보 선별(판다스 수치 기반)
    cand_df = select_candidates_by_goal(df_all, remaining, scope=scope, top_k=12)
    if cand_df.empty:
        return ("헬핏 COACH: 남은 목표와 맞는 후보를 찾기 어려워요. "
                "칼로리/단백질 목표를 조금 조정하거나, 보다 가벼운 간식부터 채워보는 건 어떨까요? 😊\n"
                "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")

    # 3) 2~3개 자동 선택(칼로리 한도 고려)
    picks = greedy_pick_with_limits(cand_df, remaining, max_items=3)
    if not picks:
        # 칼로리 제한이 너무 빡빡하면 가장 점수 높은 1개라도 제시
        picks = [cand_df.iloc[0]]

    # 4) 정확한 숫자 라인 생성 + 합계 계산
    def fmt_num(x, unit):
        return f"{float(x):.1f}{unit}" if pd.notna(x) else "정보없음"

    lines = []
    total = {"calories":0.0,"protein_g":0.0,"carbs_g":0.0,"fat_g":0.0}
    for r in picks:
        cal = float(r.get("calories") or 0)
        p   = float(r.get("protein_g") or 0)
        c   = float(r.get("carbs_g") or 0)
        f   = float(r.get("fat_g") or 0)

        total["calories"] += cal
        total["protein_g"] += p
        total["carbs_g"]  += c
        total["fat_g"]    += f

        lines.append(
            f"• {r['food_name']} — {cal:.0f}kcal, 단백질 {p:.1f}g, 탄수화물 {c:.1f}g, 지방 {f:.1f}g"
        )

    summary = (
        f"예상 합계: {total['calories']:.0f}kcal, "
        f"단백질 {total['protein_g']:.1f}g, "
        f"탄수화물 {total['carbs_g']:.1f}g, "
        f"지방 {total['fat_g']:.1f}g"
    )

    remaining_line = (
        f"(남은 목표: {remaining.get('calories',0):.0f}kcal / "
        f"P{remaining.get('protein_g',0):.1f}g / "
        f"C{remaining.get('carbs_g',0):.1f}g / "
        f"F{remaining.get('fat_g',0):.1f}g)"
    )

    menu_block = "\n".join(lines)

    # 5) LLM 설명(숫자는 우리가 준 걸 그대로 사용하도록 지시)
    prompt = PromptTemplate.from_template("""
너는 전문 영양 코치 '헬핏'이야. 아래 [현황]과 [추천 메뉴(수치 확정)]을 바탕으로,
친절하고 간결하게 이유를 덧붙여줘.

[현황]
- 오늘 목표: {goal}
- 현재 섭취: {consumed}
- 남은 목표: {remaining_line}

[추천 메뉴(수치 확정)]
{menu_block}
{summary_line}

[지시]
1) 위에 표기된 각 메뉴의 숫자(칼로리/단백질/탄수화물/지방)와 합계는 이미 확정된 값이야. 반드시 그대로 반복 표기하고 새로운 숫자를 만들지 마.
2) 왜 이 조합이 남은 목표를 채우는 데 적합한지 3~4줄로 설명해. (예: 단백질 보충, 칼로리 한도 내, 당/나트륨 부담 등)
3) 필요시 대체 1개만 간단히 제안해도 좋아(숫자 없이 개념만).
4) 마지막에 꼭 이 문장을 붙여:
   '※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.'
""".strip())
    body = (prompt | llm | StrOutputParser()).invoke({
        "goal": user_profile,
        "consumed": consumed_today,
        "remaining_line": remaining_line,
        "menu_block": menu_block,
        "summary_line": summary
    })
    return body

# =========================================
# 9) 시스템 프롬프트
# =========================================
SYSTEM_PROMPT = """
# 페르소나 (Persona)
너는 '헬핏(HealthFit)'이라는 이름의 친절하고 전문적인 AI 영양 코치야.
항상 긍정적이고 격려하는 말투를 사용해. 이모지를 적절히 사용해줘. 🍎💪

# 지식 기반 (Knowledge Base)
너의 모든 답변은 반드시 아래에 제공되는 [검색된 참고 자료]를 최우선 근거로 삼아야 해.
자료에 없는 내용은 절대로 추측해서 말하지 말고,
"제가 가진 정보로는 알기 어렵네요. 😅"라고 솔직하게 답변해야 해.

# 대화 규칙 (Conversation Rules)
- 의학적 조언을 하지 마. 답변 마지막에는 항상
  "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요." 를 포함해.
- 모든 답변은 한국어로 해줘.
""".strip()

# =========================================
# 10) 메인
# =========================================
def main():
    if not load_api_key():
        return

    # LLM
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.7)

    # 임베딩
    embeddings = HuggingFaceEmbeddings(
        model_name="jhgan/ko-sroberta-multitask",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True}
    )

    # 데이터 로딩
    csv_files = ["food_data_description.csv", "drink.csv", "sidedish.csv"]
    master_df = load_and_normalize_data(csv_files)
    if master_df is None:
        print("❌ 로드할 데이터가 없어 종료합니다.")
        return

    # 음식명 인덱스 (정확한 컨텍스트 갱신에 사용)
    FOOD_NAMES: Set[str] = build_food_name_set(master_df)

    # Retriever(전체)
    retriever = create_rag_retriever(master_df, embeddings)
    print("✅ 전체 RAG Retriever 생성을 완료했습니다.")

    # ✅ 반찬+음료 전용 Retriever (sidedish.csv + drink.csv)
    side_and_drink_df = load_and_normalize_data(["sidedish.csv", "drink.csv"])
    retriever_side_drink = create_rag_retriever(side_and_drink_df, embeddings)
    print("✅ 반찬+음료 RAG Retriever 생성을 완료했습니다.\n")

    # RAG 체인(일반 질의)
    rag_prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + "\n\n[검색된 참고 자료]\n{context}"),
        ("user", "{question}")
    ])
    rag_chain = (
        {"context": retriever, "question": RunnablePassthrough()} |
        rag_prompt |
        llm |
        StrOutputParser()
    )

    print("🤖 AI 영양 코치 '헬핏'입니다. 무엇을 도와드릴까요? (종료: '종료')")
    print("-" * 50)

    # 상태 추적
    user_profile = {"calories": 2000, "protein_g": 150, "fat_g": 60, "carbs_g": 215}
    consumed_today = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0, "sugars_g": 0.0, "sodium_mg": 0.0}

    current_meal_context = None
    portion_keywords = [
        "먹었어", "먹음", "마셨어", "남겼어",
        "반만", "절반", "두 배", "두배", "1/2", "1/3", "2/3", "3분의", "4분의"
    ]
    recommend_triggers = [
        "곁들여", "곁들일", "곁들여먹", "곁들여 먹",
        "같이", "같이 먹", "함께", "함께 먹",
        "반찬", "사이드", "사이드디시",
        "추천", "뭐 더", "뭘 더", "뭐랑 같이", "뭐랑 함께", "같이 먹으면 좋은"
    ]
    situational_triggers = [
        "먹어도 될까", "먹어도될까", "괜찮을까", "괜찮나요", "괜찮을지",
        "함께 먹어도", "같이 먹어도", "먹으면 괜찮", "먹어도 괜찮",
        "제로콜라", "제로 콜라", "콜라", "사이다", "탄산", "디저트", "후식", "아이스 아메리카노", "아메리카노"
    ]
    goal_keywords = ["목표", "저녁 뭐 먹지", "남은 목표", "남은 칼로리", "남은 단백질", "오늘 계획", "채워야"]

    what_is_it_triggers = [
        "이 음식이 뭐야", "이 음식 뭐야", "지금 음식 뭐야",
        "이게 뭐야", "지금 음식", "현재 음식", "이 음식이 뭔데"
    ]

    while True:
        user_input = normalize_text(input("You: "))

        if user_input.lower() == "종료":
            print("🤖 이용해주셔서 감사합니다! 건강한 하루 보내세요!")
            break

        # (A) 현재 음식 물어보기
        if any(t in user_input for t in what_is_it_triggers):
            if current_meal_context and current_meal_context.get("food_name"):
                print(f"헬핏 COACH: 지금 이야기 중인 음식은 '{current_meal_context['food_name']}'이에요! 😄\n"
                      "필요하면 양 조절이나 곁들일 음식도 추천해드릴게요.\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")
            else:
                print("헬핏 COACH: 아직 특정 음식으로 대화 중이 아니에요. "
                      "원하시는 음식 이름을 알려주시면 그걸 기준으로 도와드릴게요! 😊\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")
            print("-" * 50)
            continue

        # (B) 목표 기반 질의
        if any(k in user_input for k in goal_keywords):
            plan_text = handle_goal_planning(
                llm=llm,
                df_all=master_df,
                user_profile=user_profile,
                consumed_today=consumed_today,
                scope="meal"   # 필요시 "all"
            )
            print(f"헬핏 COACH:\n{plan_text}\n")
            print("-" * 50)
            continue

        # (C0) 상황·판단형 질문
        if any(t in user_input for t in situational_triggers):
            if current_meal_context is None:
                fname = find_food_in_text(user_input, FOOD_NAMES)
                if fname:
                    row = get_context_row_by_name(master_df, fname)
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{fname}'에 대해 대화 중입니다.)")

            if current_meal_context:
                ans = handle_situational_question(
                    llm=llm,
                    retriever=retriever,
                    current_meal_info=current_meal_context,
                    user_question=user_input,
                    food_names=FOOD_NAMES
                )
                print(f"헬핏 COACH:\n{ans}")
            else:
                print("헬핏 COACH: 어떤 음식에 대해 물으시는지 알려주세요! "
                      "예) '갈비탕에 제로콜라 먹어도 될까?'\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")
            print("-" * 50)
            continue

        # (C) 곁들일 반찬/음료 추천
        if any(t in user_input for t in recommend_triggers):
            if current_meal_context is None:
                fname = find_food_in_text(user_input, FOOD_NAMES)
                if fname:
                    row = get_context_row_by_name(master_df, fname)
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{fname}'에 대해 대화 중입니다.)")

            if current_meal_context:
                text, used_names = handle_recommendation_question(
                    llm=llm,
                    retriever_side_drink=retriever_side_drink,
                    base_nutrition_info=current_meal_context,
                    k=5,
                    exclude_names=set()  # 필요하면 히스토리로 교체 가능
                )
                print(f"헬핏 COACH:\n{text}")
            else:
                print("헬핏 COACH: 어떤 음식에 곁들일지 먼저 알려주세요! "
                      "(예: 갈비탕 → 같이 먹으면 좋은 음식 추천)\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")
            print("-" * 50)
            continue

        # (D) 양 조절 문의
        if any(k in user_input for k in portion_keywords):
            if current_meal_context is None:
                fname = find_food_in_text(user_input, FOOD_NAMES)
                if fname:
                    row = get_context_row_by_name(master_df, fname)
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{fname}'에 대해 대화 중입니다.)")

            if current_meal_context:
                adjusted = handle_portion_adjustment(llm, user_input, current_meal_context)

                # ✨ 섭취량 누적
                for key, value in adjusted.items():
                    if key in consumed_today:
                        consumed_today[key] = float(consumed_today.get(key, 0) or 0) + float(value or 0)

                response_text = (
                    f"알겠습니다! 말씀하신 내용을 바탕으로 섭취량을 다시 계산해봤어요. 🧐\n"
                    f"'{current_meal_context.get('food_name', '해당 음식')}'의 예상 섭취량은 다음과 같아요.\n\n"
                    f"🍕 칼로리: {adjusted.get('calories', '계산불가')} kcal\n"
                    f"🍞 탄수화물: {adjusted.get('carbs_g', '계산불가')} g\n"
                    f"🍗 단백질: {adjusted.get('protein_g', '계산불가')} g\n"
                    f"🥑 지방: {adjusted.get('fat_g', '계산불가')} g\n"
                    f"🧂 나트륨: {adjusted.get('sodium_mg', '계산불가')} mg\n"
                    f"\n📈 오늘 누적: {consumed_today.get('calories',0):.0f}kcal / "
                    f"P{consumed_today.get('protein_g',0):.1f} / "
                    f"C{consumed_today.get('carbs_g',0):.1f} / "
                    f"F{consumed_today.get('fat_g',0):.1f}\n"
                    "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요."
                )
                print(f"헬핏 COACH:\n{response_text}")
            else:
                print("헬핏 COACH: 어떤 음식에 대한 양을 조절할까요? 먼저 음식 정보를 알려주세요. (예: 비빔냉면 절반만 먹었어)\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")
            print("-" * 50)
            continue

        # (E) 일반 질의 → RAG
        response = rag_chain.invoke(user_input)
        print(f"헬핏 COACH: {response}")

        # 컨텍스트 업데이트 가드
        words = user_input.split()
        update_ok = False

        if contains_any(user_input, ["정보", "알려줘", "칼로리", "영양", "어때", "성분", "설명"]):
            update_ok = True
        elif len(words) == 1:
            w = words[0]
            if (w not in NO_CONTEXT_SINGLE_WORDS) and (w in FOOD_NAMES):
                update_ok = True
        else:
            fname_inline = find_food_in_text(user_input, FOOD_NAMES)
            if fname_inline:
                row = get_context_row_by_name(master_df, fname_inline)
                if row:
                    current_meal_context = row
                    print(f"(CONTEXT: 현재 '{fname_inline}'에 대해 대화 중입니다.)")
                update_ok = False

        if update_ok:
            if len(words) == 1 and words[0] in FOOD_NAMES:
                row = get_context_row_by_name(master_df, words[0])
                if row:
                    current_meal_context = row
                    print(f"(CONTEXT: 현재 '{words[0]}'에 대해 대화 중입니다.)")
            else:
                ctx = set_context_from_query(retriever, user_input)
                if ctx:
                    current_meal_context = ctx
                    print(f"(CONTEXT: 현재 '{current_meal_context.get('food_name','?')}'에 대해 대화 중입니다.)")

        print("-" * 50)

if __name__ == "__main__":
    main()
