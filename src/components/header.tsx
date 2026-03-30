import { Logo } from "./logo";

interface HeaderProps {
  children: React.ReactNode;
}

export default function Header({ children }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 transform-none">
      <div className="w-full flex justify-between items-center p-4 bg-linear-to-b from-background to-transparent">
        <Logo size={32} />

        {children}
      </div>
    </header>
  );
}
