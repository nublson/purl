import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { suggestions } from "@/data/chat-empty-suggestions.json" with {
  type: "json",
};
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
        {suggestions.map((text) => (
          <Button
            key={text}
            size="xs"
            variant="outline"
            onClick={() => onSuggestion(text)}
          >
            {text}
          </Button>
        ))}
      </EmptyContent>
    </Empty>
  );
};
