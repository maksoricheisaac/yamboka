import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { FaqItem } from "@/content/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <Accordion type="single" collapsible className="w-full max-w-3xl">
      {items.map((item, i) => (
        <AccordionItem key={item.q} value={`faq-${i}`}>
          <AccordionTrigger className="py-4 text-left text-base font-semibold">{item.q}</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
