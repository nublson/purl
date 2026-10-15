import { describe, expect, it } from "vitest";
import { describeAccess, SAVE_SCOPE } from "./oauth-scopes";

describe("describeAccess", () => {
  it("always lists what the MCP server can do with the account", () => {
    const items = describeAccess([]);
    expect(items).toEqual([
      "See your saved links and folders",
      "Save links and move them between folders",
      "Delete links, and manage folders, including deleting them",
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

  it("exports the save-only scope name", () => {
    expect(SAVE_SCOPE).toBe("links:save");
  });

  it("describes a save-only grant as just saving links", () => {
    expect(describeAccess(["links:save", "offline_access"])).toEqual([
      "Save links to your library",
      "Stay connected until you disconnect it",
    ]);
  });

  it("keeps identity and drops the full-access lines for links:save", () => {
    const items = describeAccess(["openid", "links:save"]);
    expect(items).toContain("Know your name and email");
    expect(items).toContain("Save links to your library");
    expect(items).not.toContain("See your saved links and folders");
    expect(items).not.toContain("Save links and move them between folders");
    expect(items).not.toContain(
      "Delete links, and manage folders, including deleting them",
    );
  });
});
