import { Typography } from "../typography";

interface ChatItemGroupProps {
  title: string;
  children: React.ReactNode;
}

export default function ChatItemGroup({ title, children }: ChatItemGroupProps) {
  return (
    <div className="w-full min-w-0 md:flex-1 flex flex-col items-start justify-start gap-2">
      <Typography
        component="h3"
        size="mini"
        className="text-muted-foreground px-2.5"
      >
        {title}
      </Typography>
      <div className="flex flex-col items-start justify-start gap-1 w-full">
        {children}
      </div>
    </div>
  );
}
