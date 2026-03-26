import { Logo } from "./logo";
import { User } from "./user";

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 transform-none w-full flex justify-between items-center p-4 bg-background">
      <Logo size={32} />

      <User />
    </header>
  );
}
