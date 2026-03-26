import { cn } from "@/lib/utils";

interface SectionSeparatorProps {
  className?: string;
}

export default function SectionSeparator({ className }: SectionSeparatorProps) {
  return (
    <div
      className={cn(
        "z-10 h-px w-screen bg-[linear-gradient(90deg,transparent_0%,#1F1F1F_20%,#1F1F1F_80%,transparent_100%)]",
        className,
      )}
    />
  );
}
