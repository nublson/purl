import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Typography } from "./typography";
import { Separator } from "./ui/separator";

export interface AccordionItem {
  value: string;
  title: string;
  content: string;
}

interface AccordionWrapperProps {
  item: AccordionItem;
  separator?: boolean;
}

export function AccordionWrapper({
  item,
  separator = true,
}: AccordionWrapperProps) {
  return (
    <Accordion type="single" collapsible className="max-w-lg">
      <AccordionItem value={item.value}>
        <AccordionTrigger className="md:text-base items-center cursor-pointer hover:no-underline">
          {item.title}
        </AccordionTrigger>
        <AccordionContent>
          <Typography className="text-muted-foreground font-light">
            {item.content}
          </Typography>
        </AccordionContent>
      </AccordionItem>
      {separator && <Separator className="w-full" />}
    </Accordion>
  );
}
