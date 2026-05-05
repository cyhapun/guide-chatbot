import requests
from bs4 import BeautifulSoup
import json
from pathlib import Path

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

# Thực thi
url = "https://docs.theme-sky.com/dcare/"
scraped_data = scrape_dcare_docs(url)

# Lưu kết quả crawling vào raw (input cho RAG)
out_path = Path(__file__).resolve().parents[1] / "backend" / "data" / "raw" / "dcare_docs.json"
out_path.parent.mkdir(parents=True, exist_ok=True)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(scraped_data, f, ensure_ascii=False, indent=4)

print(f"Đã cào thành công {len(scraped_data)} đoạn dữ liệu!")