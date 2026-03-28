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

async function clearSessionCookie() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    await fetch(`${backendBaseUrl()}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "X-Tax-Session": sessionToken,
      },
      cache: "no-store",
    });
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function POST() {
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  await clearSessionCookie();

  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/login";
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
