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
    <Empty data-cy="link-group-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>No links yet</EmptyTitle>
        <EmptyDescription>
          Paste a link anywhere on this page to save it.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
