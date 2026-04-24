import { Link } from "@/utils/links";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

export const LinkGroup = ({
  label,
  links,
  prependItems,
  preview,
  eagerFirstLinkFavicon = false,
}: {
  label: string;
  links: Link[];
  newLinkId?: string | null;
  prependItems?: ReactNode;
  preview?: boolean;
  eagerFirstLinkFavicon?: boolean;
}) => {
  const prevIdsRef = useRef<string[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    const currentIds = links.map((link) => link.id);

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }

    prevIdsRef.current = currentIds;
  }, [label, links]);

  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <p className="text-xs text-muted-foreground font-medium ml-2">{label}</p>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        <AnimatePresence>
          {links.map((link, index) => (
            <motion.div
              key={link.id}
              layout
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
            >
              <LinkItem
                link={link}
                preview={preview}
                eagerFavicon={eagerFirstLinkFavicon && index === 0}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </ItemGroup>
    </div>
  );
};
