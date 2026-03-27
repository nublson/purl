import { Link } from "@/utils/links";
import { AnimatePresence, motion } from "motion/react";
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
  prependItems?: React.ReactNode;
  preview?: boolean;
}) => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-4">
      <p className="text-xs text-muted-foreground font-medium ml-2">{label}</p>
      <ItemGroup className="w-full gap-0">
        {prependItems}
        <AnimatePresence>
          {links.map((link) => (
            <motion.div
              key={link.id}
              layout
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
            >
              <LinkItem link={link} preview={preview} />
            </motion.div>
          ))}
        </AnimatePresence>
      </ItemGroup>
    </div>
  );
};
