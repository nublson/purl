import { describe, expect, it, vi } from "vitest";

// Production sets BETTER_AUTH_URL; set it before the auth module loads.
const { CONFIGURED_ORIGIN } = vi.hoisted(() => {
  const CONFIGURED_ORIGIN = "https://purl.live";
  process.env.BETTER_AUTH_URL = CONFIGURED_ORIGIN;
  return { CONFIGURED_ORIGIN };
});

import { GET as authorizationServer } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as protectedResource } from "@/app/.well-known/oauth-protected-resource/route";
import { DISCOVERY_CACHE_CONTROL } from "@/lib/cdn-cache";

// The CDN caches these routes, which is only safe because their metadata
// doesn't depend on the request: Better Auth builds it from the configured
// baseURL, so every domain and caller gets the same document.
const hosts = ["https://purl.live", "https://purl.nublson.com", "https://evil.example"];

describe("OAuth discovery routes", () => {
  it.each([
    ["oauth-authorization-server", authorizationServer],
    ["oauth-protected-resource", protectedResource],
  ] as const)("%s: the same metadata for every host, CDN-cached", async (path, GET) => {
    const bodies = [];
    for (const host of hosts) {
      const res = await GET(new Request(`${host}/.well-known/${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(DISCOVERY_CACHE_CONTROL);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      bodies.push(await res.json());
    }
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    // ...and it names the configured origin, never the request's host.
    const json = JSON.stringify(bodies[0]);
    expect(json).toContain(CONFIGURED_ORIGIN);
    expect(json).not.toContain("evil.example");
  });
});
