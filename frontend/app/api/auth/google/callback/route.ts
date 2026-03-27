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

async function warmBackend(baseUrl: string) {
  try {
    await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Best-effort warmup only. The real auth call still runs even if this fails.
  }
}

async function exchangeGoogleSession(
  baseUrl: string,
  body: { email: string; name: string },
) {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });

      if (response.ok) {
        return response;
      }

      lastResponse = response;
      if (![502, 503, 504].includes(response.status) || attempt === 1) {
        return response;
      }
    } catch {
      if (attempt === 1) {
        break;
      }
    }

    await warmBackend(baseUrl);
  }

  return lastResponse;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = backendBaseUrl();

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }

  const backendWarmup = warmBackend(baseUrl);

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
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token: string };
  const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
    cache: "no-store",
  });

  if (!userInfoResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }

  const userInfo = (await userInfoResponse.json()) as { email: string; name: string };
  await backendWarmup;
  const sessionResponse = await exchangeGoogleSession(baseUrl, {
    email: userInfo.email,
    name: userInfo.name,
  });

  if (!sessionResponse || !sessionResponse.ok) {
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
}
