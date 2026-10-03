/** Where a shared folder lives: `/@username/slug`. Safe on the client. */
export function publicFolderPath(username: string, slug: string): string {
  return `/@${username}/${slug}`;
}
