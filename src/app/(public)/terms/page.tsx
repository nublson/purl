export default function TermsPage() {
  return (
    <article className="w-full max-w-2xl py-16 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 2, 2025</p>
      </header>

      <Section title="Acceptance">
        <p>
          By creating an account or using Purl, you agree to these Terms of Service. If you do
          not agree, do not use Purl.
        </p>
      </Section>

      <Section title="The service">
        <p>
          Purl is a personal knowledge base that lets you save URLs, extract their content, and
          ask AI-powered questions over what you&apos;ve saved. We reserve the right to modify or
          discontinue the service at any time with reasonable notice.
        </p>
      </Section>

      <Section title="Your account">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>You must provide a valid email address and keep your credentials secure.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>You must be at least 13 years old to use Purl.</li>
        </ul>
      </Section>

      <Section title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>Use Purl to save or process illegal, harmful, or infringing content.</li>
          <li>Attempt to reverse-engineer, scrape, or abuse the service infrastructure.</li>
          <li>Share your account or resell access to Purl.</li>
          <li>Use automated tools to interact with Purl outside of our official APIs.</li>
        </ul>
      </Section>

      <Section title="Plans and billing">
        <p>
          Purl offers a Free plan and a Pro plan ($9/month). New accounts receive a 7-day Pro
          trial. Subscriptions are billed monthly and managed through Stripe. You can cancel at
          any time; access continues until the end of the current billing period.
        </p>
        <p>
          We reserve the right to change pricing with 30 days&apos; notice to existing subscribers.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          You retain ownership of the content you save to Purl. By using the service, you grant
          us a limited license to store, process, and transmit your content solely to provide
          the service to you. We do not claim any rights to your content beyond this.
        </p>
      </Section>

      <Section title="AI-generated output">
        <p>
          Purl uses AI to summarize and answer questions about your saved content. AI output may
          be inaccurate or incomplete. You are responsible for verifying any information before
          relying on it.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          The Purl name, logo, and application code are owned by us and protected by copyright.
          Nothing in these terms grants you a license to use our trademarks or branding.
        </p>
      </Section>

      <Section title="Disclaimers">
        <p>
          Purl is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
          uninterrupted availability or that the service will be error-free.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Purl&apos;s liability for any claim related to
          the service is limited to the amount you paid us in the 12 months prior to the claim.
          We are not liable for indirect, incidental, or consequential damages.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          You may delete your account at any time by contacting us. We may suspend or terminate
          accounts that violate these terms. Upon termination, your data will be deleted in
          accordance with our{" "}
          <a href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of Brazil. Any disputes will be resolved in the
          courts of Brazil.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms? Email us at{" "}
          <a href="mailto:hello@purl.nublson.com" className="underline underline-offset-4">
            hello@purl.nublson.com
          </a>
          .
        </p>
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
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}
