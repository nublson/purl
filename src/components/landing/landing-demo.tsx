"use client";

import { FolderSelectDropdown } from "@/components/folder-select-dropdown";
import { FolderSharePopover } from "@/components/folder-share-popover";
import { LinkGrid } from "@/components/link-group";
import { LinkItem } from "@/components/link-item";
import { Logo } from "@/components/logo";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { User } from "@/components/user";
import { useLinkView } from "@/contexts/link-view-context";
import { useCurrentFolder } from "@/hooks/use-folders";
import { DEMO_GRID_COLUMNS, DEMO_GRID_FRAME } from "@/lib/link-view";
import { toDemoLinks, type DemoData } from "@/lib/demo-links";
import { groupLinksByDate } from "@/utils/links";
import { Box } from "reicon-react";
import { useMemo, type CSSProperties } from "react";
import { ProductFrame } from "./product-preview";

/** Server and browser must group days the same way, so both use UTC. */
const DEMO_TIME_ZONE = "UTC";

/** Rows that take part in the first-visit arrival (see globals.css). */
const ARRIVING_ROWS = 6;

/**
 * The landing page's live demo: the product frame holding the app's own
 * header controls (folder menu, share, account menu; no "+" menu) and the
 * current folder's links by day, in the list or grid view. Read-only: no
 * selection bar, search field or save flow is mounted. Rendered inside
 * `DemoProvider`. `now` is fixed by the server so "Today" and "Yesterday"
 * match between the cached HTML and hydration.
 */
export function LandingDemo({
  data,
  now,
  className,
}: {
  data: DemoData;
  now: string;
  className?: string;
}) {
  const folder = useCurrentFolder();
  const { view } = useLinkView();

  const links = useMemo(() => {
    const source = data.folders.find((f) => f.id === folder?.id);
    return source ? toDemoLinks(source) : [];
  }, [data.folders, folder?.id]);

  const groups = useMemo(
    () =>
      groupLinksByDate(links, {
        now: new Date(now),
        timeZone: DEMO_TIME_ZONE,
      }),
    [links, now],
  );

  return (
    <ProductFrame
      label="Live demo"
      className={className}
      header={
        // The app header's row (header.tsx): same padding and gaps, no
        // border; the list below starts under it like on a folder page.
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0">
              <Logo size={32} />
            </div>
            <Separator
              orientation="vertical"
              className="data-vertical:h-5 data-vertical:self-center"
            />
            <FolderSelectDropdown />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <FolderSharePopover />
            <User />
          </div>
        </div>
      }
    >
      {/* The bottom padding lets the last rows scroll up out of the frame's
          fade, so every link can be read. */}
      <div className="h-[21rem] overflow-y-auto overscroll-contain px-1 pt-2 pb-28 md:h-[24rem] md:px-2 md:pb-32">
        {groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box />
              </EmptyMedia>
              <EmptyTitle>No links in this folder yet</EmptyTitle>
              <EmptyDescription>
                Pick another folder to see what a few saved links look like.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === "grid" ? (
          <div className={DEMO_GRID_FRAME}>
            <LinkGrid
              columns={DEMO_GRID_COLUMNS}
              groups={groups.map(({ label, links }) => ({ label, links }))}
            />
          </div>
        ) : (
          // The app's list column (LinkViewFrame: `wrapper-private`),
          // centered at its max width like a folder page.
          <div className="wrapper-private flex flex-col gap-8">
            {groups.map((group, groupIndex) => {
              const headingId = `demo-group-${groupIndex}`;
              const before = groups
                .slice(0, groupIndex)
                .reduce((sum, g) => sum + g.links.length, 0);
              return (
                // Not a named region: one landmark per day would crowd the
                // page's landmarks; the list is labelled by the heading.
                <section
                  key={group.label}
                  className="flex w-full flex-col items-start justify-start gap-4"
                >
                  <h2
                    id={headingId}
                    className="ms-2 text-xs font-medium text-muted-foreground"
                  >
                    {group.label}
                  </h2>
                  <ItemGroup aria-labelledby={headingId} className="w-full gap-0">
                    {group.links.map((link, index) => {
                      const position = before + index;
                      const arriving = position < ARRIVING_ROWS;
                      return (
                        <div
                          key={link.id}
                          role="listitem"
                          data-landing-row={arriving ? "" : undefined}
                          style={
                            arriving
                              ? ({ "--i": position } as CSSProperties)
                              : undefined
                          }
                        >
                          <LinkItem link={link} eagerFavicon={position < 8} />
                        </div>
                      );
                    })}
                  </ItemGroup>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </ProductFrame>
  );
}
