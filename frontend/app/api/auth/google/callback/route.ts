import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SESSION_COOKIE = "tax_llm_session";

function backendBaseUrl() {
  return (
    process.env.BACKEND_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  );
}

async function exchangeGoogleSession(
  baseUrl: string,
  body: { email: string; name: string },
) {
  return fetch(`${baseUrl}/api/v1/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

function decodeIdToken(
  idToken: string | undefined,
): { email: string; name: string } | null {
  if (!idToken) {
    return null;
  }
  try {
    const [, payload] = idToken.split(".");
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as {
      email?: string;
      name?: string;
    };
    if (!decoded.email || !decoded.name) {
      return null;
    }
    return { email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = backendBaseUrl();

    if (!code || !clientId || !clientSecret) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
    let userInfo = decodeIdToken(tokenPayload.id_token);

    if (!userInfo && tokenPayload.access_token) {
      const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });

      if (!userInfoResponse.ok) {
        return NextResponse.redirect(new URL("/login?error=google", request.url));
      }

      userInfo = (await userInfoResponse.json()) as { email: string; name: string };
    }

    if (!userInfo?.email || !userInfo?.name) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    const sessionResponse = await exchangeGoogleSession(baseUrl, {
      email: userInfo.email,
      name: userInfo.name,
    });

    if (!sessionResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    const payload = (await sessionResponse.json()) as { session_token: string };
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, payload.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return NextResponse.redirect(new URL("/app", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
}
