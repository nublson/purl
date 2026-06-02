import { Typography } from "@/components/typography";

export default function TermsPage() {
  return (
    <article className="w-full max-w-2xl py-16 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Typography variant="h1" component="h1">
          Terms of Service
        </Typography>
        <Typography size="small">Last updated: June 2, 2025</Typography>
      </header>

      <Section title="Acceptance">
        <Typography size="small">
          By creating an account or using Purl, you agree to these Terms of
          Service. If you do not agree, do not use Purl.
        </Typography>
      </Section>

      <Section title="The service">
        <Typography size="small">
          Purl is a personal knowledge base that lets you save URLs, extract
          their content, and ask AI-powered questions over what you&apos;ve
          saved. We reserve the right to modify or discontinue the service at
          any time with reasonable notice.
        </Typography>
      </Section>

      <Section title="Your account">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <Typography size="small" component="span">
              You must provide a valid email address and keep your credentials
              secure.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              You are responsible for all activity that occurs under your
              account.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              You must be at least 13 years old to use Purl.
            </Typography>
          </li>
        </ul>
      </Section>

      <Section title="Acceptable use">
        <Typography size="small">You agree not to:</Typography>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <Typography size="small" component="span">
              Use Purl to save or process illegal, harmful, or infringing
              content.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              Attempt to reverse-engineer, scrape, or abuse the service
              infrastructure.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              Share your account or resell access to Purl.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              Use automated tools to interact with Purl outside of our official
              APIs.
            </Typography>
          </li>
        </ul>
      </Section>

      <Section title="Plans and billing">
        <Typography size="small">
          Purl offers a Free plan and a Pro plan ($9/month). New accounts
          receive a 7-day Pro trial. Subscriptions are billed monthly and
          managed through Stripe. You can cancel at any time; access continues
          until the end of the current billing period.
        </Typography>
        <Typography size="small">
          We reserve the right to change pricing with 30 days&apos; notice to
          existing subscribers.
        </Typography>
      </Section>

      <Section title="Your content">
        <Typography size="small">
          You retain ownership of the content you save to Purl. By using the
          service, you grant us a limited license to store, process, and
          transmit your content solely to provide the service to you. We do not
          claim any rights to your content beyond this.
        </Typography>
      </Section>

      <Section title="AI-generated output">
        <Typography size="small">
          Purl uses AI to summarize and answer questions about your saved
          content. AI output may be inaccurate or incomplete. You are
          responsible for verifying any information before relying on it.
        </Typography>
      </Section>

      <Section title="Intellectual property">
        <Typography size="small">
          The Purl name, logo, and application code are owned by us and
          protected by copyright. Nothing in these terms grants you a license to
          use our trademarks or branding.
        </Typography>
      </Section>

      <Section title="Disclaimers">
        <Typography size="small">
          Purl is provided &quot;as is&quot; without warranties of any kind. We
          do not guarantee uninterrupted availability or that the service will
          be error-free.
        </Typography>
      </Section>

      <Section title="Limitation of liability">
        <Typography size="small">
          To the maximum extent permitted by law, Purl&apos;s liability for any
          claim related to the service is limited to the amount you paid us in
          the 12 months prior to the claim. We are not liable for indirect,
          incidental, or consequential damages.
        </Typography>
      </Section>

      <Section title="Termination">
        <Typography size="small">
          You may delete your account at any time by contacting us. We may
          suspend or terminate accounts that violate these terms. Upon
          termination, your data will be deleted in accordance with our{" "}
          <a href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </a>
          .
        </Typography>
      </Section>

      <Section title="Governing law">
        <Typography size="small">
          These terms are governed by the laws of Brazil. Any disputes will be
          resolved in the courts of Brazil.
        </Typography>
      </Section>

      <Section title="Contact">
        <Typography size="small">
          Questions about these terms? Email us at{" "}
          <a
            href="mailto:me@nublson.com"
            className="underline underline-offset-4"
          >
            me@nublson.com
          </a>
          .
        </Typography>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Typography variant="h4" component="h2">
        {title}
      </Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
