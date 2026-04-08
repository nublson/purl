import { Link } from "@/utils/links";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

export const LinkGroup = ({
  label,
  links,
  prependItems,
  preview,
}: {
  label: string;
  links: Link[];
  newLinkId?: string | null;
  prependItems?: ReactNode;
  preview?: boolean;
}) => {
  const prevIdsRef = useRef<string[]>([]);
  const initializedRef = useRef(false);
  const [animatingAddedIds, setAnimatingAddedIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const currentIds = links.map((link) => link.id);
    const prevIds = prevIdsRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }

    const added = currentIds.filter((id) => !prevIds.includes(id));

    if (added.length > 0) {
      setAnimatingAddedIds((prev) => {
        const next = new Set(prev);
        for (const id of added) next.add(id);
        return next;
      });
    }

    prevIdsRef.current = currentIds;
  }, [label, links]);

  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <p className="text-xs text-muted-foreground font-medium ml-2">{label}</p>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        {links.map((link) => {
          const animateAdded = animatingAddedIds.has(link.id);
          return (
            <div
              key={link.id}
              className={
                animateAdded
                  ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                  : undefined
              }
              onAnimationEnd={() => {
                if (!animateAdded) return;
                setAnimatingAddedIds((prev) => {
                  if (!prev.has(link.id)) return prev;
                  const next = new Set(prev);
                  next.delete(link.id);
                  return next;
                });
              }}
            >
              <LinkItem link={link} preview={preview} />
            </div>
          );
        })}
      </ItemGroup>
    </div>
  );
};
