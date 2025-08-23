import os
import pandas as pd
from dotenv import load_dotenv
import warnings

# --- 경고 메시지 숨기기 설정 ---
# FutureWarning를 무시하도록 설정합니다. 프로그램의 다른 부분에 영향을 주지 않습니다.
warnings.filterwarnings("ignore", category=FutureWarning)
# -----------------------------

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.vectorstores import FAISS
from langchain.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# --- 1. 초기 설정: .env, 모델, 데이터 로딩 ---

def load_api_key():
    """ .env 파일에서 API 키를 로드하고 유효성을 검사합니다. """
    load_dotenv()
    if os.getenv("GOOGLE_API_KEY"):
        return True
    print("🚨 경고: GOOGLE_API_KEY를 찾을 수 없습니다.")
    print("프로젝트 폴더에 .env 파일을 만들고 'GOOGLE_API_KEY=당신의API키' 형식으로 저장해주세요.")
    return False

# ... (이하 나머지 코드는 이전과 모두 동일합니다) ...

def load_and_normalize_data(file_list):
    """
    여러 CSV 파일을 로드하고, 각기 다른 컬럼명을 표준 포맷으로 통합(정규화)합니다.
    """
    all_dfs = []
    standard_columns = [
        'food_name', 'serving_size', 'unit', 'calories', 'protein_g', 
        'fat_g', 'carbs_g', 'sugars_g', 'sodium_mg', 'tags', 'description'
    ]
    
    for file_path in file_list:
        try:
            df = pd.read_csv(file_path, encoding='utf-8')
            
            if 'one_serving_size(g)' in df.columns:
                df = df.rename(columns={'one_serving_size(g)': 'serving_size', 'energy_kcal': 'calories', 'carb_g': 'carbs_g'})
                df['unit'] = 'g'
            elif 'serving_size(ml)' in df.columns:
                df = df.rename(columns={'serving_size(ml)': 'serving_size', 'energy_kcal': 'calories', 'carb_g': 'carbs_g'})
                df['unit'] = 'ml'
            elif 'serving_size(g)' in df.columns:
                df = df.rename(columns={'serving_size(g)': 'serving_size', 'energy_kcal': 'calories', 'carb_g': 'carbs_g'})
                df['unit'] = 'g'
            
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
    
    numeric_cols = ['serving_size', 'calories', 'protein_g', 'fat_g', 'carbs_g', 'sugars_g', 'sodium_mg']
    for col in numeric_cols:
        if col in master_df.columns:
            master_df[col] = pd.to_numeric(master_df[col], errors='coerce')

    print(f"\n🎉 총 {len(all_dfs)}개 파일에서 {len(master_df)}개의 음식 정보를 성공적으로 통합 및 처리했습니다.")
    return master_df

def create_rag_retriever(df, embedding_model):
    """정규화된 DataFrame으로부터 RAG Retriever를 생성합니다."""
    documents = []
    for _, row in df.iterrows():
        calories_str = "정보 없음"
        if pd.notna(row['calories']):
            calories_str = f"{row['calories']:.1f} kcal"

        row = row.fillna('정보 없음')
        content = (
            f"음식명: {row['food_name']}\n"
            f"1회 제공량: {row['serving_size']}{row.get('unit', 'g')}\n"
            f"칼로리: {calories_str}\n"
            f"주요 영양소: 단백질 {row['protein_g']}g, 지방 {row['fat_g']}g, 탄수화물 {row['carbs_g']}g\n"
            f"상세 영양소: 당류 {row['sugars_g']}g, 나트륨 {row['sodium_mg']}mg\n"
            f"특징 태그: {row['tags']}\n"
            f"설명: {row['description']}"
        )
        documents.append(Document(page_content=content, metadata={"food_name": row['food_name']}))
    
    vector_store = FAISS.from_documents(documents, embedding_model)
    return vector_store.as_retriever(search_kwargs={'k': 3})

SYSTEM_PROMPT = """
# 페르소나 (Persona)
너는 '헬핏(HealthFit)'이라는 이름의 친절하고 전문적인 AI 영양 코치야. 너의 목표는 사용자가 건강한 식습관을 갖도록 돕는 것이야. 항상 긍정적이고 격려하는 말투를 사용해. 이모지를 적절히 사용하여 친근감을 표현해줘. 🍎💪

# 지식 기반 (Knowledge Base)
너의 모든 답변은 반드시 아래에 제공되는 [검색된 참고 자료]를 최우선 근거로 삼아야 해. 자료에 없는 내용은 절대로 추측해서 말하지 말고, "제가 가진 정보로는 알기 어렵네요. 😅"라고 솔직하게 답변해야 해.

# 대화 규칙 (Conversation Rules)
- **절대** 의학적 조언을 하지 마. 답변 마지막에는 항상 "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요." 라는 문구를 포함해.
- 모든 답변은 한국어로 해줘.
"""

def main():
    if not load_api_key():
        return

    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)
    
    print("🚀 HuggingFace 임베딩 모델을 로드합니다... (처음 실행 시 시간이 걸릴 수 있습니다)")
    model_name = "jhgan/ko-sroberta-multitask"
    embeddings = HuggingFaceEmbeddings(model_name=model_name)
    print(f"✅ '{model_name}' 모델 로드 완료!")

    csv_files = ['food_data_description.csv', 'drink.csv', 'sidedish.csv']
    master_df = load_and_normalize_data(csv_files)
    if master_df is None: 
        print("❌ 로드할 데이터가 없어 프로그램을 종료합니다.")
        return
    
    retriever = create_rag_retriever(master_df, embeddings)
    print("✅ 통합 데이터를 기반으로 RAG Retriever 생성을 완료했습니다.\n")

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + "\n\n[검색된 참고 자료]\n{context}"),
        ("user", "{question}")
    ])

    rag_chain = (
        {"context": retriever, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    print("🤖 AI 영양 코치 '헬핏'입니다. (HuggingFace RAG 연동 완료!) 무엇을 도와드릴까요? (종료: '종료')")
    print("-" * 50)

    while True:
        user_input = input("You: ")
        if user_input.lower() == "종료":
            print("🤖 이용해주셔서 감사합니다! 건강한 하루 보내세요!")
            break
        
        response = rag_chain.invoke(user_input)
        
        print(f"헬핏 COACH: {response}")
        print("-" * 50)

if __name__ == "__main__":
    main()