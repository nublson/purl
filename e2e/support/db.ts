import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * Direct database access for seeding and cleanup, through plain `pg` rather
 * than the app's generated Prisma client: that client is an ES module with
 * circular imports, which Playwright's CommonJS test loader can't load.
 * playwright.config.ts has already checked DATABASE_URL points at a local
 * database. Tables and columns follow prisma/schema.prisma (`@@map` names,
 * camelCase columns); ids and timestamps Prisma would fill in are set here.
 */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type TestUser = { id: string; email: string; username: string };

/**
 * Creates (or reuses) a `@purl.test` user. `.test` is a reserved domain
 * (RFC 2606), so these can never collide with a real account. Sign-in is
 * OAuth-only, so there's no credential account: tests get a session through
 * `sessionCookies` instead.
 */
export async function createTestUser(email: string, name: string): Promise<TestUser> {
  const username = `e2e-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const { rows } = await pool.query<TestUser>(
    `INSERT INTO "users" ("id", "name", "email", "emailVerified", "username", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, now(), now())
     ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now()
     RETURNING "id", "email", "username"`,
    [randomUUID(), name, email, username],
  );
  return rows[0];
}

/** Removes the user's links and folders, so each test starts empty. */
export async function resetTestUserData(userId: string): Promise<void> {
  await pool.query(`DELETE FROM "links" WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM "folders" WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM "username_redirects" WHERE "userId" = $1`, [userId]);
  // The layout is saved on the account: every test starts in the list,
  // without folder tags.
  await pool.query(
    `UPDATE "users" SET "linkView" = 'LIST', "showFolderTags" = false WHERE "id" = $1`,
    [userId],
  );
}

/** Deletes the user; links, folders, sessions and accounts cascade. */
export async function deleteTestUser(userId: string): Promise<void> {
  await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);
}

/** Inserts a link row directly: no metadata fetch, no outbound HTTP. */
export async function seedLink(
  userId: string,
  {
    url,
    title,
    description,
    folderId,
    read,
  }: {
    url: string;
    title?: string;
    description?: string;
    folderId?: string;
    read?: boolean;
  },
): Promise<string> {
  const domain = new URL(url).hostname;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO "links" ("id", "url", "title", "description", "favicon", "domain", "userId", "folderId", "readAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      url,
      title ?? domain,
      description ?? null,
      `https://${domain}/favicon.ico`,
      domain,
      userId,
      folderId ?? null,
      read ? new Date() : null,
    ],
  );
  return id;
}

export async function seedFolder(
  userId: string,
  {
    name,
    slug,
    emoji,
    description,
    isPublic = false,
  }: {
    name: string;
    slug: string;
    emoji?: string;
    description?: string;
    isPublic?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO "folders" ("id", "name", "slug", "emoji", "description", "isPublic", "userId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [id, name, slug, emoji ?? null, description ?? null, isPublic, userId],
  );
  return id;
}

/** Shares or unshares a folder directly (for signed-out tests). */
export async function setFolderPublic(folderId: string, isPublic: boolean): Promise<void> {
  await pool.query(`UPDATE "folders" SET "isPublic" = $2 WHERE "id" = $1`, [folderId, isPublic]);
}
