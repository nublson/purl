import { Typography } from "@/components/typography";

export default function PrivacyPage() {
  return (
    <article className="w-full max-w-2xl py-16 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Typography variant="h3" component="h1">
          Privacy Policy
        </Typography>
        <Typography size="small">Last updated: June 2, 2025</Typography>
      </header>

      <Section title="Overview">
        <Typography size="small">
          Purl (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a personal knowledge base
          that lets you save and query content from the web. This policy explains what data we
          collect, how we use it, and your rights.
        </Typography>
      </Section>

      <Section title="Information we collect">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <Typography size="small" component="span">
              <strong className="text-foreground">Account data</strong> — your email address and
              hashed password when you sign up.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              <strong className="text-foreground">Saved content</strong> — URLs and the extracted
              text, metadata, and embeddings of pages you save to Purl.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              <strong className="text-foreground">Usage data</strong> — how many links you&apos;ve
              saved and AI queries you&apos;ve made, for plan enforcement purposes.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              <strong className="text-foreground">Billing data</strong> — payment is handled
              entirely by Stripe. We do not store card numbers or payment details.
            </Typography>
          </li>
        </ul>
      </Section>

      <Section title="How we use your data">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <Typography size="small" component="span">
              To provide and improve the Purl service.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              To generate AI-powered summaries and answers over your saved content.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              To enforce plan limits and process billing.
            </Typography>
          </li>
          <li>
            <Typography size="small" component="span">
              To send transactional emails (account verification, receipts).
            </Typography>
          </li>
        </ul>
        <Typography size="small">
          We do not sell your data, use it for advertising, or share it with third parties
          outside of the service providers listed below.
        </Typography>
      </Section>

      <Section title="Third-party service providers">
        <Typography size="small">
          We use the following sub-processors to operate Purl:
        </Typography>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {[
            ["Vercel", "hosting and compute"],
            ["Supabase", "database and real-time infrastructure"],
            ["Stripe", "payment processing"],
            ["Resend", "transactional email"],
            [
              "OpenAI / Anthropic (via Vercel AI Gateway)",
              "AI processing of your saved content and chat queries",
            ],
          ].map(([name, desc]) => (
            <li key={name}>
              <Typography size="small" component="span">
                <strong className="text-foreground">{name}</strong> — {desc}
              </Typography>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Chrome extension">
        <Typography size="small">
          The Purl browser extension reads only the URL of the active tab when you click the
          toolbar icon. It does not track browsing history, read page content, or collect any
          data passively. The URL is sent to{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">purl.nublson.com</code> solely
          to save the link to your account.
        </Typography>
      </Section>

      <Section title="Data retention">
        <Typography size="small">
          Your data is retained as long as your account is active. You can delete individual
          saved links at any time. To delete your account and all associated data, contact us at{" "}
          <a href="mailto:hello@purl.nublson.com" className="underline underline-offset-4">
            hello@purl.nublson.com
          </a>
          .
        </Typography>
      </Section>

      <Section title="Security">
        <Typography size="small">
          Passwords are hashed and never stored in plain text. All data is transmitted over
          HTTPS. We follow industry-standard practices to protect your information.
        </Typography>
      </Section>

      <Section title="Children">
        <Typography size="small">
          Purl is not directed at children under 13. We do not knowingly collect data from
          children.
        </Typography>
      </Section>

      <Section title="Changes to this policy">
        <Typography size="small">
          We may update this policy from time to time. When we do, we&apos;ll update the date at
          the top. Continued use of Purl after changes constitutes acceptance of the revised
          policy.
        </Typography>
      </Section>

      <Section title="Contact">
        <Typography size="small">
          Questions? Reach us at{" "}
          <a href="mailto:hello@purl.nublson.com" className="underline underline-offset-4">
            hello@purl.nublson.com
          </a>
          .
        </Typography>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Typography variant="h4" component="h2">
        {title}
      </Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
