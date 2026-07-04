import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "@better-auth/api-key";
import prisma from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { createTrialSubscription } from "@/lib/subscription-utils";

export const auth = betterAuth({
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      defaultPrefix: "purl_",
      // Per-key rate limiting defaults to 10 requests/day, which is far too low
      // for the MCP server (every request re-validates the key) and the REST
      // API. Abuse protection is handled at the proxy layer (Upstash).
      rateLimit: {
        enabled: false,
      },
      customAPIKeyGetter: (ctx) => {
        // Extract token from "Authorization: Bearer purl_..." header
        // GenericEndpointContext is a Better Auth internal type — cast via unknown
        type CtxLike = {
          request?: { headers?: { get?: (k: string) => string | null } };
          headers?: { get?: (k: string) => string | null };
        };
        const c = ctx as unknown as CtxLike;
        const authHeader =
          c.request?.headers?.get?.("authorization") ??
          c.headers?.get?.("authorization") ??
          null;
        if (typeof authHeader !== "string") return null;
        if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) return null;
        return authHeader.slice(7);
      },
    }),
    mcp({
      loginPage: "/login",
      oidcConfig: {
        loginPage: "/login",
        consentPage: "/oauth/consent",
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await createTrialSubscription(user.id);
          } catch (e) {
            console.error("createTrialSubscription failed", e);
          }
        },
      },
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      preferences: {
        type: "json",
        required: false,
        input: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const resend = getResend();
      if (!resend) {
        console.error(
          "RESEND_API_KEY is not set; skipping verification email.",
        );
        return;
      }
      const { error } = await resend.emails.send(
        {
          from: process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>",
          to: user.email,
          subject: "Verify your email address",
          html: `<p>Click the link to verify your email: <a href="${url}">${url}</a></p>`,
        },
        { idempotencyKey: `verification-email/${user.id}/${Date.now()}` },
      );
      if (error) {
        console.error("Failed to send verification email:", error.message);
      }
    },
  },
});
