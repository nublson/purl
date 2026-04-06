import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import Image from "next/image";
import { Button } from "../ui/button";

interface ChatEmptyProps {
  onSuggestion: (text: string) => void;
}

export const ChatEmpty = ({ onSuggestion }: ChatEmptyProps) => {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Image src="/logo.svg" alt="Purl" width={60} height={60} priority />
        </EmptyMedia>
        <EmptyDescription>
          Purl AI lets you ask anything about your links.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size="xs"
          variant="outline"
          onClick={() => onSuggestion("Recap everything I read this week")}
        >
          Recap everything I read this week
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            onSuggestion("Analyze my reading habits this month")
          }
        >
          Analyze my reading habits this month
        </Button>
      </EmptyContent>
    </Empty>
  );
};
