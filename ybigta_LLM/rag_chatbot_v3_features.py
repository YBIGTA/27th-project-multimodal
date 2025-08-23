import os
import warnings
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
# 3) Retriever 생성 (문서 메타데이터에 영양 수치 포함)
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

        # ✅ 메타데이터에 수치 포함(계산용)
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
        }

        documents.append(Document(page_content=content, metadata=meta))

    vector_store = FAISS.from_documents(documents, embedding_model)
    return vector_store.as_retriever(search_kwargs={"k": 3})


# =========================================
# 4) 식사량(분량) 조절
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
# 5) 컨텍스트 세팅(검색 결과 기반)
# =========================================
def set_context_from_query(retriever, user_input: str):
    """
    retriever 결과의 최상위 문서 메타데이터를 컨텍스트로 사용.
    """
    try:
        docs = retriever.get_relevant_documents(user_input)
        if docs:
            return docs[0].metadata
    except Exception:
        pass
    return None


# =========================================
# 6) 시스템 프롬프트
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
# 7) 메인
# =========================================
def main():
    if not load_api_key():
        return

    # LLM
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)

    # 임베딩(모델명 정확히)
    embeddings = HuggingFaceEmbeddings(
        model_name="jhgan/ko-sroberta-multitask",
        model_kwargs={"device": "cpu"},              # GPU 없을 때 안전
        encode_kwargs={"normalize_embeddings": True}  # FAISS 검색 안정화
    )

    # 데이터 로딩
    csv_files = ["food_data_description.csv", "drink.csv", "sidedish.csv"]
    master_df = load_and_normalize_data(csv_files)
    if master_df is None:
        print("❌ 로드할 데이터가 없어 종료합니다.")
        return

    # Retriever
    retriever = create_rag_retriever(master_df, embeddings)
    print("✅ RAG Retriever 생성을 완료했습니다.\n")

    # RAG 체인
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

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() == "종료":
            print("🤖 이용해주셔서 감사합니다! 건강한 하루 보내세요!")
            break

        # 1) 양 조절 문의가 먼저인지 확인
        if any(k in user_input for k in portion_keywords):
            # 컨텍스트가 없다면 즉석에서 검색으로 시도
            if current_meal_context is None:
                current_meal_context = set_context_from_query(retriever, user_input)

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
                print("헬핏 COACH: 어떤 음식에 대한 양을 조절할까요? 먼저 음식 정보를 알려주세요. (예: 탕수육 정보 알려줘)")

        # 2) 일반 질의 → RAG
        else:
            response = rag_chain.invoke(user_input)
            print(f"헬핏 COACH: {response}")

            # 질문 후 retriever 최상위 문서로 컨텍스트 갱신
            ctx = set_context_from_query(retriever, user_input)
            if ctx:
                current_meal_context = ctx
                print(f"(CONTEXT: 현재 '{current_meal_context.get('food_name','?')}'에 대해 대화 중입니다.)")

        print("-" * 50)


if __name__ == "__main__":
    main()
