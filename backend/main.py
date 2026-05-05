import os
import traceback
from pathlib import Path
from typing import List
import time
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage

# --- NẠP BIẾN MÔI TRƯỜNG ---
current_dir = Path(__file__).resolve().parent
env_path = current_dir.parent / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# --- IMPORT TỪ RAG SERVICE ---
# Đã đổi build_nested_context thành build_context
from rag_service import (
    init_vector_db, 
    get_retriever, 
    build_context, 
    format_docs_for_frontend
)

# Khởi tạo Vector DB ngay khi chạy server
try:
    init_vector_db()
except Exception as e:
    print(f"Lỗi khởi tạo vector database: {e}")

# --- KHỞI TẠO FASTAPI APP ---
app = FastAPI(title="Dcare Docs RAG Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- KHAI BÁO CÁC MODEL DỮ LIỆU ---
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    model: str
    theme: str | None = None
    # Đã bỏ category vì Docs không phân chia ngành luật

# --- HÀM TIỆN ÍCH ---
def get_llm(model_name: str) -> BaseChatModel:
    """
    Hỗ trợ định dạng model: <PROVIDER>:<MODEL_ID>
    - GOOGLE:gemini-2.0-flash
    - OPENAI:gpt-4o-mini
    - OPENROUTER:openai/gpt-4o-mini
    """
    temperature = 0.25

    if ":" not in model_name:
        hf_token = os.getenv("HUGGINGFACE_API_KEY")
        if not hf_token:
            raise ValueError("Không tìm thấy HUGGINGFACE_API_KEY. Vui lòng cấu hình trong file .env")

        llm = HuggingFaceEndpoint(
            repo_id=model_name,
            task="text-generation",
            max_new_tokens=1500,
            temperature=temperature,
            huggingfacehub_api_token=hf_token,
            do_sample=True,
            repetition_penalty=1.1,
            timeout=300,
        )
        return ChatHuggingFace(llm=llm)

    provider, real_model = model_name.split(":", 1)
    provider = provider.strip().upper()
    real_model = real_model.strip()

    if not real_model:
        raise ValueError("Model không hợp lệ. Định dạng đúng: <PROVIDER>:<MODEL_ID>.")

    if provider == "GOOGLE":
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Không tìm thấy GOOGLE_API_KEY trong file .env.")
        return ChatGoogleGenerativeAI(
            model=real_model,
            google_api_key=api_key,
            temperature=temperature,
            timeout=300,
        )

    if provider == "OPENAI":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("Không tìm thấy OPENAI_API_KEY trong file .env.")
        return ChatOpenAI(
            model=real_model,
            api_key=api_key,
            temperature=temperature,
            timeout=300,
        )

    if provider == "OPENROUTER":
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("Không tìm thấy OPENROUTER_API_KEY trong file .env.")
        return ChatOpenAI(
            model=real_model,
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=temperature,
            timeout=300,
            default_headers={
                "HTTP-Referer": os.getenv("APP_URL", "http://localhost:3000"),
                "X-Title": "Theme Docs Chatbot",
            },
        )

    raise ValueError(f"Provider '{provider}' chưa được hỗ trợ.")

# --- CẤU TRÚC SYSTEM PROMPT DÀNH CHO DOCS ---
prompt = ChatPromptTemplate.from_messages([
    ("system", """
YOU ARE A HELPFUL TECHNICAL SUPPORT ASSISTANT FOR THE THEME.

Your task is to answer user questions strictly based on the provided "Documentation Reference Data".

MANDATORY RULES:
1. CLEAR CITATION: Always reference the documentation title or provide the reference link when explaining a solution.
2. NO ASSUMPTION: Only answer based on the provided data. If the data does not sufficiently address the issue, politely respond with:
   "Hiện tại tài liệu hướng dẫn chưa đề cập chi tiết đến vấn đề này. Bạn có thể mở một ticket trên support center (trung tâm hỗ trợ) của Theme-Sky để được trợ giúp nhé."
3. TONE & LANGUAGE: Always respond in a professional, friendly, and helpful tone in Vietnamese. Use markdown (bolding, lists) to make the steps easy to read.

====================
[1] SYSTEM-EXTRACTED DOCUMENTATION REFERENCE DATA:
{context}

====================
[2] PREVIOUS CHAT HISTORY (For context only, not factual basis):
{chat_history_str}
"""),
    ("human", """
> CÂU HỎI MỚI CỦA NGƯỜI DÙNG:
{question}
""")
])

# --- API ENDPOINTS ---
@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        # 1. Tách câu hỏi cuối cùng
        last_message = request.messages[-1].content
        
        # 2. Xử lý lịch sử chat thành văn bản rõ ràng
        history_lines = []
        for msg in request.messages[:-1]:
            role_name = "🧑 USER" if msg.role == "user" else "🤖 AI"
            history_lines.append(f"{role_name}: {msg.content}")
            
        chat_history_str = "\n\n".join(history_lines) if history_lines else "(Không có lịch sử trò chuyện)"

        # 3. Truy xuất tài liệu Docs liên quan
        retriever = get_retriever(request.theme)
        retrieved_docs = await retriever.ainvoke(last_message)
        
        # 4. Đóng gói dữ liệu (Context)
        # Sử dụng build_context thay cho build_nested_context
        context_text = build_context(retrieved_docs)
        frontend_context = format_docs_for_frontend(retrieved_docs)

        # RENDER PROMPT & GHI LOG
        print("\n" + "="*60)
        print(" CHUẨN BỊ FEED DATA CHO LLM (CONTEXT)")
        print("="*60)
        print(context_text)
        print("="*60 + "\n")

        # 5. Gọi LLM để sinh câu trả lời
        start_time = time.time()
        
        llm = get_llm(request.model)
        rag_chain = prompt | llm | StrOutputParser()

        output_text = await rag_chain.ainvoke({
            "context": context_text,
            "chat_history_str": chat_history_str,
            "question": last_message
        })

        execution_time = time.time() - start_time
        print(f"⏱️ LLM Response Time: {execution_time:.2f}s")

        return {
            "text": output_text,
            "contextUsed": frontend_context
        }

    except Exception as e:
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=str(e))
    
# --- KHỞI CHẠY SERVER ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)