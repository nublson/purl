# Safari extension distribution

2026-10-23. Follow-up to [safari-extension-spike.md](safari-extension-spike.md): the extension in `extension/` already runs in Safari unchanged (save-only OAuth token, client `purl-extension-safari`). This covers packaging it as an App Store app for macOS and iOS.

## What's in the repo

- **`extension/safari/Purl/`**: the Xcode wrapper app, generated with
  `xcrun safari-web-extension-converter extension/dist --project-location extension/safari --app-name Purl --bundle-identifier live.purl.Purl --swift --no-open --no-prompt`
  (both platforms, no `--macos-only`). Four targets: `Purl (macOS)`, `Purl Extension (macOS)`, `Purl (iOS)`, `Purl Extension (iOS)`; two schemes, `Purl (macOS)` and `Purl (iOS)`.
  - The extension's resources are **referenced, not copied**: `background.js`, `manifest.json` and the `icons` folder point at `../../../dist/…` (relative), so the app always bundles whatever `extension/dist/` holds. Build it first: `npm run build` in `extension/` for a store build, `npm run dev` (or `VITE_PURL_URL=http://localhost:3000 npx vite build --mode development`) for a local one ("Purl (dev)"). If the build ever emits a new top-level file, add it to both extension targets' Copy Bundle Resources (or re-run the converter with `--rebuild-project`).
  - Bundle ids: app `live.purl.Purl`, extension `live.purl.Purl.Extension`, the same on macOS and iOS, so one App Store Connect record can carry both platforms (universal purchase).
  - Deployment targets as generated: macOS 12, iOS 17 (app) / 15 (extension; the app's 17 is the effective floor). Safari version on macOS is independent of the OS; `chrome.storage.session` needs Safari 16.4+, which iOS 17 always has.
  - No `DEVELOPMENT_TEAM` in the project: set it in Xcode (Signing & Capabilities, all four targets) for local signed builds; CI passes it on the command line. `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` stay at the generated 1.0 / 1; CI overrides them from `manifest.json` and the run number.
  - The containing app is the converter's default: the pearl and "turn on Purl's extension in Settings / Safari Extensions preferences". Good enough for a first submission (Apple accepts extension-host apps whose only job is explaining how to enable the extension), but worth a copy pass.
- **App icons**: `node extension/scripts/make-icons.mjs` (repo root, uses the root's sharp) now also writes the app's `AppIcon.appiconset`: the black tile with the pearl like the PWA icon; iOS gets a full-bleed **opaque** 1024px square (App Store Connect rejects alpha in it; the converter's upscaled 128px pearl had alpha and was blurry), macOS the rounded tile on Apple's 1024 grid at every size. Dark/tinted iOS variants reuse the same image.
- **`.github/workflows/publish-safari-extension.yml`**: the CI job, **not enabled** (see below).
- **`extension/safari/scripts/build-exists.mjs`**: asks App Store Connect whether a build of a version already exists for a platform (ES256 JWT from the API key). Smoke-tested only up to Apple's 401 with a throwaway key.
- `auto-bump-versions.yml` ignores `extension/safari/`: a change to the wrapper alone doesn't bump the Chrome extension. To ship a wrapper-only change, bump `extension/public/manifest.json` by hand.

## Verified

- **macOS**: `xcodebuild -scheme "Purl (macOS)" -configuration Release` builds (ad-hoc signed, no team).
- **iOS Simulator** (iPhone 17, iOS 27.0; CoreSimulator was updated since the spike, so the Simulator works now), dev build against `pnpm dev` on `localhost:3000`:
  - The app installs and shows its page ("You can turn on Purl's Safari extension in Settings").
  - **Turning it on:** Safari → page menu (≡ in the address bar) → Manage Extensions → "Purl (dev)" switch. (In the Simulator a tap didn't flip the switch; a drag did.)
  - **The action:** once on, Purl appears **at the bottom of Safari's page menu** (≡), not as a toolbar button. Tapping it on example.com ran the save, got no token and opened the connect flow in a new tab (Purl's sign-in at `localhost`, then the "Allow Purl for Safari to access your Purl account?" consent screen; the client is now named "Purl Safari Extension" after sign-in).
  - **Connect didn't finish on iOS (fixed on `fix/ios-safari-connect`).** After sign-in and Allow access, Safari reached `/extension/connected?code=…&state=…` but the extension never caught it: the tab stayed open, no token was exchanged, nothing saved.
    - **Cause, confirmed with a debug build that beaconed the worker's events to a local logger:** the extension had no website access to Purl's site. iOS asks per site, and nothing asks while the user is on the Purl tab (the ≡ menu just says "Permission Required" under Purl). Without access, `tabs.onUpdated` still fires for the connect tab but with `changeInfo.url: ""`, so the callback never matches. With access granted (≡ → Purl → Allow), the same code closed the tab, exchanged the code and saved (201, "Saved with Purl" toast). (At the time, access was also needed for the code exchange, since the token endpoint answered CORS only for `OAUTH_CORS_ORIGINS`; it now answers any browser extension origin, so only reading the callback needs it.) Saving works without it (`/api/v1/links/save` answers CORS `*`). The worker itself is woken fine.
    - **Fix (`extension/src/background.ts`):** the extension asks for access to Purl's site (`permissions.request` with the manifest's pattern, `https://purl.live/*`, `http://localhost/*` in dev) when the click needs it. Safari refuses the request after any `await` ("Must be called during a user gesture"), so the click handler starts it first, synchronously, and the connect waits for it; a worker-start `permissions.contains` check skips the request once access is there. Refused: no tab opens, the toast says "Allow Purl to access its site to connect". Chrome grants the manifest's host permissions at install, so it never asks there (unit-tested; not re-run in Chrome).
    - **Verified in the Simulator (iPhone 17, iOS 27), fresh state** (extension storage and the site grant wiped): tap Purl on wikipedia.org → "Purl (dev) would like to access localhost" (Allow for One Day / Always Allow / Don't Allow) → allow → connect tab → Allow access → the tab closes, the page is saved, "Saved with Purl" shows on the page. With access already granted, a cold worker saves without asking. A consent denial also closes the tab now. Not verified on device: Don't Allow on the access prompt (unit-tested). Not re-run on macOS Safari, where a first connect now shows the same access prompt if the site isn't allowed yet.
    - Simulator tips: the grant lives in Safari's container under `Library/Safari/WebExtensions/Extensions.plist` (`GrantedPermissionOrigins` of `live.purl.Purl.Extension (None)`; edit with Safari stopped to reset it), extension storage in `Library/WebKit/com.apple.mobilesafari/WebExtensions/Default/live.purl.Purl.Extension (None)/LocalStorage.db`; uninstalling the app keeps both. `permissions.remove` can't drop a manifest host permission.
  - The callback page was the visible end state there, so it got fixed on this branch: it had no `<main>` or side padding (text against the screen edge) and said "The extension is connected" exactly when it wasn't. It now uses the consent page's layout (`src/app/extension/layout.tsx`) and reads "Go back to your page / If it wasn't saved, choose Purl there again.
- The extension's existing `type: module` warning from the converter is harmless (see the spike).

## Not verified

- Signing, archiving and uploading (no Apple Developer team on this Mac: `security find-identity` lists 0 identities).
- The CI workflow (needs the secrets). The App Store Connect filter names in `build-exists.mjs` (`filter[preReleaseVersion.version]`, `filter[preReleaseVersion.platform]`) are from the API docs as remembered, not run.
- Production (`https://purl.live`): the extension clients are registered by the migration on the extension branch; production needs that migration released before a store build can connect.

## Your steps (Apple accounts)

Nothing account-related has been done. In order:

1. **Apple Developer Program** (USD 99/year): enroll at developer.apple.com/programs as an individual or an organization (an organization needs a D-U-N-S number and shows the company as the seller). Note the **Team ID** (Membership details).
2. **Identifiers** (Certificates, Identifiers & Profiles → Identifiers → App IDs): register `live.purl.Purl` and `live.purl.Purl.Extension` (explicit, no extra capabilities). Xcode's automatic signing can also create them on the first signed build.
3. **App Store Connect → Apps → +**: a new app, platforms **macOS and iOS**, name "Purl" (must be unique on the store; have a fallback like "Purl – Save Links"), bundle id `live.purl.Purl`, SKU e.g. `purl-safari`. Note its **Apple ID** (App Information): that's `ASC_APP_ID`.
4. **Listing**, per platform: subtitle, description, keywords, category (Productivity), support URL `https://purl.live/support`, privacy policy `https://purl.live/privacy`, screenshots (macOS 2880×1800 or 1280×800; iPhone 6.9" 1320×2868 and iPad 13" if iPad stays enabled), App Privacy questionnaire (the extension sends the saved page's URL and title to Purl, linked to the account; no tracking), age rating, price Free, and **App Review sign-in notes**: Purl's sign-in is Google/GitHub only, so give the reviewer a way in (a demo Google account, or a note that any Google account works since sign-up is open).
5. **API key for CI** (App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys): a key with the **Admin** role (cloud-managed signing certificates need it). Download the `.p8` once. Note the **Key ID** and **Issuer ID**.
6. **GitHub secrets** (repo → Settings → Secrets → Actions): `APPLE_TEAM_ID`, `ASC_APP_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the `.p8` file's whole contents).
7. **Decide iPad**: the iOS target is universal (iPhone + iPad) as generated. Keeping iPad means iPad screenshots; dropping it means setting `TARGETED_DEVICE_FAMILY = 1` on the iOS targets.
8. Then tell me (or a session) to enable CI, and run the first submission by hand from App Store Connect once a build is processed.

## CI (proposed, not enabled)

`publish-safari-extension.yml` mirrors the Chrome job: `workflow_dispatch` on `main` only, `manifest.json`'s version is the source of truth, and a platform whose version is already in App Store Connect is skipped. A matrix runs macOS and iOS on `macos-latest`: check secrets → compare with App Store Connect → `npm ci && npm run build` → `xcodebuild archive` (`DEVELOPMENT_TEAM`, `MARKETING_VERSION` from the manifest, `CURRENT_PROJECT_VERSION` = run number, `-allowProvisioningUpdates` with the API key, so signing is automatic and cloud-managed: no certificate or profile in secrets) → `xcodebuild -exportArchive` with `method app-store-connect`, `destination upload`, which uploads directly. It uploads and stops: submitting for review stays a click in App Store Connect (the Chrome job submits; Apple's review needs per-version "What's New" text and screenshots checked, so a manual submit is safer at first).

To enable after the secrets exist: run it once by hand on `main`, fix whatever the first real run shows, then add a `publish-safari-extension` job to `release.yml` beside `publish-extension` (`gh workflow run publish-safari-extension.yml --ref main`). Pin the Xcode version then (`sudo xcode-select -s /Applications/Xcode_<version>.app`) once the runner image's Xcode list is known; App Store uploads require a recent SDK.

## Open questions / follow-ups

- Containing app copy and screenshots (design).
- First-run guidance on iOS: the action lives in the ≡ menu, and the first connect asks for access to purl.live (the system prompt says the extension can "read and alter webpages" there, which may read as alarming next to a save-only extension); the app page could say "tap ≡ in Safari's address bar, then Purl, and allow access to purl.live".
- Whether to submit automatically from CI later (App Store Connect API `appStoreVersionSubmissions`).
