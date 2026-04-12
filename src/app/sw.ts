import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RouteMatchCallbackOptions } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/**
 * Serwist's production defaultCache applies StaleWhileRevalidate to any URL whose
 * pathname matches image extensions — including third-party favicons and OG images.
 * Caching those cross-origin no-cors responses is unreliable and surfaces as
 * `no-response` in the console with broken <img> in the UI. Dev uses NetworkOnly for
 * all routes, which is why this only shows up in production.
 *
 * @see https://github.com/serwist/serwist/blob/main/packages/next/src/index.worker.ts
 */
function isCrossOriginImageLikeRequest({
  request,
  sameOrigin,
  url,
}: RouteMatchCallbackOptions): boolean {
  if (sameOrigin) return false;
  if (request.destination === "image") return true;
  const path = url.pathname;
  if (/\/s2\/favicons\b/i.test(path)) return true;
  return /\.(?:jpg|jpeg|gif|png|svg|ico|webp)(?:$|[?#])/i.test(path);
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: isCrossOriginImageLikeRequest,
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

serwist.addEventListeners();
