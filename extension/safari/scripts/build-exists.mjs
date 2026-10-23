#!/usr/bin/env node
// Prints "true" when App Store Connect already has a build of this version for
// this platform, else "false". publish-safari-extension.yml uses it to skip a
// release whose manifest version was already uploaded (like the Chrome job's
// store check).
//
//   node extension/safari/scripts/build-exists.mjs <version> <MAC_OS|IOS>
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (the .p8 API key), ASC_APP_ID.
import crypto from "node:crypto";
import fs from "node:fs";

const [version, platform] = process.argv.slice(2);
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, ASC_APP_ID } = process.env;
if (!version || !platform || !ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH || !ASC_APP_ID) {
  console.error("usage: build-exists.mjs <version> <MAC_OS|IOS> (with ASC_* env set)");
  process.exit(2);
}

// App Store Connect API token: an ES256 JWT, valid for at most 20 minutes.
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64url({
  iss: ASC_ISSUER_ID,
  iat: now,
  exp: now + 600,
  aud: "appstoreconnect-v1",
})}`;
const signature = crypto
  .sign("sha256", Buffer.from(unsigned), {
    key: fs.readFileSync(ASC_KEY_PATH, "utf-8"),
    dsaEncoding: "ieee-p1363",
  })
  .toString("base64url");

const url = new URL("https://api.appstoreconnect.apple.com/v1/builds");
url.searchParams.set("filter[app]", ASC_APP_ID);
url.searchParams.set("filter[preReleaseVersion.version]", version);
url.searchParams.set("filter[preReleaseVersion.platform]", platform);
url.searchParams.set("limit", "1");

const res = await fetch(url, { headers: { Authorization: `Bearer ${unsigned}.${signature}` } });
if (!res.ok) {
  console.error(`App Store Connect answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { data } = await res.json();
console.log(data.length > 0 ? "true" : "false");
