import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
const SESSION_COOKIE = "tax_llm_session";

function backendBaseUrl() {
  return (
    process.env.BACKEND_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ matterId: string }> },
) {
  const { matterId } = await context.params;
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  const response = await fetch(`${backendBaseUrl()}/api/v1/matters/${matterId}`, {
    cache: "no-store",
    headers: { "X-Tax-Session": sessionToken },
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ matterId: string }> },
) {
  const { matterId } = await context.params;
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  const payload = await request.text();
  const response = await fetch(`${backendBaseUrl()}/api/v1/matters/${matterId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Tax-Session": sessionToken,
    },
    body: payload,
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
