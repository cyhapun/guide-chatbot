import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get base URL from environment variable
    let backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000';

    if (backendBaseUrl.startsWith('/')) {
      const { origin } = new URL(req.url); 
      backendBaseUrl = `${origin}${backendBaseUrl}`;
    }

    // Clean URL: ensure there are no duplicate slashes (e.g., //chat)
    const finalUrl = `${backendBaseUrl}/chat`.replace(/([^:]\/)\/+/g, "$1");

    console.log(`[Proxy] Calling backend at: ${finalUrl}`);

    // 3. Gọi Backend Python
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Bạn có thể thêm các headers bảo mật khác ở đây nếu cần
      },
      body: JSON.stringify(body),
    });

    // 4. Xử lý phản hồi từ Backend
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: 'Backend returned an error', 
          details: errorData.detail || `Status: ${response.status}` 
        }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Trả dữ liệu về cho Frontend
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Frontend API Proxy Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Backend connection error', 
        details: error.message 
      }, 
      { status: 500 }
    );
  }
}