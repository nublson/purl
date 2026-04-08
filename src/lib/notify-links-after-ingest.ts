import prisma from "@/lib/prisma";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";

/**
 * Notifies subscribed clients to refresh so `ingestStatus` updates after background ingest.
 * Call on every terminal ingest outcome (completed, failed, skipped).
 */
export async function notifyLinksAfterIngest(linkId: string): Promise<void> {
  try {
    const row = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });
    if (row?.userId) await broadcastLinksChanged(row.userId);
  } catch {
    // Never break ingest if realtime lookup or broadcast fails
  }
}
