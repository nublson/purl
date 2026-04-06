import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import Image from "next/image";
import { Button } from "../ui/button";

export const ChatEmpty = () => {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Image src="/logo.svg" alt="Purl" width={60} height={60} priority />
        </EmptyMedia>
        <EmptyDescription>
          Purl AI’s let you as anything about your links.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="xs" variant="outline">
          Recap everything I read this week
        </Button>
        <Button size="xs" variant="outline">
          Analyze my reading habits this month
        </Button>
      </EmptyContent>
    </Empty>
  );
};
