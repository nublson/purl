import { parseShareForm, SHARE_LANDING, SHARE_PATH, stashShare } from "@/lib/share-target";
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RouteMatchCallbackOptions } from "serwist";
import { NetworkOnly, Route, Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/**
 * Third-party assets must bypass Serwist’s runtime strategies.
 *
 * 1. **RegExp routes** — Serwist’s `RegExpRoute` ignores cross-origin URLs unless the
 *    regex matches the *entire* `url.href` (`result.index === 0`). So the default
 *    “image extension” rule usually does *not* run for `https://other/img.png`; those
 *    requests fall through to the generic **cross-origin `NetworkFirst`** rule.
 * 2. **`NetworkFirst` + `ExpirationPlugin`** on opaque / flaky cross-origin responses
 *    often surfaces as **`no-response`** and broken `<img>` / favicons. Dev has no SW
 *    (or Network-only defaults), so this is prod-only.
 *
 * We use **NetworkOnly** for all cross-origin GETs except **Google Fonts** (still
 * handled by the following `defaultCache` entries).
 *
 * @see https://github.com/serwist/serwist/blob/main/packages/serwist/src/RegExpRoute.ts
 */
function isCrossOriginExcludingGoogleFonts({
  sameOrigin,
  url,
}: RouteMatchCallbackOptions): boolean {
  if (sameOrigin) return false;
  const host = url.hostname;
  if (host === "fonts.gstatic.com" || host === "fonts.googleapis.com") {
    return false;
  }
  return true;
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: isCrossOriginExcludingGoogleFonts,
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

/**
 * The Web Share Target (`share_target` in public/manifest.json): another
 * app's share is a multipart POST to /share. Answered here, before the
 * network, so the shared files can be kept for the page: the share goes
 * into the Cache API stash (src/lib/share-target.ts) and the browser to
 * Home, which takes it from there. If the stash can't be written (storage
 * full), the request goes on to the /share route, which hands the links
 * over in a cookie; the files are then reported as not received.
 */
serwist.registerRoute(
  new Route(
    ({ sameOrigin, url }) => sameOrigin && url.pathname === SHARE_PATH,
    async ({ request }) => {
      // A clone, so the request can still go to the network whole.
      const share = parseShareForm(await request.clone().formData());
      try {
        await stashShare(share);
      } catch (error) {
        console.warn("[share] couldn't keep the share, letting the server answer", error);
        return fetch(request);
      }
      return Response.redirect(new URL(SHARE_LANDING, self.location.href), 303);
    },
    "POST",
  ),
);

serwist.addEventListeners();
