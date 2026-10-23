// The extension's OAuth callback page reads its query (?error=), so like
// /oauth/consent it can't live under the force-static (public) group. It takes
// the consent page's <main> (landmark, page margins, centered column).
export { default } from "@/app/oauth/layout";
