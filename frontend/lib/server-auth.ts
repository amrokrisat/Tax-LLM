import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "tax_llm_session";
const AUTH_FETCH_TIMEOUT_MS = 5000;

function backendBaseUrl() {
  return (
    process.env.BACKEND_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  );
}

export async function getServerSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function getServerUser() {
  const sessionToken = await getServerSessionToken();
  if (!sessionToken) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${backendBaseUrl()}/api/v1/auth/me`, {
      cache: "no-store",
      headers: {
        "X-Tax-Session": sessionToken,
      },
      signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    user: {
      user_id: string;
      email: string;
      name: string;
    };
  };
  return data.user;
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
