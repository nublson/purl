import type {
  PublicFolder,
  PublicLink,
  PublicOwner,
} from "@/lib/public-folders";
import type { Link } from "@/utils/links";

/** The dedicated account whose public folders feed the landing demo. */
export const DEMO_USERNAME = "purl";

/** Links shown per demo folder (newest first). */
export const DEMO_LINKS_PER_FOLDER = 20;

/** `links` is capped at `DEMO_LINKS_PER_FOLDER`; `linkCount` is the real total. */
export type DemoFolder = PublicFolder & {
  id: string;
  linkCount: number;
  links: PublicLink[];
};

export type DemoData = { owner: PublicOwner; folders: DemoFolder[] };

/** A demo folder's links in the app's `Link` shape: unread, filed in the folder. */
export function toDemoLinks(folder: DemoFolder): Link[] {
  return folder.links.map((link) => ({
    ...link,
    folderId: folder.id,
    readAt: null,
  }));
}
