import { cn } from "@/lib/utils";
import { Typography } from "./typography";

interface SectionTitleData {
  label: string;
  title: string;
  description: string;
}

interface SectionTitleProps {
  data: SectionTitleData;
  align?: "center" | "left" | "right";
}

export default function SectionTitle({
  data,
  align = "center",
}: SectionTitleProps) {
  return (
    <div
      className={cn("flex flex-col justify-start gap-5", {
        "items-center": align === "center",
        "items-start": align === "left",
        "items-end": align === "right",
        "text-center": align === "center",
        "text-left": align === "left",
        "text-right": align === "right",
      })}
    >
      <Typography
        component="span"
        size="mini"
        className="text-neutral-600 uppercase font-medium"
      >
        {data.label}
      </Typography>
      <div className="flex flex-col gap-4">
        <Typography component="h2" variant="h2">
          {data.title}
        </Typography>
        <Typography className="text-muted-foreground font-light">
          {data.description}
        </Typography>
      </div>
    </div>
  );
}
