import { NextRequest, NextResponse } from "next/server";

function backendBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const response = await fetch(`${backendBaseUrl()}/api/v1/intake/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Backend analysis service is currently unavailable." },
      { status: 502 },
    );
  }
}
