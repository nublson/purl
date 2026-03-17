import { LinkGroup } from "@/components/link-group";
import { Link, groupLinksByDate } from "@/utils/links";

const links: Link[] = [
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
    createdAt: new Date("2026-03-16"),
  },
  {
    favicon: "https://omou.app/img/stamp_05.png",
    title: "Omou",
    url: "https://omou.app/",
    createdAt: new Date("2026-03-9"),
  },
  {
    favicon: "https://nublson.com/favicon.ico",
    title: "nublson's portfolio",
    url: "https://nublson.com/",
    createdAt: new Date("2026-02-20"),
  },
  {
    favicon: "https://www.shiori.sh/favicon.ico",
    title: "Shiori",
    url: "https://www.shiori.sh/home",
    createdAt: new Date("2026-02-13"),
  },
  {
    favicon: "https://supabase.com/favicon/favicon.ico",
    title: "Supabase Tables",
    url: "https://supabase.com/dashboard/project/foynzyiyokvetdenjvxd/database/tables",
    createdAt: new Date("2026-01-20"),
  },
  {
    favicon: "https://nextjs.org/favicon.ico",
    title: "Next.js Documentation",
    url: "https://nextjs.org/docs",
    createdAt: new Date("2025-10-22"),
  },
  {
    favicon: "https://x.com/favicon.ico",
    title: "Brian Lovin's Twitter",
    url: "https://x.com/brian_lovin/status/2025769103735271758",
    createdAt: new Date("2024-10-22"),
  },
];

export default async function Home() {
  const groups = groupLinksByDate(links);
  return (
    <div className="wrapper flex flex-col items-center justify-start gap-8">
      {groups.map((group) => (
        <LinkGroup key={group.label} label={group.label} links={group.links} />
      ))}
    </div>
  );
}
