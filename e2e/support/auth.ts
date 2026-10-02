import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { pool } from "./db";

/**
 * Test-only Better Auth instance with the `testUtils` plugin, used to mint
 * real sessions for seeded users (sign-in is OAuth-only, which a browser
 * test can't complete). It shares the app's database, secret and base URL,
 * so its session cookie is one the running app accepts. It lives only under
 * e2e/ and never ships with the app's auth config (src/lib/auth.ts).
 *
 * It talks to Postgres through the same `pg` pool as the seed helpers, so
 * the model names point Better Auth at the app's tables (prisma/schema.prisma
 * `@@map`).
 */
const testAuth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  user: {
    modelName: "users",
    additionalFields: {
      username: { type: "string", required: false, input: false },
    },
  },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  plugins: [testUtils()],
});

/** Session cookies signing `userId` in, ready for `context.addCookies`. */
export async function sessionCookies(userId: string, baseURL: string) {
  const ctx = await testAuth.$context;
  return ctx.test.getCookies({ userId, domain: new URL(baseURL).hostname });
}
