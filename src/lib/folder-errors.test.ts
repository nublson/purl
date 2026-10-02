import { describe, expect, it } from "vitest";
import {
  FolderLimitError,
  FolderNameError,
  FolderNotFoundError,
} from "@/lib/folders";
import { mapFolderError } from "./folder-errors";

describe("mapFolderError", () => {
  it("returns null for unrelated errors so callers can rethrow", () => {
    expect(mapFolderError(new Error("boom"))).toBeNull();
    expect(mapFolderError("not an error")).toBeNull();
  });

  it.each([
    ["empty", 400, "NAME_EMPTY", "Give your folder a name."],
    ["too_long", 400, "NAME_TOO_LONG", "Keep it under 60 characters."],
    ["taken", 409, "NAME_TAKEN", "You already have a folder with that name."],
  ] as const)(
    "maps FolderNameError(%s) to %i %s",
    async (reason, status, code, message) => {
      const res = mapFolderError(new FolderNameError(reason, message));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(status);
      expect(await res!.json()).toEqual({ error: message, code });
    },
  );

  it("maps FolderLimitError to 403 LIMIT_REACHED with feature", async () => {
    const res = mapFolderError(
      new FolderLimitError("You can have up to 100 folders."),
    );
    expect(res!.status).toBe(403);
    expect(await res!.json()).toEqual({
      error: "You can have up to 100 folders.",
      code: "LIMIT_REACHED",
      feature: "FOLDER_LIMIT",
    });
  });

  it("maps FolderNotFoundError to 404", async () => {
    const res = mapFolderError(new FolderNotFoundError());
    expect(res!.status).toBe(404);
    expect(await res!.json()).toEqual({ error: "Folder not found" });
  });
});
