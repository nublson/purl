import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "./folder-client";
import type { FolderSummary } from "./folders";
import { applyFolderOrder, byPosition, saveFolderOrder } from "./folder-order";

function folder(id: string, name: string, position: number): FolderSummary {
  return {
    id,
    name,
    slug: id,
    emoji: "🦪",
    description: null,
    isPublic: false,
    position,
    linkCount: 0,
  };
}

const a = folder("a", "Alpha", 1);
const b = folder("b", "Beta", 2);
const c = folder("c", "Gamma", 3);

describe("byPosition", () => {
  it("sorts by position", () => {
    expect([c, a, b].sort(byPosition).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by name, case-insensitively", () => {
    const gamma = folder("g", "Gamma", 0);
    const beta = folder("bb", "beta", 0);
    expect([gamma, beta].sort(byPosition).map((f) => f.name)).toEqual([
      "beta",
      "Gamma",
    ]);
  });
});

describe("applyFolderOrder", () => {
  it("returns the folders in id order with positions 1..n", () => {
    const result = applyFolderOrder([a, b, c], ["c", "a", "b"]);
    expect(result.map((f) => [f.id, f.position])).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 3],
    ]);
  });
});

describe("saveFolderOrder", () => {
  type Put = (ids: string[]) => Promise<ActionResult<{ folders: FolderSummary[] }>>;

  function deps(put: Put) {
    return {
      previous: [a, b, c],
      setFolders: vi.fn(),
      put,
      refresh: vi.fn(),
      notify: vi.fn(),
    };
  }

  it("marks a local mutation before sending", async () => {
    let resolvePut!: (value: unknown) => void;
    const d = deps(vi.fn<Put>(() => new Promise((r) => (resolvePut = r as never))));

    const pending = saveFolderOrder(["c", "a", "b"], d);

    expect(d.setFolders).toHaveBeenCalledTimes(1);
    expect(d.setFolders.mock.calls[0][0].map((f: FolderSummary) => f.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    resolvePut({ ok: true, data: { folders: [c, a, b] } });
    await pending;
  });

  it("adopts the server's folders", async () => {
    const server = [folder("c", "Gamma", 1), folder("a", "Alpha", 2), folder("b", "Beta", 3)];
    const d = deps(vi.fn<Put>().mockResolvedValue({ ok: true, data: { folders: server } }));

    const result = await saveFolderOrder(["c", "a", "b"], d);

    expect(d.put).toHaveBeenCalledWith(["c", "a", "b"]);
    expect(d.setFolders).toHaveBeenLastCalledWith(server);
    expect(result).toEqual({ ok: true, data: server });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("rolls back and toasts on failure", async () => {
    const d = deps(vi.fn<Put>().mockResolvedValue({ ok: false, error: "x" }));

    const result = await saveFolderOrder(["c", "a", "b"], d);

    expect(d.setFolders).toHaveBeenLastCalledWith([a, b, c]);
    expect(d.notify).toHaveBeenCalledWith("Couldn't save folder order");
    expect(d.refresh).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("refreshes on INVALID_ORDER", async () => {
    const d = deps(
      vi.fn<Put>().mockResolvedValue({ ok: false, code: "INVALID_ORDER", error: "x" }),
    );

    await saveFolderOrder(["c", "a", "b"], d);

    expect(d.setFolders).toHaveBeenLastCalledWith([a, b, c]);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledWith(
      "Your folders changed elsewhere. Try again.",
    );
  });
});
