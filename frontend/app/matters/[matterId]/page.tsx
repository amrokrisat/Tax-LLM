import { MatterWorkspace } from "@/components/matter-workspace";

export default async function MatterPage({
  params,
}: {
  params: Promise<{ matterId: string }>;
}) {
  const { matterId } = await params;
  return <MatterWorkspace matterId={matterId} />;
}
