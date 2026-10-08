import "server-only";

import { revalidatePath } from "next/cache";
import { DEMO_USERNAME } from "@/lib/demo-links";
import prisma from "@/lib/prisma";

/**
 * Refreshes the landing page when the demo account (`@purl`) changes, so the
 * live demo shows its folders and links on the next visit instead of after the
 * hourly revalidation. A no-op for every other user. Never throws.
 */
export async function revalidateLandingDemoFor(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (user?.username === DEMO_USERNAME) revalidatePath("/");
  } catch (err) {
    console.error("revalidateLandingDemoFor failed:", err);
  }
}
