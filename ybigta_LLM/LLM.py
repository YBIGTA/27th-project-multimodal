import os
import pandas as pd
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain.vectorstores import FAISS
from langchain.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# --- 1. 초기 설정: 모델, API 키, 데이터 로딩 ---

# 경고: 이 방식은 테스트용입니다. 실제 제품에서는 .env나 다른 보안 방식을 사용하세요.
os.environ["GOOGLE_API_KEY"] = "여기에_발급받은_Gemini_API_키를_붙여넣으세요"

def load_and_merge_csvs(file_list):
    """지정된 CSV 파일 목록을 읽어 하나의 DataFrame으로 통합합니다."""
    try:
        all_dfs = [pd.read_csv(file) for file in file_list]
        master_df = pd.concat(all_dfs, ignore_index=True)
        print(f"✅ 총 {len(file_list)}개의 파일에서 {len(master_df)}개의 음식 정보를 성공적으로 통합했습니다.")
        return master_df
    except FileNotFoundError as e:
        print(f"❌ 파일을 찾을 수 없습니다: {e.filename}")
        return None

def create_rag_retriever(df, embedding_model):
    """DataFrame으로부터 RAG Retriever를 생성합니다."""
    documents = []
    for _, row in df.iterrows():
        content = (
            f"음식명: {row['food_name']}\n"
            f"1인분 기준(g): {row['serving_size_g']}\n"
            f"칼로리: {row['calories']}kcal\n"
            f"탄수화물: {row['carbs_g']}g, 단백질: {row['protein_g']}g, 지방: {row['fat_g']}g\n"
            f"나트륨: {row['sodium_mg']}mg, 당류: {row['sugar_g']}g\n"
            f"특징 태그: {row['tags']}\n"
            f"설명: {row['description']}"
        )
        documents.append(Document(page_content=content, metadata={"food_name": row['food_name']}))
    
    vector_store = FAISS.from_documents(documents, embedding_model)
    return vector_store.as_retriever(search_kwargs={'k': 5})

# --- 2. 4가지 핵심 기능별 함수 정의 ---

def handle_portion_adjustment(llm, user_input, base_nutrition):
    """(기능3) 식사량 조절: 사용자의 언어적 표현을 바탕으로 영양 정보를 재계산합니다."""
    print(f"\n[기능 3: 식사량 조절] '{user_input}'에 맞춰 영양 정보 재계산 중...")
    
    # 1단계: LLM을 이용해 사용자 입력에서 '비율' 추출
    prompt = PromptTemplate.from_template(
        "다음 문장에서 음식 섭취량에 대한 비율을 숫자로만 추출해줘. 예를 들어 '절반', '반 공기'는 0.5, '두 배'는 2.0, '한 그릇 반'은 1.5로 변환해줘. 비율을 찾을 수 없으면 1.0을 반환해줘. 문장: '{text}'"
    )
    nlu_chain = prompt | llm | StrOutputParser()
    multiplier_str = nlu_chain.invoke({"text": user_input})
    
    try:
        multiplier = float(multiplier_str)
        print(f"🤖 LLM이 추출한 섭취 비율: {multiplier}")
    except ValueError:
        multiplier = 1.0
        print(f"🤖 LLM이 비율 추출에 실패하여 기본값(1.0)을 사용합니다.")

    # 2단계: 추출된 비율로 영양 정보 재계산 (정확한 계산은 Python이 담당)
    adjusted_nutrition = base_nutrition.copy()
    for key in ['calories', 'carbs_g', 'protein_g', 'fat_g', 'sodium_mg', 'sugar_g']:
        if key in adjusted_nutrition:
            adjusted_nutrition[key] = round(adjusted_nutrition[key] * multiplier, 2)
            
    return adjusted_nutrition, multiplier

def handle_situational_question(llm, retriever, current_meal_name, question):
    """(기능1) 상황 분석 및 판단: '제로콜라' 질문처럼 다각적인 답변을 생성합니다."""
    print(f"\n[기능 1: 상황 분석 및 판단] '{current_meal_name}'과 '{question}'에 대한 분석 중...")
    
    prompt_template = """
    당신은 전문 영양 코치 AI입니다. 사용자가 섭취한 음식과 질문을 바탕으로, 여러 관점에서 균형 잡힌 조언을 제공해야 합니다.

    [상황 정보]
    {context}

    [사용자 질문]
    {question}

    [지시사항]
    1. 위 [상황 정보]를 바탕으로 사용자의 질문에 답변하세요.
    2. 답변은 아래 세 가지 관점을 모두 포함하여, 각 관점에서 어떤지 명확하게 설명해주세요:
        - 칼로리 관리 관점
        - 혈당 관리 관점
        - 인공 첨가물 및 성분 관점
    3. 일방적인 '네/아니오'로 답하지 말고, 각 관점에 따른 장단점을 설명하여 사용자가 스스로 판단할 수 있도록 도와주세요.
    4. 답변 마지막에는 항상 아래와 같은 의료 관련 면책 조항을 포함해주세요.
        "※ 본 답변은 의학적 소견이 아니므로, 기저 질환이 있으신 경우 전문가와 상의하시는 것을 권장합니다."
    """
    prompt = PromptTemplate.from_template(prompt_template)
    rag_chain = {"context": retriever, "question": RunnablePassthrough()} | prompt | llm | StrOutputParser()
    
    full_question = f"현재 '{current_meal_name}'을 먹고 있는데, '{question}'"
    return rag_chain.invoke(full_question)

def handle_recommendation_question(llm, retriever, current_meal_info):
    """(기능2) 영양 균형 추천: 현재 식단의 부족한 점을 보완할 음식을 추천합니다."""
    print(f"\n[기능 2: 영양 균형 추천] '{current_meal_info['food_name']}'의 영양 균형 분석 및 보완 메뉴 추천 중...")
    
    prompt_template = """
    당신은 전문 영양 코치 AI입니다. 사용자가 섭취한 음식의 영양 균형을 분석하고, 부족한 부분을 보충할 수 있는 음식을 추천해야 합니다.

    [현재 섭취한 음식 정보]
    {context}

    [지시사항]
    1. 위 [현재 섭취한 음식 정보]를 분석하여, 어떤 영양소가 부족한지 1~2문장으로 요약해주세요. (예: "탄수화물과 지방 위주의 식사로 단백질과 섬유질이 부족해 보입니다.")
    2. 부족한 영양소를 보충할 수 있는 건강한 음식들을 당신의 지식과 아래 검색된 음식 목록을 참고하여 2~3가지 추천해주세요.
    3. 각 추천 음식에 대해 왜 좋은 선택인지 간단한 이유를 덧붙여 설명해주세요.
    """
    prompt = PromptTemplate.from_template(prompt_template)
    rag_chain = {"context": retriever, "question": RunnablePassthrough()} | prompt | llm | StrOutputParser()
    
    return rag_chain.invoke(current_meal_info['food_name'])

def handle_goal_planning(llm, retriever, user_profile, consumed_nutrition):
    """(기능4) 목표 칼로리 계산 및 추천: 남은 영양소를 채우기 위한 식단을 제안합니다."""
    print(f"\n[기능 4: 목표 기반 계획] 남은 영양소 계산 및 맞춤 식단 추천 중...")
    
    # 1단계: 남은 영양소 계산 (정확한 계산은 Python이 담당)
    remaining = {
        'calories': user_profile['target_calories'] - consumed_nutrition.get('calories', 0),
        'carbs_g': user_profile['target_carbs_g'] - consumed_nutrition.get('carbs_g', 0),
        'protein_g': user_profile['target_protein_g'] - consumed_nutrition.get('protein_g', 0),
        'fat_g': user_profile['target_fat_g'] - consumed_nutrition.get('fat_g', 0),
    }

    # 2단계: LLM에게 전달할 컨텍스트 및 지시사항 구성
    context_for_llm = (
        f"사용자의 오늘 목표는 칼로리 {user_profile['target_calories']}kcal, 탄수화물 {user_profile['target_carbs_g']}g, 단백질 {user_profile['target_protein_g']}g, 지방 {user_profile['target_fat_g']}g 입니다.\n"
        f"현재까지 {consumed_nutrition.get('calories', 0)}kcal, 탄수화물 {consumed_nutrition.get('carbs_g', 0)}g, 단백질 {consumed_nutrition.get('protein_g', 0)}g, 지방 {consumed_nutrition.get('fat_g', 0)}g을 섭취했습니다.\n"
        f"따라서 사용자에게 남은 목표는 칼로리 {remaining['calories']:.0f}kcal, 탄수화물 {remaining['carbs_g']:.0f}g, 단백질 {remaining['protein_g']:.0f}g, 지방 {remaining['fat_g']:.0f}g 입니다."
        f"특히 단백질 섭취가 중요해 보입니다."
    )
    
    prompt_template = """
    당신은 사용자의 목표 달성을 돕는 유능한 AI 영양 코치입니다.

    [사용자 현황 및 목표]
    {context}

    [검색된 추천 메뉴 후보]
    {retrieved_docs}

    [지시사항]
    1. 위 [사용자 현황 및 목표]를 바탕으로 사용자에게 남은 목표를 친절하게 설명해주세요.
    2. 남은 영양소를 채우기 위한 저녁 식사 메뉴와 간단한 간식 메뉴를 제안해주세요.
    3. 제안은 위 [검색된 추천 메뉴 후보]를 최우선으로 참고하되, 필요하다면 당신의 다른 지식도 활용하여 자연스럽게 추천해주세요.
    4. 각 메뉴가 왜 좋은 선택인지 이유를 간단히 설명해주세요.
    """
    prompt = PromptTemplate.from_template(prompt_template)
    
    # RAG 검색을 통해 추천 메뉴 후보를 미리 찾아 LLM에게 전달
    retrieved_docs = retriever.invoke(f"남은 칼로리 {remaining['calories']:.0f}kcal, 고단백 식사")
    retrieved_texts = "\n\n".join([doc.page_content for doc in retrieved_docs])
    
    chain = prompt | llm | StrOutputParser()
    return chain.invoke({"context": context_for_llm, "retrieved_docs": retrieved_texts})


# --- 3. 메인 시뮬레이션 실행 ---

def main_simulation():
    """메인 시뮬레이션 함수"""
    
    print("--- AI 영양 코치 서비스 시뮬레이션을 시작합니다 ---")
    
    # 초기 설정
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)
    embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-004")
    
    csv_files = ['korean_dishes_33.csv', 'drinks.csv', 'add_ons.csv', 'other_dishes.csv']
    master_df = load_and_merge_csvs(csv_files)
    if master_df is None: return
    
    retriever = create_rag_retriever(master_df, embeddings)

    # 사용자 프로필 (앱 사용 시작 시 입력받았다고 가정)
    user_profile = {
        'target_calories': 2000,
        'target_carbs_g': 250, # 50%
        'target_protein_g': 150, # 30%
        'target_fat_g': 67, # 20%
    }
    
    total_consumed = {} # 오늘 섭취한 총량
    
    # --- 시나리오 1: 점심 식사 (부대찌개) ---
    print("\n\n--- SCENARIO 1: 점심으로 '부대찌개'를 먹었습니다 ---")
    
    # 이미지 인식 결과로 '부대찌개' 정보를 DB에서 가져옴
    lunch_info = master_df[master_df['food_name'] == '부대찌개'].iloc[0].to_dict()
    print(f"✅ '부대찌개' 기본 영양 정보: {lunch_info['calories']}kcal")
    
    # 기능 3: 식사량 조절
    adjusted_lunch, multiplier = handle_portion_adjustment(llm, "양이 많아서 밥 빼고 건더기 위주로 절반 정도만 먹었어요", lunch_info)
    print("✅ 조정된 점심 식사 영양 정보:")
    for key, value in adjusted_lunch.items():
        if key not in ['food_name', 'tags', 'description', 'serving_size_g']:
            print(f"  - {key}: {value}")
    
    # 기능 1: 상황 분석 및 판단
    situational_answer = handle_situational_question(llm, retriever, adjusted_lunch['food_name'], "제로콜라 마셔도 될까요?")
    print("\nAI 코치 답변:")
    print(situational_answer)
    
    # 오늘 섭취량에 누적
    total_consumed = adjusted_lunch
    
    # --- 시나리오 2: 저녁 식사 계획 ---
    print("\n\n--- SCENARIO 2: 저녁 식사를 계획합니다 ---")
    
    # 기능 4: 목표 기반 계획
    planning_answer = handle_goal_planning(llm, retriever, user_profile, total_consumed)
    print("\nAI 코치 답변:")
    print(planning_answer)

if __name__ == "__main__":
    # API 키가 코드에 직접 입력되었는지 확인
    if "여기에_발급받은_Gemini_API_키를_붙여넣으세요" in os.getenv("GOOGLE_API_KEY", ""):
        print("🚨 경고: GOOGLE_API_KEY가 설정되지 않았습니다.")
        print("코드 20번째 줄에 자신의 Gemini API 키를 입력해주세요.")
    else:
        main_simulation()