import requests
from bs4 import BeautifulSoup
import json
from pathlib import Path
from urllib.parse import urlparse

def scrape_dcare_docs(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'lxml')

        # Tìm tất cả các thẻ <section> vì đây là các khối nội dung chính
        sections = soup.find_all('section')
        
        data_for_rag = []
        
        for section in sections:
            section_id = section.get('id', 'no-id')
            
            # Lấy tiêu đề trong section (thường là h3 class "heading-index" hoặc h2)
            title_tag = section.find(['h2', 'h3'])
            title = title_tag.get_text(strip=True) if title_tag else section_id
            
            # Gom tất cả nội dung văn bản trong các thẻ p, li
            # Chúng ta giữ cấu trúc phân cấp nhẹ để chatbot dễ hiểu
            content_parts = []
            for elem in section.find_all(['p', 'li', 'h4']):
                text = elem.get_text(strip=True)
                if text:
                    content_parts.append(text)
            
            full_text = "\n".join(content_parts)
            
            if full_text:
                data_for_rag.append({
                    "id": section_id,
                    "title": title,
                    "content": full_text,
                    "source": f"{url}#{section_id}"
                })
        
        return data_for_rag

    except Exception as e:
        print(f"Có lỗi xảy ra: {e}")
        return []

def url_to_filename(url: str) -> str:
    """
    Convert a URL into a stable filename (no query/fragment).
    Example: https://docs.theme-sky.com/dcare/ -> docs-theme-sky-com__dcare.json
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "unknown-host").replace(".", "-")
    path = (parsed.path or "/").strip("/")
    path_part = path.replace("/", "__") if path else "root"
    return f"{host}__{path_part}.json"

# Thực thi: crawl nhiều URL (mỗi URL -> 1 file JSON trong backend/data/raw)
URLS = [
    "https://docs.theme-sky.com/dcare/",
    'https://docs.theme-sky.com/wikibook/',
    'https://docs.theme-sky.com/cozycorner/',
    'https://docs.theme-sky.com/emall/',
    'https://docs.theme-sky.com/merto/',
    'https://docs.theme-sky.com/ecomall/',
]

raw_dir = Path(__file__).resolve().parents[1] / "backend" / "data" / "raw"
raw_dir.mkdir(parents=True, exist_ok=True)

total_chunks = 0
for url in URLS:
    scraped_data = scrape_dcare_docs(url)
    total_chunks += len(scraped_data)

    out_path = raw_dir / url_to_filename(url)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(scraped_data, f, ensure_ascii=False, indent=4)

    print(f"[OK] {url} -> {out_path.name} ({len(scraped_data)} chunks)")

print(f"Đã cào thành công tổng cộng {total_chunks} đoạn dữ liệu từ {len(URLS)} URL.")