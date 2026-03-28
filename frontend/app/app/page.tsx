import { redirect } from "next/navigation";

import { MattersHome } from "@/components/matters-home";
import { requireServerSession } from "@/lib/server-auth";
import { listServerMatterSummaries } from "@/lib/server-data";

export default async function AppHomePage() {
  const sessionToken = await requireServerSession();
  let initialMatters;
  try {
    initialMatters = await listServerMatterSummaries(sessionToken);
  } catch {
    redirect("/api/auth/logout?redirect=/login?error=session");
  }
  return <MattersHome initialMatters={initialMatters} />;
}
