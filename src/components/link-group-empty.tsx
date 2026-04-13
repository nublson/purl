import { PackageOpen } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function LinkGroupEmpty() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>No Links Yet</EmptyTitle>
        <EmptyDescription>
          Press ⌘V anywhere on this page to save a link.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
