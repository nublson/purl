import { describe, expect, it } from "vitest";
import type { Link, ReaderViewState } from "@/utils/links";
import {
  linkOpensReader,
  qualifiesForReader,
  readerStateMessage,
  readerViewPath,
} from "./reader-view";

const ready: ReaderViewState = {
  status: "READY",
  reason: null,
  fetchedAt: "2026-10-31T10:00:00.000Z",
};
function make(over: Partial<Link> = {}): Link {
  return {
    id: "l1",
    contentType: "WEB",
    upload: false,
    embed: false,
    readerView: ready,
    ...over,
  } as Link;
}
const state = (
  status: ReaderViewState["status"],
  reason: string | null = null,
): ReaderViewState => ({ status, reason, fetchedAt: null }) as ReaderViewState;

describe("linkOpensReader", () => {
  it("is true for a ready, non-upload, non-embed web page", () => {
    expect(linkOpensReader(make())).toBe(true);
  });
  it("is false for embed, upload and other content types", () => {
    expect(linkOpensReader(make({ embed: true }))).toBe(false);
    expect(linkOpensReader(make({ upload: true }))).toBe(false);
    for (const contentType of ["PDF", "YOUTUBE", "IMAGE", "VIDEO", "AUDIO"]) {
      expect(
        linkOpensReader(make({ contentType } as Partial<Link>)),
      ).toBe(false);
    }
  });
  it("is false unless READY", () => {
    for (const s of ["PENDING", "NONE", "FAILED"] as const) {
      expect(linkOpensReader(make({ readerView: state(s) }))).toBe(false);
    }
    expect(linkOpensReader(make({ readerView: null }))).toBe(false);
  });
});

describe("qualifiesForReader", () => {
  it("is true only for non-upload WEB", () => {
    expect(qualifiesForReader({ contentType: "WEB", upload: false })).toBe(true);
    expect(qualifiesForReader({ contentType: "WEB", upload: true })).toBe(false);
    expect(qualifiesForReader({ contentType: "PDF", upload: false })).toBe(false);
  });
});

it("readerViewPath", () => {
  expect(readerViewPath("abc")).toBe("/read/abc");
});

describe("readerStateMessage", () => {
  it("ready", () => {
    expect(readerStateMessage(ready, { short: true })).toBe(
      "Reader view ready · from Oct 31",
    );
  });
  it("pending", () => {
    expect(readerStateMessage(null, { short: true })).toBe(
      "Making the reader view…",
    );
    expect(readerStateMessage(state("PENDING"), { short: true })).toBe(
      "Making the reader view…",
    );
    expect(readerStateMessage(null, { short: false })).toBe(
      "Purl is making the reader view. It takes a minute or two.",
    );
  });
  it("none", () => {
    expect(readerStateMessage(state("NONE", "no_article"))).toBe(
      "No article to read on this page.",
    );
    expect(readerStateMessage(state("NONE", "not_html"))).toBe(
      "This page isn't a web page.",
    );
  });
  it("failed", () => {
    expect(readerStateMessage(state("FAILED", "unreachable"))).toBe(
      "Couldn't make a reader view: the page didn't answer.",
    );
    expect(readerStateMessage(state("FAILED", "timeout"))).toBe(
      "Couldn't make a reader view: it took too long.",
    );
    expect(readerStateMessage(state("FAILED", "too_large"))).toBe(
      "Couldn't make a reader view: the page is too large.",
    );
    expect(readerStateMessage(state("FAILED", "weird"))).toBe(
      "Couldn't make a reader view: the page didn't answer.",
    );
  });
});
