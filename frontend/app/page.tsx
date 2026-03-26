import { LandingPage } from "@/components/landing-page";
import { getServerUser } from "@/lib/server-auth";

export default async function HomePage() {
  const user = await getServerUser();
  return <LandingPage signedIn={Boolean(user)} />;
}
