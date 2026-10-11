import { beforeEach, describe, expect, it, vi } from "vitest";
import { batchSummary, saveLinks } from "./save-links";

const { saveLinkMock } = vi.hoisted(() => ({ saveLinkMock: vi.fn() }));

vi.mock("./save-link", () => ({ saveLink: saveLinkMock }));

const folder = { id: "f1", name: "Reading", emoji: "📚" };

describe("saveLinks", () => {
  beforeEach(() => saveLinkMock.mockReset());

  it("saves each URL in order, one at a time, quietly", async () => {
    let running = 0;
    let overlap = false;
    saveLinkMock.mockImplementation(async (url: string) => {
      running += 1;
      if (running > 1) overlap = true;
      await Promise.resolve();
      running -= 1;
      return { id: `id:${url}` };
    });
    const started: [string, { index: number; total: number }][] = [];
    const saved: string[] = [];

    const outcome = await saveLinks(["https://a.com", "https://b.com"], {
      folder,
      onStart: (url, progress) => {
        started.push([url, progress]);
      },
      onSaved: (id, progress) => {
        saved.push(`${id}@${progress.index}/${progress.total}`);
      },
    });

    expect(overlap).toBe(false);
    // Where each link stands, counting from 1, for the "2/8" indicator.
    expect(started).toEqual([
      ["https://a.com", { index: 1, total: 2 }],
      ["https://b.com", { index: 2, total: 2 }],
    ]);
    expect(saved).toEqual(["id:https://a.com@1/2", "id:https://b.com@2/2"]);
    expect(saveLinkMock).toHaveBeenNthCalledWith(1, "https://a.com", {
      folder,
      quiet: true,
    });
    expect(outcome).toEqual({ saved: 2, failed: 0, notAttempted: 0, limit: false });
  });

  it("keeps going after a failure", async () => {
    saveLinkMock
      .mockResolvedValueOnce({ id: "1" })
      .mockResolvedValueOnce({ error: "Boom" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "4" });
    const failed = vi.fn();

    const outcome = await saveLinks(
      ["https://a.com", "https://b.com", "https://c.com", "https://d.com"],
      { onFailed: failed },
    );

    expect(outcome).toEqual({ saved: 2, failed: 2, notAttempted: 0, limit: false });
    expect(failed).toHaveBeenCalledTimes(2);
  });

  it("stops at the save limit and counts the rest as not attempted", async () => {
    saveLinkMock
      .mockResolvedValueOnce({ id: "1" })
      .mockResolvedValueOnce({ error: "Cap", limit: true });

    const outcome = await saveLinks(
      ["https://a.com", "https://b.com", "https://c.com", "https://d.com"],
    );

    expect(saveLinkMock).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ saved: 1, failed: 1, notAttempted: 2, limit: true });
  });
});

describe("batchSummary", () => {
  it("says how many links were saved", () => {
    expect(
      batchSummary({ saved: 8, failed: 0, notAttempted: 0, limit: false }, 0),
    ).toEqual({ tone: "success", message: "Saved 8 links" });
  });

  it("names the folder", () => {
    expect(
      batchSummary({ saved: 3, failed: 0, notAttempted: 0, limit: false }, 0, folder),
    ).toEqual({ tone: "success", message: "Saved 3 links to 📚 Reading" });
  });

  it("reports failures", () => {
    expect(
      batchSummary({ saved: 6, failed: 2, notAttempted: 0, limit: false }, 0),
    ).toEqual({ tone: "warning", message: "Saved 6 of 8 links. 2 couldn’t be saved." });
    expect(
      batchSummary({ saved: 7, failed: 1, notAttempted: 0, limit: false }, 0),
    ).toEqual({ tone: "warning", message: "Saved 7 of 8 links. 1 couldn’t be saved." });
  });

  it("reports the limit, counting links it never tried", () => {
    expect(
      batchSummary({ saved: 3, failed: 1, notAttempted: 4, limit: true }, 0),
    ).toEqual({
      tone: "warning",
      message: "Saved 3 of 8 links. You’ve reached the 1,000-link limit.",
    });
  });

  it("is an error when nothing was saved", () => {
    expect(
      batchSummary({ saved: 0, failed: 3, notAttempted: 0, limit: false }, 0),
    ).toEqual({ tone: "error", message: "Couldn’t save these links. Try again." });
    expect(
      batchSummary({ saved: 0, failed: 1, notAttempted: 4, limit: true }, 0),
    ).toEqual({ tone: "error", message: "You’ve reached the 1,000-link limit." });
  });

  it("mentions pasted text that wasn't a link", () => {
    expect(
      batchSummary({ saved: 2, failed: 0, notAttempted: 0, limit: false }, 3),
    ).toEqual({
      tone: "success",
      message: "Saved 2 links. Skipped 3 pieces of text that weren’t links.",
    });
    expect(
      batchSummary({ saved: 2, failed: 0, notAttempted: 0, limit: false }, 1),
    ).toEqual({
      tone: "success",
      message: "Saved 2 links. Skipped 1 piece of text that wasn’t a link.",
    });
  });
});
