import prisma from "@/lib/prisma";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";

export async function skipIngest(linkId: string): Promise<void> {
  await prisma.link.update({
    where: { id: linkId },
    data: { ingestStatus: "SKIPPED" },
  });
  await notifyLinksAfterIngest(linkId);
}
