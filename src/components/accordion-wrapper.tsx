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
  separator = false,
}: AccordionWrapperProps) {
  return (
    <Accordion type="single" collapsible className="max-w-lg">
      <AccordionItem value={item.value}>
        <AccordionTrigger className="md:text-base lg:text-lg items-center cursor-pointer hover:no-underline">
          {item.title}
        </AccordionTrigger>
        <AccordionContent>
          <Typography
            size="mini"
            className="md:text-sm lg:text-base text-muted-foreground font-light"
          >
            {item.content}
          </Typography>
        </AccordionContent>
      </AccordionItem>
      {separator && <Separator className="w-full" />}
    </Accordion>
  );
}
