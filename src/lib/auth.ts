import { betterAuth } from "better-auth";
import { Resend } from "resend";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

// TODO: Add your database adapter (e.g. prismaAdapter) when Prisma is set up.
export const auth = betterAuth({
  database: undefined as unknown as Parameters<typeof betterAuth>[0]["database"],
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
        { idempotencyKey: `verification-email/${user.id}` }
      );
      if (error) {
        console.error("Failed to send verification email:", error.message);
      }
    },
  },
});
