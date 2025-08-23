import os
from dotenv import load_dotenv  # .env 파일을 읽기 위한 라이브러리 import
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory

# --- 1. 초기 설정: 시스템 프롬프트 정의 ---

# 챗봇의 '영혼'을 결정하는 시스템 프롬프트입니다.
SYSTEM_PROMPT = """
# 페르소나 (Persona)
너는 '헬핏(HealthFit)'이라는 이름의 친절하고 전문적인 AI 영양 코치야. 너의 목표는 사용자가 건강한 식습관을 갖도록 돕는 것이야. 항상 과학적 사실에 기반하되, 긍정적이고 격려하는 말투를 사용해. 이모지를 적절히 사용하여 친근감을 표현해줘.

# 핵심 기능 (Core Functions)
너는 다음 4가지 핵심 기능을 수행할 수 있어.
1.  **상황 분석:** 사용자가 특정 음식 조합에 대해 물으면, 칼로리, 혈당, 성분 등 여러 관점에서 분석하고 조건부 답변을 제공해.
2.  **영양 추천:** 사용자가 먹은 음식의 부족한 점을 파악하고, 영양 균형을 맞출 음식을 추천해.
3.  **식사량 조절:** 사용자가 "절반만 먹었다"고 하면, 그 비율을 이해하고 영양 정보 재계산에 필요한 정보를 추출해.
4.  **목표 관리:** 사용자의 목표 칼로리를 바탕으로 남은 섭취량을 계산하고, 목표 달성을 위한 식단을 제안해.

# 대화 규칙 (Conversation Rules)
- **절대** 의학적 조언을 하지 마. 답변 마지막에는 항상 "※ 본 답변은 참고용이며, 의학적 소견이 필요할 경우 전문가와 상의하세요." 라는 문구를 포함해.
- 사용자가 제공한 정보 외에 추측성 발언은 하지 마. 정보가 부족하면 사용자에게 되물어봐.
- 모든 답변은 한국어로 해줘.
"""

def create_chatbot_skeleton():
    """
    시스템 프롬프트와 메모리를 갖춘 AI 영양 코치 챗봇의 뼈대를 생성합니다. (최신 LangChain 방식)
    """
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)

    prompt = ChatPromptTemplate(
        messages=[
            SystemMessagePromptTemplate.from_template(SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            HumanMessagePromptTemplate.from_template("{question}")
        ]
    )

    chain = prompt | llm

    chat_history_store = {}
    def get_session_history(session_id: str):
        if session_id not in chat_history_store:
            chat_history_store[session_id] = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
        return chat_history_store[session_id]

    chatbot_with_history = RunnableWithMessageHistory(
        chain,
        get_session_history,
        input_messages_key="question",
        history_messages_key="chat_history",
    )
    
    return chatbot_with_history

def main():
    """
    챗봇과의 대화를 시뮬레이션하는 메인 함수
    """
    # .env 파일 로드 및 API 키 확인
    load_dotenv()
    if not os.getenv("GOOGLE_API_KEY"):
        print("🚨 경고: GOOGLE_API_KEY를 찾을 수 없습니다.")
        print("프로젝트 폴더에 .env 파일을 만들고 'GOOGLE_API_KEY=당신의API키' 형식으로 저장해주세요.")
        return

    chatbot = create_chatbot_skeleton()

    print("🤖 AI 영양 코치 '헬핏'입니다. 무엇을 도와드릴까요? (대화를 종료하려면 '종료'를 입력하세요)")
    print("-" * 50)

    session_id = "my_test_session"

    while True:
        user_input = input("You: ")
        if user_input.lower() == "종료":
            print("🤖 이용해주셔서 감사합니다! 건강한 하루 보내세요!")
            break
        
        response = chatbot.invoke(
            {"question": user_input},
            config={"configurable": {"session_id": session_id}}
        )
        
        print(f"헬핏 COACH: {response.content}")
        print("-" * 50)


if __name__ == "__main__":
    main()