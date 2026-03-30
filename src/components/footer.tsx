import Link from "next/link";
import footerNavigation from "../data/footer-navigation.json";
import { Logo } from "./logo";

export default function Footer() {
  return (
    <footer className="wrapper-public flex flex-col md:flex-row gap-8 justify-between items-center p-12 text-muted-foreground text-xs">
      <Logo size={24} />

      <ul className="flex gap-4">
        {footerNavigation.map((item) => (
          <li
            className="hover:underline hover:text-foreground transition-all duration-100"
            key={item.path}
          >
            <Link href={item.path}>{item.title}</Link>
          </li>
        ))}
      </ul>

      <p>© 2026 Purl.</p>
    </footer>
  );
}
