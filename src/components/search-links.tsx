import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Link } from "@/utils/links";
import { Search } from "lucide-react";
import { LinkItem } from "./link-item";
import { Button } from "./ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";
import { ItemGroup } from "./ui/item";
import { Separator } from "./ui/separator";

const MOCK_SEARCH_LINKS: Link[] = [
  {
    id: "mock-search-1",
    favicon: "https://www.google.com/s2/favicons?domain=openai.com&sz=64",
    title: "General AI career notes",
    description: "Notes on roles and interview prep",
    thumbnail: null,
    url: "https://openai.com",
    domain: "openai.com",
    contentType: "WEB",
    createdAt: new Date("2026-04-01"),
  },
  {
    id: "mock-search-2",
    favicon: "https://www.google.com/s2/favicons?domain=zillow.com&sz=64",
    title: "Apartment listings — downtown",
    description: null,
    thumbnail: null,
    url: "https://www.zillow.com",
    domain: "zillow.com",
    contentType: "WEB",
    createdAt: new Date("2026-03-30"),
  },
  {
    id: "mock-search-3",
    favicon: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
    title: "CV — latest",
    description: "Working copy",
    thumbnail: null,
    url: "https://www.notion.so",
    domain: "notion.so",
    contentType: "WEB",
    createdAt: new Date("2026-03-28"),
  },
  {
    id: "mock-search-4",
    favicon: "https://www.google.com/s2/favicons?domain=docs.google.com&sz=64",
    title: "Resume — one-pager.pdf",
    description: null,
    thumbnail: null,
    url: "https://example.com/resume.pdf",
    domain: "example.com",
    contentType: "PDF",
    createdAt: new Date("2026-03-20"),
  },
  {
    id: "mock-search-5",
    favicon: "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",
    title: "System design interview walkthrough",
    description: null,
    thumbnail: null,
    url: "https://www.youtube.com/watch?v=Tn6-2uihKlQ",
    domain: "youtube.com",
    contentType: "YOUTUBE",
    createdAt: new Date("2026-03-15"),
  },
  {
    id: "mock-search-6",
    favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    title: "Focus music playlist",
    description: null,
    thumbnail: null,
    url: "https://example.com/focus.mp3",
    domain: "example.com",
    contentType: "AUDIO",
    createdAt: new Date("2026-02-10"),
  },
];

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
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search links</DialogTitle>
        <DialogHeader className="p-0 gap-0">
          <InputGroup className="h-10 rounded-t-xl rounded-b-none border-none bg-transparent shadow-none dark:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-none has-[[data-slot=input-group-control]:focus-visible]:shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            <InputGroupInput
              placeholder="Search links..."
              className="h-full bg-transparent focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <InputGroupAddon>
              <Search className="size-4 shrink-0 opacity-50" />
            </InputGroupAddon>
          </InputGroup>
          <Separator />
        </DialogHeader>
        <div className="flex-1 max-h-96 overflow-y-auto p-1.5">
          <ItemGroup className="w-full gap-0">
            {MOCK_SEARCH_LINKS.map((link) => (
              <LinkItem key={link.id} link={link} />
            ))}
          </ItemGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
