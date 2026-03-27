"use client";

import { isAudioUrl } from "@/utils/audio";
import { getUrlDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { isValidUrl } from "@/utils/url";
import { isYouTubeUrl } from "@/utils/youtube";
import { useEffect, useMemo, useState } from "react";
import { LinkGroup } from "./link-group";
import { LinkItemSkeleton } from "./skeletons";

/** Pause after a link is fully shown before starting the next URL (skeleton + fetch). */
const BETWEEN_LINKS_DELAY_MS = 3000;
const BETWEEN_LINKS_DELAY_REDUCED_MS = 1000;
const FAVICON_SIZE = "64";

function faviconForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;
}

function detectContentType(url: string): Link["contentType"] {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  if (isPdfUrl(url)) return "PDF";
  if (isAudioUrl(url)) return "AUDIO";
  return "WEB";
}

function previewTitle(
  url: string,
  domain: string,
  contentType: Link["contentType"],
): string {
  if (contentType === "YOUTUBE") return "YouTube";
  if (contentType === "PDF") {
    try {
      const fileName = new URL(url).pathname.split("/").pop() ?? "";
      const withoutPdf = decodeURIComponent(fileName).replace(/\.pdf$/i, "");
      const normalized = withoutPdf.replace(/[-_]+/g, " ").trim();
      if (normalized) return normalized.slice(0, 500);
    } catch {
      /* fall through */
    }
    return domain;
  }
  return domain;
}

function buildSyntheticLink(url: string): Link {
  const domain = getUrlDomain(url);
  const contentType = detectContentType(url);
  return {
    id: crypto.randomUUID(),
    url,
    title: previewTitle(url, domain, contentType),
    description: null,
    favicon: faviconForDomain(domain),
    thumbnail: null,
    domain,
    contentType,
    createdAt: new Date(),
  };
}

type PreviewMetadata = {
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
};

function buildLinkFromServerMetadata(url: string, meta: PreviewMetadata): Link {
  const domain = getUrlDomain(url);
  const contentType = detectContentType(url);
  return {
    id: crypto.randomUUID(),
    url,
    title: meta.title.replace(/\s+/g, " ").trim().slice(0, 500) || domain,
    description: meta.description,
    favicon: meta.favicon || faviconForDomain(domain),
    thumbnail: meta.thumbnail,
    domain,
    contentType,
    createdAt: new Date(),
  };
}

const PreviewHeader = () => {
  return (
    <div className="flex items-center gap-2">
      <div className="size-3 rounded-full bg-border" />
      <div className="size-3 rounded-full bg-border" />
      <div className="size-3 rounded-full bg-border" />
    </div>
  );
};

interface PreviewAppProps {
  urls?: string[];
  /** Shown immediately; queued `urls` start after {@link BETWEEN_LINKS_DELAY_MS} (first item only). */
  defaultUrls?: Link[];
}

function parseDefaultLinks(links: Link[]): Link[] {
  return links.map((l) => ({
    id: l.id,
    url: l.url,
    title: l.title,
    favicon: l.favicon,
    description: l.description,
    thumbnail: l.thumbnail,
    domain: l.domain,
    contentType: l.contentType,
    createdAt:
      l.createdAt instanceof Date
        ? l.createdAt
        : new Date(String(l.createdAt)),
  }));
}

export default function PreviewApp({
  urls = [],
  defaultUrls = [],
}: PreviewAppProps) {
  const validUrls = useMemo(
    () => urls.map((u) => u.trim()).filter((u) => isValidUrl(u)),
    [urls],
  );

  const parsedDefaults = useMemo(
    () => parseDefaultLinks(defaultUrls),
    [defaultUrls],
  );

  const [betweenLinksDelayMs, setBetweenLinksDelayMs] = useState(
    BETWEEN_LINKS_DELAY_MS,
  );
  const [completedLinks, setCompletedLinks] = useState<Link[]>(parsedDefaults);
  const [queueIndex, setQueueIndex] = useState(0);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setBetweenLinksDelayMs(
        mq.matches ? BETWEEN_LINKS_DELAY_REDUCED_MS : BETWEEN_LINKS_DELAY_MS,
      );
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (validUrls.length === 0) return;
    if (queueIndex >= validUrls.length) return;

    const targetUrl = validUrls[queueIndex];
    const waitBeforeFirstFetch =
      queueIndex === 0 && parsedDefaults.length > 0
        ? betweenLinksDelayMs
        : 0;

    let cancelled = false;
    const timeoutIds: number[] = [];

    const clearTimers = () => {
      for (const id of timeoutIds) clearTimeout(id);
      timeoutIds.length = 0;
    };

    const startFetch = () => {
      if (cancelled) return;
      setPendingUrl(targetUrl);

      void (async () => {
        let link: Link;
        try {
          const res = await fetch(
            `/api/preview-link-metadata?url=${encodeURIComponent(targetUrl)}`,
          );
          if (!res.ok) throw new Error("metadata request failed");
          const meta = (await res.json()) as PreviewMetadata;
          link = buildLinkFromServerMetadata(targetUrl, meta);
        } catch {
          link = buildSyntheticLink(targetUrl);
        }
        if (cancelled) return;
        setCompletedLinks((prev) => [link, ...prev]);
        setPendingUrl(null);
        if (cancelled) return;

        const betweenId = window.setTimeout(() => {
          if (cancelled) return;
          setQueueIndex((i) => i + 1);
        }, betweenLinksDelayMs);
        timeoutIds.push(betweenId);
      })();
    };

    if (waitBeforeFirstFetch > 0) {
      const leadId = window.setTimeout(startFetch, waitBeforeFirstFetch);
      timeoutIds.push(leadId);
    } else {
      startFetch();
    }

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [queueIndex, validUrls, betweenLinksDelayMs, parsedDefaults.length]);

  const isSaving = pendingUrl !== null;

  return (
    <div className="bg-elevated dark:shadow-contrast h-[320px] max-w-2xl w-full translate-y-px overflow-hidden rounded-t-xl border border-[#1F1F1F] flex flex-col items-center justify-start">
      <div className="w-full px-4 py-3 flex items-center justify-between">
        <PreviewHeader />
        <div className="bg-border size-7 rounded-full" />
      </div>

      <div className="w-full flex-1 flex flex-col items-center justify-start px-4 pt-8 overflow-y-auto min-h-0">
        <LinkGroup
          label="Today"
          links={completedLinks}
          preview
          prependItems={
            isSaving && pendingUrl ? (
              <LinkItemSkeleton url={pendingUrl} />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
