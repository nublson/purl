import { Logo } from "./logo";
import { User } from "./user";

export default function Header() {
  return (
    <header className="flex justify-between items-center p-4">
      <Logo size={32} />

      <User />
    </header>
  );
}
