import { getAppBaseUrl } from "@/lib/billing-url";
import { getResend } from "@/lib/resend";
import prisma from "@/lib/prisma";
import { resolveEffectiveBillingState } from "@/lib/subscription-utils";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
      html: `<p>We couldn't process your latest Purl subscription payment.</p>
<p><a href="${base}/home">Open Purl</a> and use billing settings to update your card, or reply if you need help.</p>
<p>${portalUrlHint}</p>`,
    },
    { idempotencyKey: `payment-failed/${to}/${Date.now()}` },
  );
}

export async function sendSubscriptionCanceledEmail(to: string): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const base = getAppBaseUrl();
  await resend.emails.send(
    {
      from: process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>",
      to,
      subject: "Your Purl Pro subscription ended",
      html: `<p>Your Pro subscription has been canceled or expired.</p>
<p>You can keep saving links on the free plan, or <a href="${base}/#pricing">resubscribe anytime</a>.</p>`,
    },
    { idempotencyKey: `sub-canceled/${to}/${Date.now()}` },
  );
}

/**
 * If trial ends within 2 days and we haven't emailed yet, send one reminder Resend.
 */
export async function maybeNotifyTrialEnding(userId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { user: { select: { email: true } } },
  });
  if (!sub?.trialEndsAt || sub.trialEndingNotifiedAt) return;
  if (sub.planKey !== "PRO_TRIAL") return;

  const billing = await resolveEffectiveBillingState(userId);
  if (billing.planKey !== "PRO_TRIAL") return;

  const now = Date.now();
  const end = sub.trialEndsAt.getTime();
  if (end - now > TWO_DAYS_MS || end <= now) return;

  const resend = getResend();
  if (!resend || !sub.user.email) return;

  const base = getAppBaseUrl();
  const daysLeft = Math.max(1, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));

  await resend.emails.send(
    {
      from: process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>",
      to: sub.user.email,
      subject: `Your Purl Pro trial ends in ${daysLeft} days`,
      html: `<p>Your free Pro trial ends soon (${daysLeft} day(s)).</p>
<p><a href="${base}/#pricing">Upgrade to keep AI extractions and unlimited chat</a>.</p>`,
    },
    { idempotencyKey: `trial-ending/${userId}/${sub.trialEndsAt.toISOString()}` },
  );

  await prisma.subscription.update({
    where: { userId },
    data: { trialEndingNotifiedAt: new Date() },
  });
}
