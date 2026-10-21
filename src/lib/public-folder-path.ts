/** Where a shared folder lives: `/@username/slug`. Safe on the client. */
export function publicFolderPath(username: string, slug: string): string {
  return `/@${username}/${slug}`;
}

/** The folder's Atom feed: `/@username/slug/feed.xml`. */
export function publicFolderFeedPath(username: string, slug: string): string {
  return `${publicFolderPath(username, slug)}/feed.xml`;
}

/** The title shared by the page and its feed: "🎨 Design by @nublson". */
export function publicFolderTitle(
  emoji: string,
  name: string,
  username: string,
): string {
  return `${emoji} ${name} by @${username}`;
}
