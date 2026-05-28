"use client";

import { useCheckout } from "@/hooks/use-checkout";
import { Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

export function LinkUpgradeItem() {
  const { startCheckout, loading } = useCheckout();

  return (
    <Item className="flex-col">
      <ItemContent>
        <div className="flex items-start gap-2 mb-2">
          <ItemMedia variant="icon">
            <Sparkles />
          </ItemMedia>
          <ItemTitle>Upgrade to Pro</ItemTitle>
        </div>
        <ItemDescription>
          Upgrade for AI extraction, YouTube transcripts, and more
        </ItemDescription>
      </ItemContent>
      <ItemActions className="w-full">
        <Button
          className="w-full"
          size="sm"
          disabled={loading}
          onClick={() => void startCheckout()}
        >
          {loading ? "Redirecting…" : "Upgrade"}
        </Button>
      </ItemActions>
    </Item>
  );
}
