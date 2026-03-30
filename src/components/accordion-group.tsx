import { AccordionItem, AccordionWrapper } from "./accordion-wrapper";

interface AccordionGroupProps {
  items: AccordionItem[];
}

export function AccordionGroup({ items }: AccordionGroupProps) {
  return (
    <div className="w-full flex flex-col items-center justify-start gap-0">
      {items.map((item, index: number) => (
        <AccordionWrapper
          key={item.value}
          item={item}
          separator={index !== items.length - 1}
        />
      ))}
    </div>
  );
}
