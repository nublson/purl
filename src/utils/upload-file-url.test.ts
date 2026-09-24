import { describe, expect, it } from "vitest";
import { isUploadFilePath, uploadFilePath } from "./upload-file-url";

describe("uploadFilePath", () => {
  it("builds the stable authenticated file route for a link id", () => {
    expect(uploadFilePath("clxyz123")).toBe("/api/links/clxyz123/file");
  });

  it("encodes unexpected characters in the id", () => {
    expect(uploadFilePath("a/b")).toBe("/api/links/a%2Fb/file");
  });
});

describe("isUploadFilePath", () => {
  it("recognizes the relative file route", () => {
    expect(isUploadFilePath("/api/links/clxyz123/file")).toBe(true);
  });

  it.each([
    "https://example.com/api/links/x/file",
    "/api/links/x/file?download=1",
    "/api/links/x",
    "/api/links//file",
    "https://project.supabase.co/storage/v1/object/sign/user-uploads/a.pdf",
  ])("rejects %s", (url) => {
    expect(isUploadFilePath(url)).toBe(false);
  });
});
