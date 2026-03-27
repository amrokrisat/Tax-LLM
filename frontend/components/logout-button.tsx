"use client";

import { useRouter } from "next/navigation";

import { signOut } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button className="button-ghost" onClick={handleLogout} type="button">
      Sign out
    </button>
  );
}
