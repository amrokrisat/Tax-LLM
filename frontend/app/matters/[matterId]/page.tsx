import { MatterWorkspace } from "@/components/matter-workspace";
import { requireServerUser } from "@/lib/server-auth";

export default async function MatterPage({
  params,
}: {
  params: Promise<{ matterId: string }>;
}) {
  await requireServerUser();
  const { matterId } = await params;
  return <MatterWorkspace matterId={matterId} />;
}
