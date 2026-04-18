import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import prisma from "@/lib/prisma";

export type IngestFailureReason =
  | "NO_API_KEY"
  | "SCRAPE_FAILED"
  | "LINK_NOT_FOUND"
  | "OTHER";

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
