import { MatterWorkspace } from "@/components/matter-workspace";
import { requireServerSession } from "@/lib/server-auth";
import { getServerMatter } from "@/lib/server-data";

export default async function MatterPage({
  params,
}: {
  params: Promise<{ matterId: string }>;
}) {
  const { matterId } = await params;
  const sessionToken = await requireServerSession();
  const initialMatter = await getServerMatter(matterId, sessionToken);
  return <MatterWorkspace matterId={matterId} initialMatter={initialMatter} />;
}
