import Link from "next/link";

export default function Footer() {
  return (
    <footer className="wrapper-public flex justify-between items-center p-12 text-muted-foreground text-xs">
      <p>Purl</p>

      <ul className="flex gap-4">
        <li>
          <Link href="/features">Features</Link>
        </li>
        <li>
          <Link href="/pricing">Pricing</Link>
        </li>
        <li>
          <Link href="/privacy">Privacy</Link>
        </li>
        <li>
          <Link href="/terms">Terms</Link>
        </li>
      </ul>

      <p>© 2026 Purl.</p>
    </footer>
  );
}
