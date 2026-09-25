import Header from "./header";
import { PublicHeaderActions } from "./public-header-actions";

/** Logo plus log-in / get-started actions for signed-out pages. */
export function PublicHeader() {
  return <Header pathname="/" actions={<PublicHeaderActions />} />;
}
