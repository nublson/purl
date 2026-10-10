import { describe, expect, it } from "vitest";
import { describeAccess } from "./oauth-scopes";

describe("describeAccess", () => {
  it("always lists what the MCP server can do with the account", () => {
    const items = describeAccess([]);
    expect(items).toEqual([
      "See your saved links and folders",
      "Save links and move them between folders",
      "Manage folders, including deleting them and the links inside",
    ]);
  });

  it("turns the identity scopes into one line", () => {
    const items = describeAccess(["openid", "profile", "email"]);
    expect(items.filter((i) => i === "Know your name and email")).toHaveLength(1);
  });

  it("explains offline_access as staying connected", () => {
    expect(describeAccess(["offline_access"])).toContain(
      "Stay connected until you disconnect it",
    );
  });

  it("shows a scope it doesn't know by name instead of hiding it", () => {
    expect(describeAccess(["openid", "admin"])).toContain(
      "Use the “admin” permission",
    );
  });

  it("ignores repeated scopes", () => {
    const items = describeAccess(["admin", "admin", "openid", "email"]);
    expect(items.filter((i) => i.includes("admin"))).toHaveLength(1);
    expect(new Set(items).size).toBe(items.length);
  });
});
