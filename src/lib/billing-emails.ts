import { getAppBaseUrl } from "@/lib/billing-url";
import { getResend } from "@/lib/resend";

export async function sendPaymentFailedEmail(
  to: string,
  portalUrlHint: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const base = getAppBaseUrl();
  await resend.emails.send(
    {
      from: process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>",
      to,
      subject: "Action needed: update your Purl payment method",
      html: `<p>We couldn't process your latest Purl payment.</p>
<p><a href="${base}/home">Open Purl</a> or reply if you need help.</p>
<p>${portalUrlHint}</p>`,
    },
    { idempotencyKey: `payment-failed/${to}/${Date.now()}` },
  );
}
