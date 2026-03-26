import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function backendBaseUrl() {
  return (
    process.env.BACKEND_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export async function GET() {
  try {
    const response = await fetch(`${backendBaseUrl()}/api/v1/demo/scenario`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: "Failed to load demo scenario from backend.",
          backend_status: response.status,
          detail: text.slice(0, 500),
        },
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
