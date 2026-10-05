import { describe, expect, it } from "vitest";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "./cdn-cache";

const request = new Request("https://purl.live/.well-known/oauth-protected-resource");

describe("withCdnCache", () => {
  it("adds the CDN Cache-Control and keeps the handler's headers and body", async () => {
    const handler = withCdnCache(
      () =>
        new Response(JSON.stringify({ resource: "https://purl.live" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
      DISCOVERY_CACHE_CONTROL,
    );
    const res = await handler(request);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ resource: "https://purl.live" });
  });

  it("leaves errors uncached", async () => {
    const handler = withCdnCache(
      async () => new Response("boom", { status: 500 }),
      DISCOVERY_CACHE_CONTROL,
    );
    const res = await handler(request);
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});
