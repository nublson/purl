import { Typography } from "@/components/typography";

interface CopySectionProps {
  title: string;
  children: React.ReactNode;
}

export function CopySection({ title, children }: CopySectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
