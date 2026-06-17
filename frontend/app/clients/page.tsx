"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The dedicated Clients page was removed — clients are still used as data on
 * projects/payments, but there's no standalone management screen. Redirect any
 * old links to Projects.
 */
export default function ClientsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return null;
}
