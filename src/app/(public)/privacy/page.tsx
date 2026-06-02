export default function PrivacyPage() {
  return (
    <article className="w-full max-w-2xl py-16 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: June 2, 2025</p>
      </header>

      <Section title="Overview">
        <p>
          Purl (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a personal knowledge base that lets you
          save and query content from the web. This policy explains what data we collect, how we
          use it, and your rights.
        </p>
      </Section>

      <Section title="Information we collect">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Account data</strong> — your email address and hashed password when you sign
            up.
          </li>
          <li>
            <strong>Saved content</strong> — URLs and the extracted text, metadata, and embeddings
            of pages you save to Purl.
          </li>
          <li>
            <strong>Usage data</strong> — how many links you&apos;ve saved and AI queries you&apos;ve made,
            for plan enforcement purposes.
          </li>
          <li>
            <strong>Billing data</strong> — payment is handled entirely by Stripe. We do not store
            card numbers or payment details.
          </li>
        </ul>
      </Section>

      <Section title="How we use your data">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>To provide and improve the Purl service.</li>
          <li>To generate AI-powered summaries and answers over your saved content.</li>
          <li>To enforce plan limits and process billing.</li>
          <li>To send transactional emails (account verification, receipts).</li>
        </ul>
        <p className="mt-3">
          We do not sell your data, use it for advertising, or share it with third parties outside
          of the service providers listed below.
        </p>
      </Section>

      <Section title="Third-party service providers">
        <p>We use the following sub-processors to operate Purl:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>
            <strong>Vercel</strong> — hosting and compute
          </li>
          <li>
            <strong>Supabase</strong> — database and real-time infrastructure
          </li>
          <li>
            <strong>Stripe</strong> — payment processing
          </li>
          <li>
            <strong>Resend</strong> — transactional email
          </li>
          <li>
            <strong>OpenAI / Anthropic (via Vercel AI Gateway)</strong> — AI processing of your
            saved content and chat queries
          </li>
        </ul>
      </Section>

      <Section title="Chrome extension">
        <p>
          The Purl browser extension reads only the URL of the active tab when you click the
          toolbar icon. It does not track browsing history, read page content, or collect any
          data passively. The URL is sent to{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">purl.nublson.com</code> solely
          to save the link to your account.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          Your data is retained as long as your account is active. You can delete individual
          saved links at any time. To delete your account and all associated data, contact us at{" "}
          <a href="mailto:hello@purl.nublson.com" className="underline underline-offset-4">
            hello@purl.nublson.com
          </a>
          .
        </p>
      </Section>

      <Section title="Security">
        <p>
          Passwords are hashed and never stored in plain text. All data is transmitted over
          HTTPS. We follow industry-standard practices to protect your information.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Purl is not directed at children under 13. We do not knowingly collect data from
          children.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we&apos;ll update the date at
          the top. Continued use of Purl after changes constitutes acceptance of the revised
          policy.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Reach us at{" "}
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
