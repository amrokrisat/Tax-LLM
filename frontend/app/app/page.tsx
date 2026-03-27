import { MattersHome } from "@/components/matters-home";
import { requireServerUser } from "@/lib/server-auth";

export default async function AppHomePage() {
  await requireServerUser();
  return <MattersHome />;
}
