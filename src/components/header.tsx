import { Logo } from "./logo";

interface HeaderProps {
  pathname?: string;
  children: React.ReactNode;
}

export default function Header({ children, pathname }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 transform-none">
      <div className="w-full flex justify-between items-center p-4 bg-linear-to-b from-background to-transparent">
        <Logo size={32} pathname={pathname} />

        {children}
      </div>
    </header>
  );
}
