import { redirect } from "next/navigation";

import { getServerSessionToken, hasServerSession, requireServerSession } from "@/lib/server-data";

export { getServerSessionToken, hasServerSession, requireServerSession };

export async function requireServerUser() {
  const sessionToken = await getServerSessionToken();
  if (!sessionToken) {
    redirect("/login");
  }
  return {
    user_id: "session",
    email: "",
    name: "",
  };
}
