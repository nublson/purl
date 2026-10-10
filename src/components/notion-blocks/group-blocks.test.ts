import { describe, expect, it } from "vitest";
import { groupBlocks } from "./group-blocks";
import { block } from "./test-utils";

describe("groupBlocks", () => {
  it("groups consecutive list items and ends a run on any other block", () => {
    const groups = groupBlocks([
      block("bulleted_list_item"),
      block("bulleted_list_item"),
      block("paragraph"),
      block("numbered_list_item"),
      block("numbered_list_item"),
      block("bulleted_list_item"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual([
      "bulleted",
      "block",
      "numbered",
      "bulleted",
    ]);
    expect(groups.map((g) => ("items" in g ? g.items.length : -1))).toEqual([
      2, -1, 2, 1,
    ]);
  });

  it("groups to-dos and handles empty input", () => {
    const groups = groupBlocks([block("to_do"), block("to_do")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("todo");
    expect(groupBlocks([])).toEqual([]);
  });
});
