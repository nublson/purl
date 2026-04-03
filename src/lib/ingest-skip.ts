import prisma from "@/lib/prisma";

export async function skipIngest(linkId: string): Promise<void> {
  await prisma.link.update({
    where: { id: linkId },
    data: { ingestStatus: "SKIPPED" },
  });
}
