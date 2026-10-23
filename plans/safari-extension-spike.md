# Safari extension spike

2026-10-23. Ran the Chrome MV3 extension (`extension/`) unchanged in Safari on macOS 27.0.1 (Safari 27.0.1, Xcode 27.1) against `pnpm dev` on `localhost:3000`, to learn whether a Safari version needs more than packaging.

**Verdict: it doesn't work as is.** Everything loads and runs except the part that matters: Safari sends **no cookies** with the extension's background `fetch`, so `POST /api/links` is always 401, even while the user is signed in in a tab. That's how Safari treats extension requests, not a SameSite setting Purl could change. Saving needs another way to authenticate (see Decision needed).

## How it was run

1. `npm ci`, then `vite build --mode development` with `VITE_PURL_URL=http://localhost:3000`.
2. `xcrun safari-web-extension-converter extension/dist --app-name Purl --bundle-identifier live.purl.Purl --macos-only --no-open` built an ad-hoc signed app (no Apple signing identity on this Mac). Safari registered its extension (`pluginkit` lists `live.purl.Purl.Extension`), but it never showed up under Settings → Extensions.
3. What worked: **Settings → Developer → Allow unsigned extensions**, then **Add Temporary Extension…** with `extension/dist`. Safari loads the folder directly, without the Xcode app. Both the setting and the temporary extension reset whenever Safari quits.

For day-to-day development, Add Temporary Extension is the loop to use: Reload in Settings → Extensions after each build. The Xcode wrapper only matters for distribution.

## Results

| Dependency | Result |
|---|---|
| MV3 service worker with `"type": "module"` | Loads. The converter warns that `type` isn't supported, but the built `background.js` has no `import`/`export`, so it would load as a classic worker either way. No console errors. |
| `chrome.*` namespace | Works (no `browser.*` rewrite needed). |
| `chrome.action.onClicked` | Works: the toolbar click runs the save. |
| `chrome.scripting.executeScript({ func })` (toast) | Works: the "Log in to Purl…" toasts showed in the page. |
| `chrome.storage.session` | Works: the pending save survived the sign-in. |
| `chrome.tabs.create` / `onUpdated` reaching `/home` / `update` / `remove` | Works: after Google sign-in, the extension saw `/home`, closed the login tab, went back to the page and retried. |
| `chrome.action` badge / title fallback | Not exercised (the toast never failed). |
| **Background `fetch(…, { credentials: "include" })` sending the session cookie** | **Fails.** Every POST from the extension was 401. At the same moment, the page's own `GET /api/links` and `GET /api/folders` were 200 in the signed-in localhost tab. The user saw "Log in to Purl first", the message after a failed retry. |

### Why the 401: no cookies at all, not SameSite

A cookie-echo server on `localhost:3001` set four first-party cookies from a tab: `SameSite=Lax`, `SameSite=None`, `SameSite=None; Secure`, and one with no SameSite. The tab's next request carried all four (and the Better Auth cookies). `fetch("http://localhost:3001/echo", { credentials: "include" })` from the background inspector carried **none of them**, and no `Origin` header. Safari keeps extension background requests out of the browser's cookie jar, so no cookie setting (`SameSite=None`, partitioning, …) would help.

Tested only on `http://localhost`. Since even `SameSite=None; Secure` cookies weren't sent, `https://purl.live` is expected to behave the same; check once when the new auth is built.

## Other findings

- **Host permission with a port is ignored.** `http://localhost:3000/*` never appeared under Settings → Websites → Purl (dev); only `purl.live` did. `http://localhost/*` (no port) was accepted. Chrome matches every port with that pattern too, so `manifestPlugin` in `extension/vite.config.ts` can always write the portless origin for dev builds.
- Host access is granted by the user in Safari (Settings → Websites → the extension, or the prompt on first use). It isn't automatic at install like in Chrome, so first-run copy should say so.
- `Allow unsigned extensions` turns off on every Safari quit. That's expected, and only affects development.

## Decision: how the Safari extension authenticates

**Decided 2026-10-23: option 1, for Chrome and Safari alike,** with one OAuth client per browser (`purl-extension-chrome` "Purl for Chrome", `purl-extension-safari` "Purl for Safari") so Connected apps says where each connection comes from, and signing out of Purl disconnects them. Built on the same branch and verified in Safari (connect, save, sign-out → reconnect).

The cookie route is closed. Options considered:

1. **Save-only OAuth token (recommended).** The extension gets a `links:save` token and saves with `POST /api/v1/links/save` (`Authorization: Bearer`). It already exists for the portfolio: Bearer-only, 201 with the link, same cap and errors. Safari has no `identity.launchWebAuthFlow`, but the extension doesn't need it: the spike showed it can open a Purl tab and watch `tabs.onUpdated` for a URL. So it opens `/api/auth/oauth2/authorize?…` (PKCE S256) in a tab, catches the redirect to a registered `https://purl.live/…` callback (the code is in the URL) before the page acts on it, closes the tab and exchanges the code. Tokens go in `chrome.storage.local`. Server work:
   - register a new public client (e.g. `purl-safari`), save-only like `nublson-com`, in `SAVE_ONLY_CLIENT_IDS`;
   - decide whether signing out revokes it like the portfolio (`revokePortfolioOnSignOut`);
   - a tiny callback page;
   - CORS for the token endpoint from the extension origin, unless the extension's host permission already lets its `fetch` bypass CORS. Check this; the echo test got its body without any CORS header, so probably not needed.

   Trade-offs: no `moved`/folder support (the endpoint saves to Home; the extension doesn't send folders today anyway), and a connect step the Chrome version doesn't have. Chrome could move to the same flow later, so there's one code path.
2. **Have a Purl page make the request.** Inject into, or open, a `purl.live` tab and call `fetch` from there, since that tab is first-party. It opens or needs a Purl tab for every save. Clunky; not recommended.
3. **Native app holds the token.** The containing macOS/iOS app signs in (`ASWebAuthenticationSession`) and passes a token to the extension via native messaging. More Swift code and two apps to keep in step; only worth it if the app has other jobs.

## Changes the Safari build needs (once auth is decided)

- `extension/vite.config.ts` `manifestPlugin`: portless `http://localhost/*` for dev. A Safari target (e.g. `--mode safari`) only if the manifests diverge: with option 1, Safari no longer needs the cookie path, but the manifest itself can stay the same.
- `background.ts`: a `links:save` token path (connect flow, refresh, 401 → reconnect) replacing `startSignIn`'s cookie flow.
- Converter output: keep the generated Xcode project out of the repo until distribution work starts (App Store Connect, Apple Developer Program, signing, a CI job on macOS).

## iOS

Not run (iOS Simulator device support is disabled on this Mac: CoreSimulator is out of date for Xcode 27.1). iOS Safari extensions are the same WebKit engine with the same rules, so expect the same no-cookie behaviour. Option 1 doesn't depend on cookies, so it should carry over. The converter can add the iOS target to the same project (drop `--macos-only`). Untested on iOS: tab-based OAuth, toasts on iOS pages, and how the toolbar action appears (in the extensions menu, not a toolbar button).
