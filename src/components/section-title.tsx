import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Typography } from "./typography";

interface SectionTitleData {
  label: string;
  title: ReactNode;
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
      className={cn(
        "flex flex-col justify-start gap-5 w-full lg:max-w-lg",
        {
          "lg:items-center": align === "center",
          "lg:items-start": align === "left",
          "lg:items-end": align === "right",
          "lg:text-center": align === "center",
          "lg:text-left": align === "left",
          "lg:text-right": align === "right",
        },
        "items-center text-center",
      )}
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
