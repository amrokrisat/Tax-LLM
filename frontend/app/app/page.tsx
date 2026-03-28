import { MattersHome } from "@/components/matters-home";
import { requireServerSession } from "@/lib/server-auth";
import { listServerMatterSummaries } from "@/lib/server-data";

export default async function AppHomePage() {
  const sessionToken = await requireServerSession();
  const initialMatters = await listServerMatterSummaries(sessionToken);
  return <MattersHome initialMatters={initialMatters} />;
}
