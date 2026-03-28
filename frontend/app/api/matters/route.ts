import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { mattersTag } from "@/lib/cache-tags";

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

export async function GET(request: NextRequest) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  const view = request.nextUrl.searchParams.get("view");
  const url = new URL(`${backendBaseUrl()}/api/v1/matters`);
  if (view) {
    url.searchParams.set("view", view);
  }
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { "X-Tax-Session": sessionToken },
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function POST(request: NextRequest) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  const payload = await request.text();
  const response = await fetch(`${backendBaseUrl()}/api/v1/matters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tax-Session": sessionToken,
    },
    body: payload,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (response.ok) {
    revalidateTag(mattersTag(sessionToken), "max");
  }
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
