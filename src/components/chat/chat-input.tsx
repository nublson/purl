import { ArrowUp, AtSign } from "lucide-react";
import { Button } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../ui/input-group";

export default function ChatInput() {
  return (
    <div className="w-full p-4">
      <InputGroup className="w-full dark:bg-input/30">
        <InputGroupTextarea
          placeholder="Enter your message"
          className="min-h-8 max-h-24"
        />
        <InputGroupAddon align="block-end" className="justify-between gap-2">
          <div>
            <Button
              size="icon-xs"
              variant="outline"
              className="cursor-pointer rounded-full"
            >
              <AtSign />
            </Button>
          </div>

          <Button
            size="icon-sm"
            variant="default"
            className="cursor-pointer rounded-full"
          >
            <ArrowUp />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
