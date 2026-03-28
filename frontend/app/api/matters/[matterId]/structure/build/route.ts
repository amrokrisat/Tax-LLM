import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { matterTag, mattersTag } from "@/lib/cache-tags";

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

export async function POST(
  _request: Request,
  context: { params: Promise<{ matterId: string }> },
) {
  const { matterId } = await context.params;
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  const response = await fetch(`${backendBaseUrl()}/api/v1/matters/${matterId}/structure/build`, {
    method: "POST",
    headers: { "X-Tax-Session": sessionToken },
    cache: "no-store",
  });
  const body = await response.text();
  if (response.ok) {
    revalidateTag(mattersTag(sessionToken), "max");
    revalidateTag(matterTag(sessionToken, matterId), "max");
  }
  return new NextResponse(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
