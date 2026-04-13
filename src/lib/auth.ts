import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import { getResend } from "@/lib/resend";

export const auth = betterAuth({
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
        console.error("RESEND_API_KEY is not set; skipping verification email.");
        return;
      }
      const { error } = await resend.emails.send(
        {
          from: process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>",
          to: user.email,
          subject: "Verify your email address",
          html: `<p>Click the link to verify your email: <a href="${url}">${url}</a></p>`,
        },
        { idempotencyKey: `verification-email/${user.id}/${Date.now()}` }
      );
      if (error) {
        console.error("Failed to send verification email:", error.message);
      }
    },
  },
});
