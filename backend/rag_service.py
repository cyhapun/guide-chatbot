import os
import json
import glob
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
from langchain_huggingface import HuggingFaceEndpointEmbeddings

# Tải các biến môi trường (như API keys) từ file .env
load_dotenv()

# --- CẤU HÌNH ĐƯỜNG DẪN ---
# Dùng đường dẫn tuyệt đối theo thư mục backend để tránh phụ thuộc cwd khi chạy uvicorn
BASE_DIR = Path(__file__).resolve().parent

# Index/Tracking đặt trong backend/
FAISS_INDEX_PATH = str(BASE_DIR / "dcare_faiss_index")
TRACKING_FILE = str(BASE_DIR / "embedded_files.json")

# Dữ liệu đã xử lý để embedding/RAG (vd: backend/data/processed/dcare_docs.json)
JSON_DATA_PATH = str(BASE_DIR / "data" / "processed")

# --- KIỂM TRA & KHỞI TẠO MODEL ---
HF_TOKEN = os.getenv("HUGGINGFACE_API_KEY")
if not HF_TOKEN:
    raise ValueError("Không tìm thấy HUGGINGFACE_API_KEY. Vui lòng kiểm tra lại file .env của bạn nhé.")

print("Đang kết nối mô hình BAAI/bge-m3 qua Hugging Face API...")
embeddings = HuggingFaceEndpointEmbeddings(
    model="BAAI/bge-m3",
    task="feature-extraction",
    huggingfacehub_api_token=HF_TOKEN,
)

# --- BIẾN TOÀN CỤC ---
vectorstore: Optional[FAISS] = None
KNOWLEDGE_BASE: Dict[str, Any] = {} # Chỉ cần 1 dict duy nhất để lưu các chunk theo ID

def load_knowledge_base_to_ram() -> None:
    """Nạp toàn bộ dữ liệu JSON vào RAM để Chatbot truy xuất siêu tốc."""
    global KNOWLEDGE_BASE
    json_files = glob.glob(os.path.join(JSON_DATA_PATH, "*.json"))
    
    print(f"Đang nạp {len(json_files)} file JSON vào bộ nhớ...")
    
    for file_path in json_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f) # Lúc này data là một list các dict
            
            # Cấu trúc mới là mảng phẳng, duyệt trực tiếp luôn
            for chunk in data:
                chunk_id = chunk.get("id")
                if chunk_id:
                    KNOWLEDGE_BASE[chunk_id] = {
                        "id": chunk_id,
                        "title": chunk.get("title", ""),
                        "content": chunk.get("content", ""),
                        "source": chunk.get("source", "")
                    }
                
    print("Nạp dữ liệu vào RAM hoàn tất!")

def get_processed_files() -> List[str]:
    """Đọc danh sách các file đã được embedding thành công trước đó."""
    if os.path.exists(TRACKING_FILE):
        with open(TRACKING_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def mark_file_as_processed(filename: str) -> None:
    """Đánh dấu file đã xử lý xong để những lần chạy sau hệ thống sẽ bỏ qua."""
    processed = get_processed_files()
    if filename not in processed:
        processed.append(filename)
        with open(TRACKING_FILE, 'w', encoding='utf-8') as f:
            json.dump(processed, f, ensure_ascii=False, indent=4)

def init_vector_db() -> None:
    """Hàm khởi tạo và cập nhật cơ sở dữ liệu vector (FAISS)."""
    global vectorstore
    
    # 1. Nạp dữ liệu vào RAM
    load_knowledge_base_to_ram()
    
    # 2. Tìm các file JSON chưa được xử lý
    processed_files = get_processed_files()
    all_json_files = glob.glob(os.path.join(JSON_DATA_PATH, "*.json"))
    if not all_json_files:
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu JSON để embedding tại: {JSON_DATA_PATH}. "
            f"Hãy chạy script crawl để tạo file (vd: backend/data/processed/dcare_docs.json)."
        )
    pending_files = [f for f in all_json_files if os.path.basename(f) not in processed_files]
    
    # Tải index cũ nếu đã có
    if os.path.exists(FAISS_INDEX_PATH):
        print("Đang tải FAISS Index từ ổ cứng...")
        vectorstore = FAISS.load_local(
            FAISS_INDEX_PATH,
            embeddings,
            allow_dangerous_deserialization=True
        )
    
    if not pending_files:
        if vectorstore is None:
            raise RuntimeError(
                "Không có file JSON mới để embedding, nhưng cũng chưa tìm thấy FAISS index. "
                "Hãy xoá embedded_files.json (nếu có) hoặc chạy lại embedding để tạo index."
            )
        print(">> TẤT CẢ CÁC FILE ĐÃ ĐƯỢC EMBEDDING! Hệ thống sẵn sàng.")
        return

    # 3. Tiến hành nhúng (embedding)
    print(f"Còn {len(pending_files)} file chưa được nhúng.")
    file_to_process = pending_files[0] 
    filename = os.path.basename(file_to_process)
    
    print("=" * 50)
    print(f" BẮT ĐẦU EMBEDDING: {filename}")
    print("=" * 50)
    
    splits = []
    with open(file_to_process, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
        # Tạo Document từ cấu trúc list đơn giản
        for chunk in data:
            metadata = {
                "id": chunk.get("id"),
                "title": chunk.get("title"),
                "source": chunk.get("source")
            }
            doc = Document(page_content=chunk.get("content", ""), metadata=metadata)
            splits.append(doc)
            
    print(f"Số lượng chunk cần nhúng của file này: {len(splits)}")
    
    BATCH_SIZE = 32 
    MAX_RETRIES = 3 

    for i in range(0, len(splits), BATCH_SIZE):
        batch = splits[i:i+BATCH_SIZE]
        print(f"  + Đang đẩy lên HuggingFace batch {i} đến {i+len(batch)}...")
        
        for attempt in range(MAX_RETRIES):
            try:
                if vectorstore is None:
                    vectorstore = FAISS.from_documents(batch, embeddings, distance_strategy=DistanceStrategy.COSINE)
                else:
                    vectorstore.add_documents(batch)
                    
                time.sleep(5) 
                break         
                
            except Exception as e:
                print(f"    -> [Cảnh báo] Lỗi kết nối ở lần thử {attempt + 1}/{MAX_RETRIES}: {str(e)[:100]}...")
                if attempt < MAX_RETRIES - 1:
                    wait_time = 15 * (attempt + 1)
                    print(f"    -> Đang tạm nghỉ {wait_time} giây để máy chủ phục hồi...")
                    time.sleep(wait_time)
                else:
                    print(f"\n[X] THẤT BẠI TẠI BATCH {i} SAU {MAX_RETRIES} LẦN THỬ.")
                    raise e
            
    vectorstore.save_local(FAISS_INDEX_PATH)
    mark_file_as_processed(filename)
    
    print(f">> ĐÃ HOÀN THÀNH VÀ LƯU FILE: {filename}")

def get_retriever() -> Any:
    """Tạo retriever để tìm kiếm các đoạn tài liệu liên quan."""
    global vectorstore
    if vectorstore is None:
        init_vector_db()
    if vectorstore is None:
        raise RuntimeError("Vector DB chưa được khởi tạo (vectorstore=None). Vui lòng kiểm tra dữ liệu và FAISS index.")

    # Cấu hình tìm kiếm chuẩn cho Docs (Lấy k=4 hoặc 5 là đủ cho Docs)
    search_kwargs = {"k": 6, "fetch_k": 20, "lambda_mult": 0.8}
    
    return vectorstore.as_retriever(
        search_type="mmr", # Maximal Marginal Relevance giúp đa dạng hóa kết quả
        search_kwargs=search_kwargs
    )

def build_context(retrieved_docs: List[Document]) -> str:
    """Xây dựng chuỗi ngữ cảnh đơn giản từ các tài liệu tìm được."""
    context_blocks = []
    
    for i, doc in enumerate(retrieved_docs):
        chunk_id = doc.metadata.get("id")
        chunk_data = KNOWLEDGE_BASE.get(chunk_id)
        
        # Fallback nếu RAM chưa đồng bộ, lấy trực tiếp từ metadata của vectorstore
        title = chunk_data["title"] if chunk_data else doc.metadata.get("title", "No Title")
        source = chunk_data["source"] if chunk_data else doc.metadata.get("source", "")
        content = chunk_data["content"] if chunk_data else doc.page_content
        
        block = f"[Tài liệu #{i+1}]\n"
        block += f"- Tiêu đề: {title}\n"
        block += f"- Link tham khảo: {source}\n"
        block += f"- Nội dung: \"{content}\"\n"
        
        context_blocks.append(block)
    
    header = "--- THÔNG TIN HƯỚNG DẪN TỪ TÀI LIỆU ---\n"
    return header + "\n\n".join(context_blocks)

def format_docs_for_frontend(docs: List[Document]) -> List[Dict[str, Any]]:
    """Định dạng lại dữ liệu trả về để Frontend dễ dàng hiển thị Source (Nguồn)."""
    formatted = []
    for doc in docs:
        chunk_id = doc.metadata.get("id")
        data = KNOWLEDGE_BASE.get(chunk_id, {})
        
        # Nếu có data trong RAM thì dùng, không thì lấy từ metadata của DB
        content = data.get("content", doc.page_content)
        title = data.get("title", doc.metadata.get("title", ""))
        source = data.get("source", doc.metadata.get("source", ""))
        
        formatted.append({
            "content": content,
            "metadata": {
                "title": title,
                "source": source
            }
        })
    return formatted