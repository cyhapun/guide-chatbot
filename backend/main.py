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
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage

# --- NẠP BIẾN MÔI TRƯỜNG ---
current_dir = Path(__file__).resolve().parent
env_path = current_dir.parent / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# --- IMPORT TỪ RAG SERVICE ---
from rag_service import (
    init_vector_db, 
    get_retriever, 
    build_nested_context, 
    format_docs_for_frontend
)

# Khởi tạo Vector DB ngay khi chạy server
try:
    init_vector_db()
except Exception as e:
    print(f"Lỗi khởi tạo vector database: {e}")

# --- KHỞI TẠO FASTAPI APP ---
app = FastAPI(title="VietLaw RAG Backend - Nested Schema")

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
    category: str = "Chung" # Bổ sung Category từ Frontend để lọc tài liệu tốt hơn

# --- HÀM TIỆN ÍCH ---
def get_llm(model_name: str) -> ChatHuggingFace:
    """Khởi tạo kết nối với mô hình ngôn ngữ lớn (LLM) qua HuggingFace."""
    hf_token = os.getenv("HUGGINGFACE_API_KEY")
    if not hf_token:
        raise ValueError("Không tìm thấy HUGGINGFACE_API_KEY. Vui lòng cấu hình trong file .env")

    llm = HuggingFaceEndpoint(
        repo_id=model_name,
        task="text-generation",
        max_new_tokens=1500,
        temperature=0.1, # Giữ nhiệt độ thấp để câu trả lời pháp lý được chính xác, không bay bổng
        huggingfacehub_api_token=hf_token,
        do_sample=True,
        repetition_penalty=1.1,
        timeout=300,
    )
    return ChatHuggingFace(llm=llm)

# --- CẤU TRÚC SYSTEM PROMPT ---
prompt = ChatPromptTemplate.from_messages([
    ("system", """
YOU ARE A MULTI-DISCIPLINARY LEGAL EXPERT.

Your task is to answer questions strictly based on the provided "Legal Reference Data Packages".

MANDATORY RULES:
1. CLEAR CITATION: Always begin your answer by explicitly stating the Law name, Chapter, Article, and Clause.
2. HANDLE CROSS-REFERENCES: When encountering the section "REFERENCES FOR THIS LEGAL BASIS", use its content to directly interpret and explain the corresponding terms in the clause.
3. NO ASSUMPTION: Only answer based on the provided data. If the data does not sufficiently address the issue, respond with:
   "Hiện tại tài liệu hệ thống cung cấp chưa đủ để giải đáp chi tiết vấn đề này".
4. LANGUAGE: Always respond in professional and objective Vietnamese.

====================
[1] SYSTEM-EXTRACTED LEGAL REFERENCE DATA:
{context}

====================
[2] PREVIOUS CHAT HISTORY (Dùng để hiểu ngữ cảnh, KHÔNG dùng làm căn cứ pháp lý):
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
        
        # 2. Xử lý lịch sử chat thành văn bản rõ ràng (Dùng cho Log và LLM)
        history_lines = []
        for msg in request.messages[:-1]:
            role_name = "🧑 USER" if msg.role == "user" else "🤖 AI"
            history_lines.append(f"{role_name}: {msg.content}")
            
        chat_history_str = "\n\n".join(history_lines) if history_lines else "(Không có lịch sử trò chuyện)"

        # 3. Truy xuất tài liệu pháp lý liên quan
        retriever = get_retriever(category=request.category)
        retrieved_docs = await retriever.ainvoke(last_message)
        
        # 4. Đóng gói dữ liệu (Context)
        context_text = build_nested_context(retrieved_docs)
        frontend_context = format_docs_for_frontend(retrieved_docs)

        # RENDER PROMPT & GHI LOG
        # Sinh ra prompt hoàn chỉnh 
        final_formatted_prompt = prompt.format(
            context=context_text,
            chat_history_str=chat_history_str, # Truyền chuỗi lịch sử vào đây
            question=last_message
        )

        print("\n" + "="*60)
        print(" CHUẨN BỊ FEED DATA CHO LLM (CONTEXT)")
        print("="*60)
        print(context_text)
        print("="*60 + "\n")

        # 5. Gọi LLM để sinh câu trả lời và đo thời gian
        start_time = time.time()
        
        llm = get_llm(request.model)
        rag_chain = prompt | llm | StrOutputParser()

        # Gọi ainvoke với các tham số đã cập nhật
        output_text = await rag_chain.ainvoke({
            "context": context_text,
            "chat_history_str": chat_history_str,
            "question": last_message
        })

        execution_time = time.time() - start_time

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