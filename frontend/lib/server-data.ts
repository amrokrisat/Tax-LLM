import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { MatterRecord, MatterSummary } from "@/lib/api";
import { matterTag, mattersTag } from "@/lib/cache-tags";

const SESSION_COOKIE = "tax_llm_session";

export function backendBaseUrl() {
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

export async function hasServerSession() {
  return Boolean(await getServerSessionToken());
}

export async function requireServerSession() {
  const sessionToken = await getServerSessionToken();
  if (!sessionToken) {
    redirect("/login");
  }
  return sessionToken;
}

async function fetchBackendJson<T>(
  path: string,
  sessionToken: string,
  tags: string[],
  timeoutMs = 10_000,
): Promise<T> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    headers: {
      "X-Tax-Session": sessionToken,
    },
    next: {
      revalidate: 30,
      tags,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status === 401 || response.status === 403) {
    redirect(`/api/auth/logout?redirect=${encodeURIComponent("/login")}`);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "The backend request could not be completed.");
  }

  return response.json() as Promise<T>;
}

export async function listServerMatterSummaries(sessionToken: string) {
  const data = await fetchBackendJson<{ matters: MatterSummary[] }>(
    "/api/v1/matters?view=summary",
    sessionToken,
    [mattersTag(sessionToken)],
  );
  return data.matters;
}

export async function getServerMatter(matterId: string, sessionToken: string) {
  const data = await fetchBackendJson<{ matter: MatterRecord }>(
    `/api/v1/matters/${matterId}`,
    sessionToken,
    [mattersTag(sessionToken), matterTag(sessionToken, matterId)],
    15_000,
  );
  return data.matter;
}
