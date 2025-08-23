import os 
import warnings
from typing import List, Set, Tuple, Optional
import pandas as pd
from dotenv import load_dotenv
ALLOW_CATEGORY_KNOWLEDGE = True  # CSV에 없는 '범주 수준' 사실을 1문장 보완 허용(브랜드/정확수치 금지)

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
    # 긴 이름 우선 매칭(예: '김치'보다 '열무김치'가 우선)
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

        # None -> "정보 없음" 치환(표시용)
        row_disp = row.fillna("정보 없음")

        # 검색용 콘텐츠(요약 텍스트)
        content = (
            f"음식명: {row_disp['food_name']}\n"
            f"1회 제공량: {row_disp['serving_size']}{row_disp.get('unit', 'g')}\n"
            f"칼로리: {calories_str}\n"
            f"주요 영양소: 단백질 {row_disp['protein_g']}g, 지방 {row_disp['fat_g']}g, 탄수화물 {row_disp['carbs_g']}g\n"
            f"상세 영양소: 당류 {row_disp['sugars_g']}g, 나트륨 {row_disp['sodium_mg']}mg\n"
            f"특징 태그: {row_disp['tags']}\n"
            f"설명: {row_disp['description']}"
        )

        # ✅ 메타데이터에 수치 + 설명/태그 포함(계산/표시용)
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
    """
    사용자 문장에서 섭취 비율을 추출(LLM) → 모든 영양성분을 비율로 재계산.
    """
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

    # 재계산
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
    """
    retriever 결과의 최상위 문서 메타데이터를 컨텍스트로 사용.
    (invoke 사용: LangChain 최신 권장)
    """
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
    # 현재 음식 이름은 기본적으로 제외
    current_food_name = (base_nutrition_info.get("food_name") or "").strip()
    if current_food_name:
        exclude_names = set(exclude_names) | {current_food_name}

    # --- 1) 분석문 생성(LLM; 음식명 반드시 포함) ---
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

    # --- 2) side+drink 전용 RAG 검색 (현재 음식명 제외를 명시)
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

    # 후보 부족 시 대체 질의로 보강
    if len(docs) < k:
        for extra in [" 고단백 저지방", " 저당 저나트륨", " 간편"]:
            q = search_query_base + extra
            try:
                more = retriever_side_drink.invoke(q)
            except Exception:
                more = []
            if more:
                docs += more
            # 중복 제거(이름 기준)
            seen = set()
            uniq = []
            for d in docs:
                name = (getattr(d, "metadata", {}) or {}).get("food_name") or id(d)
                if name not in seen:
                    uniq.append(d); seen.add(name)
            docs = uniq
            if len(docs) >= k:
                break

    # --- 3) 제외 목록(현재 음식 + 이전 추천) 필터링
    filtered = []
    for d in docs:
        m = getattr(d, "metadata", {}) or {}
        name = (m.get("food_name") or "").strip()
        if not name or name in exclude_names:
            continue
        filtered.append(d)
        if len(filtered) >= max(3, k):
            break

    # --- 4) 후보 텍스트: CSV의 description(+tags)만 근거로
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

    # --- 5) 최종 추천 본문(후보 설명만 근거) + 분석문을 맨 앞에 고정 출력
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

    # --- 6) 이번에 실제로 추천된 항목 이름 추출(간단 매칭)
    used = [nm for nm in candidate_names if nm and (nm in final_text)]
    if len(used) < 2 and candidate_names:
        used = list(dict.fromkeys(used + candidate_names[:3]))[:3]

    return final_text, used

# =========================================
# 7.5) NEW: 상황·판단형 질문 처리
# =========================================
def handle_situational_question(
    llm,
    retriever,                      # 전체 retriever (food+drink+sidedish)
    current_meal_info: dict,
    user_question: str,
    food_names: Set[str]
) -> str:
    """현재 음식 + (질문 속) 추가 항목을 함께 고려해 관점별 답변 생성.
    CSV에 없는 포인트는, 필요할 때만 '범주 수준' 지식으로 1문장 보완(브랜드/정확수치 금지, 라벨 출력 안함)."""

    main_name = (current_meal_info or {}).get("food_name")
    print(f"\n[기능 3 실행] '{main_name or '알 수 없음'}' 관련 상황 분석 질문...")

    # 1) 질문에서 '현재 음식' 외 추가 항목 추출 (CSV 사전 우선)
    def extract_additional_item(q: str, main_food: str | None) -> str | None:
        t = q.strip()
        if main_food:
            t = t.replace(main_food, "")
        cand = find_food_in_text(t, food_names)
        if cand and cand != main_food:
            return cand
        return None

    add_name = extract_additional_item(user_question, main_name)

    # LLM 보조 추출(사전 매칭 실패 시만; CSV에 등록된 이름만 허용)
    if (add_name is None) and main_name:
        extraction_prompt = PromptTemplate.from_template(
            "다음 문장에서 '{main_food}' 외에 추가로 언급된 음식/음료가 있으면 정확한 이름만 하나 써줘. "
            "없으면 '없음'이라고만 답해. 새로운 이름을 만들지 마.\n문장: {q}"
        )
        add_try = (extraction_prompt | llm | StrOutputParser()).invoke({
            "main_food": main_name, "q": user_question
        }).strip().strip("'\"")
        if add_try and add_try not in {"없음","없다","none","null"} and add_try in food_names and add_try != main_name:
            add_name = add_try

    print(f"🤖 추가 항목 추출 결과: {add_name or '없음'}")

    # 2) RAG: 두 항목 컨텍스트 수집
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

    # 3) LLM: CSV 우선 + 부족 포인트만 '자연스럽게' 한 문장 보완 (라벨 출력 금지)
    allow_aug_rule = (
        "CSV에 없는 항목이 질문과 직접 관련 있을 때에만, 제품군(예: 제로탄산, 커피, 우유 등)에 대한 범주 수준의 일반적 사실을 "
        "최대 한 문장으로 보완할 수 있다. 브랜드/정확 수치(%/mg/g/kcal/ml)/특정 제품 단정은 금지한다. "
        "보완 문장은 '일반적으로/대개/제품에 따라 달라질 수 있어요' 같은 단서를 포함하고, "
        "'CSV'나 '일반 지식' 같은 표현은 쓰지 않는다."
        if ALLOW_CATEGORY_KNOWLEDGE else
        "CSV에 없는 항목은 보완하지 않는다."
    )

    analysis_prompt_template = """
너는 전문 영양 코치 '헬핏'이야. 아래 [참고자료]만 근거로, [질문]에 대해 관점별로 분석하고 결론을 정리해.

[대상]
- 주 음식: {main_name}
- 추가 항목: {add_name}

[질문]
{question}

[참고자료]
{context}

[작성 지침]
1) 근거는 우선 [참고자료]에서 찾고, 모르는 정보는 '자료 없음'이라고 말해.
2) {allow_aug_rule}
3) 아래 세 줄로 간결하게 답변해:
   - **칼로리 관리 관점:** 총 섭취 칼로리에 어떤 영향을 주는지?
   - **영양 균형 관점:** 두 음식의 조합이 영양적으로 어떤 장단점이 있는지?
   - **건강 및 성분 관점:** 특정 성분(나트륨, 당류, 인공감미료 등) 측면에서 고려할 점은 무엇인지? 
4) 마지막에 한 줄 결론을 제시하고, 끝에 반드시 다음 문장을 추가해:
   '※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.'
""".strip()

    analysis_prompt = PromptTemplate.from_template(analysis_prompt_template)
    answer = (analysis_prompt | llm | StrOutputParser()).invoke({
        "main_name": main_name or "(미지정)",
        "add_name": add_name or "(없음)",
        "question": user_question,
        "context": combined_context,
        "allow_aug_rule": allow_aug_rule
    })
    return answer

# =========================================
# 8) 시스템 프롬프트
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
# 9) 메인
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

    current_meal_context = None
    portion_keywords = [
        "먹었어", "먹음", "마셨어", "남겼어",
        "반만", "절반", "두 배", "두배", "1/2", "1/3", "2/3", "3분의", "4분의"
    ]
    # 추천 트리거 확장(같이/함께/곁들여)
    recommend_triggers = [
        "곁들여", "곁들일", "곁들여먹", "곁들여 먹",
        "같이", "같이 먹", "함께", "함께 먹",
        "반찬", "사이드", "사이드디시",
        "추천", "뭐 더", "뭘 더", "뭐랑 같이", "뭐랑 함께", "같이 먹으면 좋은"
    ]
    # NEW: 상황·판단형 트리거(예: 제로콜라 먹어도 될까?)
    situational_triggers = [  # NEW
        "먹어도 될까", "먹어도될까", "괜찮을까", "괜찮나요", "괜찮을지",
        "함께 먹어도", "같이 먹어도", "먹으면 괜찮", "먹어도 괜찮",
        "제로콜라", "제로 콜라", "콜라", "사이다", "탄산", "디저트", "후식", "아이스 아메리카노", "아메리카노"
    ]

    # 추천 다양화용 히스토리 & 초기화 트리거
    recommended_history: Set[str] = set()
    reset_triggers = ["초기화", "리셋", "처음부터", "다시해", "history reset"]

    # 현재 음식이 뭐냐고 묻는 트리거
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

        # (B) 히스토리 초기화
        if any(t in user_input for t in reset_triggers):
            recommended_history.clear()
            print("헬핏 COACH: 추천 히스토리를 초기화했어요. 새로운 조합으로 다시 추천할게요! ✨")
            print("-" * 50)
            continue

        # (C0) NEW: 상황·판단형 질문
        if any(t in user_input for t in situational_triggers):  # NEW
            # 컨텍스트 없으면, 문장 안에서 음식명을 먼저 찾아본다
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
                    retriever=retriever,                 # 전체 retriever
                    current_meal_info=current_meal_context,
                    user_question=user_input,
                    food_names=FOOD_NAMES
                )
                print(f"헬핏 COACH:\n{ans}")
            else:
                print("헬핏 COACH: 어떤 음식에 대해 물으시는지 알려주세요! "
                      "예) '갈비탕에 제로콜라 먹어도 될까?'\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")

        # (C) 곁들일 반찬/음료 추천
        elif any(t in user_input for t in recommend_triggers):
            # 컨텍스트 없으면, 문장 안에서 음식명을 먼저 찾아본다
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
                    retriever_side_drink=retriever_side_drink,   # 반찬+음료
                    base_nutrition_info=current_meal_context,
                    k=5,
                    exclude_names=recommended_history  # 이전 추천 제외 + 현재 음식명 자동 제외
                )
                print(f"헬핏 COACH:\n{text}")
                for nm in used_names:
                    recommended_history.add(nm)
            else:
                print("헬핏 COACH: 어떤 음식에 곁들일지 먼저 알려주세요! "
                      "(예: 갈비탕 → 같이 먹으면 좋은 음식 추천)\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")

        # (D) 양 조절 문의
        elif any(k in user_input for k in portion_keywords):
            # 컨텍스트 없으면, 문장 속 음식명을 먼저 시도
            if current_meal_context is None:
                fname = find_food_in_text(user_input, FOOD_NAMES)
                if fname:
                    row = get_context_row_by_name(master_df, fname)
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{fname}'에 대해 대화 중입니다.)")

            if current_meal_context:
                adjusted = handle_portion_adjustment(llm, user_input, current_meal_context)

                response_text = (
                    f"알겠습니다! 말씀하신 내용을 바탕으로 섭취량을 다시 계산해봤어요. 🧐\n"
                    f"'{current_meal_context.get('food_name', '해당 음식')}'의 예상 섭취량은 다음과 같아요.\n\n"
                    f"🍕 칼로리: {adjusted.get('calories', '계산불가')} kcal\n"
                    f"🍞 탄수화물: {adjusted.get('carbs_g', '계산불가')} g\n"
                    f"🍗 단백질: {adjusted.get('protein_g', '계산불가')} g\n"
                    f"🥑 지방: {adjusted.get('fat_g', '계산불가')} g\n"
                    f"🧂 나트륨: {adjusted.get('sodium_mg', '계산불가')} mg\n"
                    "\n※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요."
                )
                print(f"헬핏 COACH:\n{response_text}")
            else:
                print("헬핏 COACH: 어떤 음식에 대한 양을 조절할까요? 먼저 음식 정보를 알려주세요. (예: 비빔냉면 절반만 먹었어)\n"
                      "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요.")

        # (E) 일반 질의 → RAG
        else:
            response = rag_chain.invoke(user_input)
            print(f"헬핏 COACH: {response}")

            # ✅ 컨텍스트 업데이트 가드:
            #  - 추천/분량/상황 지시문은 제외
            #  - 정보성 키워드 포함 시 OK
            #  - 단어 1개면: (불용어가 아니고) 음식명이어야만 OK
            #  - 문장 안에 음식명이 섞여 있으면 OK
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
                    # 문장에 음식명이 들어있으면 그걸로 갱신
                    row = get_context_row_by_name(master_df, fname_inline)
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{fname_inline}'에 대해 대화 중입니다.)")
                    update_ok = False  # 이미 처리했으니 추가 갱신 불필요

            if update_ok:
                # 단어 1개(=음식명)인 경우: 바로 DF에서 컨텍스트 설정이 가장 정확
                if len(words) == 1 and words[0] in FOOD_NAMES:
                    row = get_context_row_by_name(master_df, words[0])
                    if row:
                        current_meal_context = row
                        print(f"(CONTEXT: 현재 '{words[0]}'에 대해 대화 중입니다.)")
                else:
                    # 정보성 질의 등은 retriever로 추정
                    ctx = set_context_from_query(retriever, user_input)
                    if ctx:
                        current_meal_context = ctx
                        print(f"(CONTEXT: 현재 '{current_meal_context.get('food_name','?')}'에 대해 대화 중입니다.)")

        print("-" * 50)

if __name__ == "__main__":
    main()
