import { betterAuth } from "better-auth";
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
      customAPIKeyGetter: (ctx) => {
        // Extract token from "Authorization: Bearer purl_..." header
        const authHeader =
          (ctx as any).request?.headers?.get?.("authorization") ??
          (ctx as any).headers?.get?.("authorization") ??
          null;
        if (typeof authHeader !== "string") return null;
        if (!authHeader.startsWith("Bearer ")) return null;
        return authHeader.slice(7);
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
