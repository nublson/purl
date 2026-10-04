import { describe, expect, it } from "vitest";
import {
  groupByPreviousFolder,
  isBulkReadBody,
  parseBulkDeleteBody,
  parseBulkMoveBody,
  parseBulkReadBody,
  parseLinkIds,
} from "./bulk-links";
import { MAX_BULK_LINK_IDS } from "./limits";

describe("parseLinkIds", () => {
  it("accepts link ids and drops duplicates, keeping the first order", () => {
    expect(parseLinkIds(["b", "a", "b"])).toEqual({ ok: true, ids: ["b", "a"] });
  });

  it.each([
    ["missing", undefined],
    ["not an array", "a"],
    ["empty", []],
    ["a non-string id", ["a", 1]],
    ["an empty id", ["a", ""]],
  ])("rejects %s with INVALID_IDS", (_label, value) => {
    expect(parseLinkIds(value)).toMatchObject({ ok: false, code: "INVALID_IDS" });
  });

  it("caps the number of distinct ids", () => {
    const ids = Array.from({ length: MAX_BULK_LINK_IDS + 1 }, (_, i) => `l${i}`);
    expect(parseLinkIds(ids)).toMatchObject({ ok: false, code: "TOO_MANY_IDS" });
    // Duplicates don't count toward the cap.
    expect(parseLinkIds([...ids.slice(1), "l1"])).toMatchObject({ ok: true });
  });
});

describe("parseBulkMoveBody", () => {
  it("accepts a folder id, or null to take the links out of their folders", () => {
    expect(parseBulkMoveBody({ ids: ["a"], folderId: "f1" })).toEqual({
      ok: true,
      ids: ["a"],
      folderId: "f1",
    });
    expect(parseBulkMoveBody({ ids: ["a"], folderId: null })).toEqual({
      ok: true,
      ids: ["a"],
      folderId: null,
    });
  });

  it.each([
    ["missing", { ids: ["a"] }],
    ["empty", { ids: ["a"], folderId: "" }],
    ["a number", { ids: ["a"], folderId: 3 }],
  ])("rejects a folderId that is %s", (_label, body) => {
    expect(parseBulkMoveBody(body)).toMatchObject({ ok: false, code: "INVALID_FOLDER" });
  });

  it("checks ids first, and treats a non-object body as missing ids", () => {
    expect(parseBulkMoveBody({ folderId: "f1" })).toMatchObject({ code: "INVALID_IDS" });
    expect(parseBulkMoveBody(null)).toMatchObject({ code: "INVALID_IDS" });
  });
});

describe("parseBulkDeleteBody", () => {
  it("accepts ids and rejects anything else", () => {
    expect(parseBulkDeleteBody({ ids: ["a", "a"] })).toEqual({ ok: true, ids: ["a"] });
    expect(parseBulkDeleteBody([])).toMatchObject({ ok: false, code: "INVALID_IDS" });
  });
});

describe("parseBulkReadBody", () => {
  it("accepts read true or false", () => {
    expect(parseBulkReadBody({ ids: ["a"], read: true })).toEqual({
      ok: true,
      ids: ["a"],
      read: true,
    });
    expect(parseBulkReadBody({ ids: ["a"], read: false })).toMatchObject({
      ok: true,
      read: false,
    });
  });

  it("rejects a non-boolean read, or read combined with a move", () => {
    expect(parseBulkReadBody({ ids: ["a"], read: "yes" })).toMatchObject({
      ok: false,
      code: "INVALID_READ",
    });
    expect(
      parseBulkReadBody({ ids: ["a"], read: true, folderId: null }),
    ).toMatchObject({ ok: false, code: "INVALID_READ" });
    expect(parseBulkReadBody({ ids: [], read: true })).toMatchObject({
      ok: false,
      code: "INVALID_IDS",
    });
  });

  it("is chosen by the presence of read", () => {
    expect(isBulkReadBody({ ids: ["a"], read: true })).toBe(true);
    expect(isBulkReadBody({ ids: ["a"], folderId: null })).toBe(false);
    expect(isBulkReadBody(null)).toBe(false);
  });
});

describe("groupByPreviousFolder", () => {
  it("groups moved links by the folder they came from, null for none", () => {
    const groups = groupByPreviousFolder([
      { id: "a", previousFolderId: "f1" },
      { id: "b", previousFolderId: null },
      { id: "c", previousFolderId: "f1" },
    ]);
    expect(Array.from(groups)).toEqual([
      ["f1", ["a", "c"]],
      [null, ["b"]],
    ]);
  });
});
