import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

export default function SearchLinks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground"
        >
          <Search />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 h-[430px]" showCloseButton={false}>
        <DialogHeader className="p-0">
          <InputGroup className="h-10 rounded-t-xl rounded-b-none bg-transparent border-none shadow-none">
            <InputGroupInput placeholder="Search links..." className="h-full" />
            <InputGroupAddon>
              <Search className="size-4 shrink-0 opacity-50" />
            </InputGroupAddon>
          </InputGroup>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
