import { ArrowUp } from "lucide-react";
import { Button } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../ui/input-group";

export default function ChatInput() {
  return (
    <div className="w-full p-4">
      <InputGroup className="w-full dark:bg-input/30 items-end">
        {/* //! Mentioned links here */}
        {/* <InputGroupAddon
          align="block-start"
          className="flex items-center justify-start no-scrollbar gap-1 overflow-x-auto overflow-y-hidden"
        >
          <ChatMention key={link.id} link={link} />
        </InputGroupAddon> */}
        <InputGroupTextarea
          placeholder="Enter your message"
          className="min-h-11 max-h-24 no-scrollbar"
        />
        <InputGroupAddon align="inline-end" className="justify-end gap-2">
          <div className="shrink-0">
            <Button
              size="icon-sm"
              variant="default"
              className="cursor-pointer rounded-full"
            >
              <ArrowUp />
            </Button>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
