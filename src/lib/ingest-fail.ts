import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import type { IngestFailureReason } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";

export async function failIngest(
  linkId: string,
  reason: IngestFailureReason = "OTHER",
): Promise<void> {
  await prisma.link.update({
    where: { id: linkId },
    data: { ingestStatus: "FAILED", ingestFailureReason: reason },
  });
  await notifyLinksAfterIngest(linkId);
}
