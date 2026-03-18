import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Resend } from "resend";
import prisma from "@/lib/prisma";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
