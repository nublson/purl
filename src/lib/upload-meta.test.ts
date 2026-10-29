import { describe, expect, it } from "vitest";
import { linkSecondLine, uploadMeta } from "./upload-meta";

const base = { upload: true, contentType: "IMAGE", duration: null, domain: "purl.live" } as const;

describe("uploadMeta", () => {
  it("names the kind, with the length when there is one", () => {
    expect(uploadMeta(base)).toBe("Image");
    expect(uploadMeta({ ...base, contentType: "VIDEO", duration: 14 })).toBe("Video · 0:14");
    expect(uploadMeta({ ...base, contentType: "AUDIO", duration: 65 })).toBe("Audio · 1:05");
  });

  it("is null for a link, whatever its kind", () => {
    expect(uploadMeta({ ...base, upload: false })).toBeNull();
    expect(uploadMeta({ ...base, upload: false, contentType: "VIDEO", duration: 14 })).toBeNull();
  });
});

describe("linkSecondLine", () => {
  it("shows the upload's facts, else the link's domain", () => {
    expect(linkSecondLine({ ...base, contentType: "AUDIO", duration: 3 })).toBe("Audio · 0:03");
    expect(linkSecondLine({ ...base, upload: false, domain: "www.example.com" })).toBe("example.com");
  });
});
