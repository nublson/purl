import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse-csv";

describe("parseCsv", () => {
  it("reads a quoted field with a comma", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("reads a quoted field with a line break", () => {
    expect(parseCsv('a,"b\nc"\nd,e')).toEqual([
      ["a", "b\nc"],
      ["d", "e"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"a ""b"""')).toEqual([['a "b"']]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b")).toEqual([["a", "b"]]);
  });

  it("handles CRLF and LF", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("adds no empty row for a trailing newline", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
    expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});
