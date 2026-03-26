import { NextResponse } from "next/server";

function backendBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function GET() {
  try {
    const response = await fetch(`${backendBaseUrl()}/api/v1/demo/scenario`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load demo scenario from backend." },
        { status: response.status },
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Backend demo scenario is currently unavailable." },
      { status: 502 },
    );
  }
}
