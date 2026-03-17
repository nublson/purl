import { User } from "./user";

export default function Header() {
  return (
    <header className="flex justify-between items-center p-4">
      <p>Purl</p>

      <User />
    </header>
  );
}
