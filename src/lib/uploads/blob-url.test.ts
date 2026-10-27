import { describe, expect, it } from "vitest";
import {
  BLOB_HOST_SUFFIX,
  blobPathnameOf,
  isBlobUrl,
  isOwnBlobPathname,
} from "./blob-url";

describe("isBlobUrl", () => {
  it("accepts https URLs on the blob host", () => {
    expect(BLOB_HOST_SUFFIX).toBe(".public.blob.vercel-storage.com");
    expect(
      isBlobUrl("https://abc.public.blob.vercel-storage.com/users/u1/a.png"),
    ).toBe(true);
  });

  it("rejects other hosts, lookalikes, http and garbage", () => {
    expect(isBlobUrl("https://example.com/a.png")).toBe(false);
    expect(
      isBlobUrl("https://public.blob.vercel-storage.com.evil.com/a.png"),
    ).toBe(false);
    expect(isBlobUrl("https://evilpublic.blob.vercel-storage.com/a.png")).toBe(
      false,
    );
    expect(isBlobUrl("https://public.blob.vercel-storage.com/a.png")).toBe(
      false,
    );
    expect(
      isBlobUrl("http://abc.public.blob.vercel-storage.com/a.png"),
    ).toBe(false);
    expect(isBlobUrl("not a url")).toBe(false);
    expect(isBlobUrl("")).toBe(false);
  });
});

describe("blobPathnameOf", () => {
  it("returns the decoded path without the leading slash", () => {
    expect(
      blobPathnameOf(
        "https://abc.public.blob.vercel-storage.com/users/u1/c1/a-x1.png",
      ),
    ).toBe("users/u1/c1/a-x1.png");
    expect(
      blobPathnameOf(
        "https://abc.public.blob.vercel-storage.com/users/u1/c1/my%20file.png?x=1",
      ),
    ).toBe("users/u1/c1/my file.png");
  });

  it("returns null for non-blob URLs", () => {
    expect(blobPathnameOf("https://example.com/users/u1/a.png")).toBeNull();
    expect(blobPathnameOf("nope")).toBeNull();
  });

  it("returns null for a malformed percent-escape", () => {
    expect(
      blobPathnameOf("https://abc.public.blob.vercel-storage.com/users/%E0%A4%A"),
    ).toBeNull();
  });
});

describe("isOwnBlobPathname", () => {
  it("accepts a path under the user's prefix", () => {
    expect(isOwnBlobPathname("users/u1/c1/a.png", "u1")).toBe(true);
  });

  it("rejects traversal", () => {
    expect(isOwnBlobPathname("users/u1/../u2/a.png", "u1")).toBe(false);
    expect(isOwnBlobPathname("users/u1/c1/..", "u1")).toBe(false);
  });

  it("rejects a user id that is a prefix of another", () => {
    expect(isOwnBlobPathname("users/u10/c/a.png", "u1")).toBe(false);
  });

  it("rejects backslashes, leading slashes and the bare prefix", () => {
    expect(isOwnBlobPathname("users/u1/c1\\a.png", "u1")).toBe(false);
    expect(isOwnBlobPathname("/users/u1/c1/a.png", "u1")).toBe(false);
    expect(isOwnBlobPathname("users/u1/", "u1")).toBe(false);
    expect(isOwnBlobPathname("users/u1", "u1")).toBe(false);
  });

  it("rejects other users and empty ids", () => {
    expect(isOwnBlobPathname("users/u2/c1/a.png", "u1")).toBe(false);
    expect(isOwnBlobPathname("users//c1/a.png", "")).toBe(false);
  });
});
