import type { NotionBlock } from "@/lib/notion";

export type BlockGroup =
  | { kind: "block"; block: NotionBlock }
  | { kind: "bulleted" | "numbered" | "todo"; items: NotionBlock[] };

const LIST_KINDS = {
  bulleted_list_item: "bulleted",
  numbered_list_item: "numbered",
  to_do: "todo",
} as const;

/** Merges consecutive list items of one kind into a group; other blocks stand alone. */
export function groupBlocks(blocks: NotionBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const block of blocks) {
    const kind = LIST_KINDS[block.type as keyof typeof LIST_KINDS];
    if (!kind) {
      groups.push({ kind: "block", block });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) {
      last.items.push(block);
    } else {
      groups.push({ kind, items: [block] });
    }
  }
  return groups;
}
