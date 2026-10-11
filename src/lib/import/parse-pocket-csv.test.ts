import { describe, expect, it } from "vitest";
import { parsePocketCsv } from "./parse-pocket-csv";

const HEADER = "title,url,time_added,tags,status";

describe("parsePocketCsv", () => {
  it("reads title, url and time_added in seconds", () => {
    const csv = [HEADER, "Example,https://example.com/a,1700000000,tag,unread"].join("\n");
    expect(parsePocketCsv(csv)).toEqual([
      {
        url: "https://example.com/a",
        title: "Example",
        folder: null,
        createdAt: new Date(1700000000000),
      },
    ]);
  });

  it.each(["", "0", "-5", "abc"])("nulls time_added %j", (value) => {
    const csv = [HEADER, `A,https://example.com/a,${value},,unread`].join("\n");
    expect(parsePocketCsv(csv)[0].createdAt).toBeNull();
  });

  it("skips rows without a url and tolerates a BOM", () => {
    const csv = "﻿" + [HEADER, "A,,1700000000,,unread", "B,https://example.com/b,1700000000,,unread"].join("\n");
    expect(parsePocketCsv(csv).map((i) => i.title)).toEqual(["B"]);
  });
});
