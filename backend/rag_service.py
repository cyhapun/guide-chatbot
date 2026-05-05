import os
import json
import glob
import time
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
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

# Raw: dữ liệu crawling (input cho embedding/RAG)
RAW_DIR = BASE_DIR / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# Processed: artifact do hệ RAG tạo ra (index, tracking,...)
PROCESSED_DIR = BASE_DIR / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Dữ liệu crawling để embedding/RAG (vd: backend/data/raw/dcare_docs.json)
JSON_DATA_PATH = str(RAW_DIR)

def theme_key_from_path(file_path: str) -> str:
    """Theme key = filename without extension (stable per raw json)."""
    return Path(file_path).stem

def theme_dir(theme_key: str) -> Path:
    d = PROCESSED_DIR / theme_key
    d.mkdir(parents=True, exist_ok=True)
    return d

def theme_faiss_index_path(theme_key: str) -> str:
    return str(theme_dir(theme_key) / "faiss_index")

def theme_tracking_file(theme_key: str) -> str:
    return str(theme_dir(theme_key) / "embedded_files.json")

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
# One vectorstore per theme (key = raw json stem)
VECTORSTORES: Dict[str, FAISS] = {}
KNOWLEDGE_BASE: Dict[str, Any] = {} # Chỉ cần 1 dict duy nhất để lưu các chunk theo ID

def load_knowledge_base_to_ram() -> None:
    """Nạp toàn bộ dữ liệu JSON vào RAM để Chatbot truy xuất siêu tốc."""
    global KNOWLEDGE_BASE
    json_files = glob.glob(os.path.join(JSON_DATA_PATH, "*.json"))
    
    print(f"Đang nạp {len(json_files)} file JSON vào bộ nhớ...")
    
    for file_path in json_files:
        tkey = theme_key_from_path(file_path)
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f) # Lúc này data là một list các dict
            
            # Cấu trúc mới là mảng phẳng, duyệt trực tiếp luôn
            for chunk in data:
                chunk_id = chunk.get("id")
                if chunk_id:
                    namespaced_id = f"{tkey}:{chunk_id}"
                    KNOWLEDGE_BASE[namespaced_id] = {
                        "id": namespaced_id,
                        "theme": tkey,
                        "title": chunk.get("title", ""),
                        "content": chunk.get("content", ""),
                        "source": chunk.get("source", "")
                    }
                
    print("Nạp dữ liệu vào RAM hoàn tất!")

def get_processed_files(theme_key: str) -> List[str]:
    """Đọc danh sách raw JSON đã embedding (theo từng theme)."""
    tracking = theme_tracking_file(theme_key)
    if os.path.exists(tracking):
        with open(tracking, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def mark_file_as_processed(theme_key: str, filename: str) -> None:
    """Đánh dấu raw JSON đã embedding xong (theo theme)."""
    processed = get_processed_files(theme_key)
    if filename not in processed:
        processed.append(filename)
        with open(theme_tracking_file(theme_key), 'w', encoding='utf-8') as f:
            json.dump(processed, f, ensure_ascii=False, indent=4)

def migrate_legacy_artifacts_if_any(all_json_files: List[str]) -> None:
    """
    Legacy layout (single index/tracking under backend/data/processed):
      - backend/data/processed/dcare_faiss_index
      - backend/data/processed/embedded_files.json
    If present and we can infer a single theme, move into backend/data/processed/<theme>/.
    """
    legacy_index_dir = PROCESSED_DIR / "dcare_faiss_index"
    legacy_tracking = PROCESSED_DIR / "embedded_files.json"
    if not legacy_index_dir.exists() and not legacy_tracking.exists():
        return
    if len(all_json_files) != 1:
        # Multiple themes exist; avoid guessing. User can re-embed.
        return

    tkey = theme_key_from_path(all_json_files[0])
    tdir = theme_dir(tkey)
    if legacy_index_dir.exists() and not (tdir / "faiss_index").exists():
        legacy_index_dir.rename(tdir / "faiss_index")
        print(f"[Migrate] Moved legacy index -> data/processed/{tkey}/faiss_index")
    if legacy_tracking.exists() and not (tdir / "embedded_files.json").exists():
        legacy_tracking.rename(tdir / "embedded_files.json")
        print(f"[Migrate] Moved legacy embedded_files.json -> data/processed/{tkey}/embedded_files.json")

def init_vector_db() -> None:
    """Hàm khởi tạo và cập nhật cơ sở dữ liệu vector (FAISS)."""
    global VECTORSTORES
    
    # 1. Nạp dữ liệu vào RAM
    load_knowledge_base_to_ram()
    
    all_json_files = glob.glob(os.path.join(JSON_DATA_PATH, "*.json"))
    if not all_json_files:
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu JSON để embedding tại: {JSON_DATA_PATH}. "
            f"Hãy chạy script crawl để tạo file (vd: backend/data/raw/dcare_docs.json)."
        )

    migrate_legacy_artifacts_if_any(all_json_files)
    
    # 2. Load (or embed) per-theme indices
    pending_tasks: List[Tuple[str, str]] = []
    for file_path in sorted(all_json_files):
        tkey = theme_key_from_path(file_path)
        filename = os.path.basename(file_path)
        processed_files = get_processed_files(tkey)
        index_path = theme_faiss_index_path(tkey)

        # Load index if exists
        if os.path.exists(index_path):
            if tkey not in VECTORSTORES:
                print(f"Đang tải FAISS Index cho theme '{tkey}' từ ổ cứng...")
                VECTORSTORES[tkey] = FAISS.load_local(
                    index_path,
                    embeddings,
                    allow_dangerous_deserialization=True
                )

        # Embed if not processed or index missing
        if filename not in processed_files or tkey not in VECTORSTORES:
            pending_tasks.append((tkey, file_path))

    if not pending_tasks and VECTORSTORES:
        print(">> TẤT CẢ CÁC THEME ĐÃ ĐƯỢC EMBEDDING! Hệ thống sẵn sàng.")
        return
    if not pending_tasks and not VECTORSTORES:
        raise RuntimeError(
            "Không tìm thấy FAISS index nào trong data/processed và cũng không có file JSON cần embedding."
        )

    # 3. Tiến hành nhúng (embedding) - chạy tuần tự để tránh quá tải API
    print(f"Còn {len(pending_tasks)} theme/file cần nhúng.")

    BATCH_SIZE = 32
    MAX_RETRIES = 3

    for tkey, file_to_process in pending_tasks:
        filename = os.path.basename(file_to_process)

        print("=" * 50)
        print(f" BẮT ĐẦU EMBEDDING THEME: {tkey} | FILE: {filename}")
        print("=" * 50)

        splits: List[Document] = []
        with open(file_to_process, "r", encoding="utf-8") as f:
            data = json.load(f)

            # Tạo Document từ cấu trúc list đơn giản
            for chunk in data:
                chunk_id = chunk.get("id")
                if not chunk_id:
                    continue
                namespaced_id = f"{tkey}:{chunk_id}"
                metadata = {
                    "id": namespaced_id,
                    "theme": tkey,
                    "title": chunk.get("title"),
                    "source": chunk.get("source"),
                }
                doc = Document(page_content=chunk.get("content", ""), metadata=metadata)
                splits.append(doc)

        print(f"Số lượng chunk cần nhúng của file này: {len(splits)}")

        for i in range(0, len(splits), BATCH_SIZE):
            batch = splits[i : i + BATCH_SIZE]
            print(f"  + Đang đẩy lên HuggingFace batch {i} đến {i + len(batch)}...")

            for attempt in range(MAX_RETRIES):
                try:
                    if tkey not in VECTORSTORES:
                        VECTORSTORES[tkey] = FAISS.from_documents(
                            batch, embeddings, distance_strategy=DistanceStrategy.COSINE
                        )
                    else:
                        VECTORSTORES[tkey].add_documents(batch)

                    time.sleep(5)
                    break

                except Exception as e:
                    print(
                        f"    -> [Cảnh báo] Lỗi kết nối ở lần thử {attempt + 1}/{MAX_RETRIES}: {str(e)[:100]}..."
                    )
                    if attempt < MAX_RETRIES - 1:
                        wait_time = 15 * (attempt + 1)
                        print(f"    -> Đang tạm nghỉ {wait_time} giây để máy chủ phục hồi...")
                        time.sleep(wait_time)
                    else:
                        print(f"\n[X] THẤT BẠI TẠI BATCH {i} SAU {MAX_RETRIES} LẦN THỬ.")
                        raise e

        VECTORSTORES[tkey].save_local(theme_faiss_index_path(tkey))
        mark_file_as_processed(tkey, filename)
        print(f">> ĐÃ HOÀN THÀNH VÀ LƯU INDEX THEME: {tkey} | FILE: {filename}")

class MultiThemeRetriever:
    def __init__(self, retrievers: Dict[str, Any], k: int):
        self.retrievers = retrievers
        self.k = k

    async def ainvoke(self, query: str) -> List[Document]:
        # Query each theme retriever in parallel, then merge/dedupe.
        tasks = [r.ainvoke(query) for r in self.retrievers.values()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        merged: List[Document] = []
        seen_ids: set[str] = set()
        for r in results:
            if isinstance(r, Exception):
                continue
            for doc in r:
                doc_id = (doc.metadata or {}).get("id") or doc.page_content[:50]
                if doc_id in seen_ids:
                    continue
                seen_ids.add(doc_id)
                merged.append(doc)
                if len(merged) >= self.k:
                    return merged
        return merged[: self.k]

def get_retriever() -> Any:
    """Tạo retriever để tìm kiếm các đoạn tài liệu liên quan."""
    global VECTORSTORES
    if not VECTORSTORES:
        init_vector_db()
    if not VECTORSTORES:
        raise RuntimeError("Vector DB chưa được khởi tạo (VECTORSTORES rỗng). Vui lòng kiểm tra dữ liệu raw và processed index.")

    # Cấu hình tìm kiếm chuẩn cho Docs (Lấy k=4 hoặc 5 là đủ cho Docs)
    search_kwargs = {"k": 6, "fetch_k": 20, "lambda_mult": 0.8}
    per_theme = {
        tkey: vs.as_retriever(search_type="mmr", search_kwargs=search_kwargs)
        for tkey, vs in VECTORSTORES.items()
    }
    return MultiThemeRetriever(per_theme, k=search_kwargs["k"])

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