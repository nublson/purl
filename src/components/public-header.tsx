import Header from "./header";
import { PublicHeaderActions } from "./public-header-actions";

/** Logo plus log-in / get-started actions. Used by the OAuth consent layout. */
export function PublicHeader() {
  return <Header pathname="/" actions={<PublicHeaderActions />} />;
}
