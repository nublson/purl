import { LinkItem } from "@/components/link-item";
import { ItemGroup } from "@/components/ui/item";

const links = [
  {
    favicon: "https://www.youtube.com/favicon.ico",
    title:
      "How I Live in a Small Home - organising storage, coffee bar and space saving tips",
    url: "https://youtu.be/ZjZYufMLwQY?si=ySxEA-kT44IG_he5",
    createdAt: new Date("2026-03-17"),
  },
  {
    favicon: "https://www.instagram.com/favicon.ico",
    title: "@nublson's Instagram",
    url: "https://www.instagram.com/nublson",
    createdAt: new Date("2026-03-17"),
  },
  {
    favicon: "https://omou.app/img/stamp_05.png",
    title: "Omou",
    url: "https://omou.app/",
    createdAt: new Date("2026-03-17"),
  },
  {
    favicon: "https://nublson.com/favicon.ico",
    title: "nublson's portfolio",
    url: "https://nublson.com/",
    createdAt: new Date("2026-03-17"),
  },
];

export default async function Home() {
  return (
    <div className="wrapper flex flex-col items-center justify-start">
      <ItemGroup className="w-full gap-0">
        {links.map((link) => (
          <LinkItem key={link.url} link={link} />
        ))}
      </ItemGroup>
    </div>
  );
}
