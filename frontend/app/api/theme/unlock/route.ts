import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Lấy Base URL backend từ env hoặc fallback localhost
    let backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    if (backendBaseUrl.startsWith('/')) {
      const { origin } = new URL(req.url);
      backendBaseUrl = `${origin}${backendBaseUrl}`;
    }

    const finalUrl = `${backendBaseUrl}/theme/unlock`.replace(/([^:]\/)\/+/g, "$1");

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: 'Backend trả về lỗi',
          details: errorData.detail || `Status: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Lỗi kết nối Backend',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

