import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";

export interface PricingCardProps {
  name: string;
  description: string;
  price: string;
  priceSubLabel?: string;
  features: string[];
  actionText: string;
  popular?: boolean;
  /** Default signup/home link when onCtaClick is not set */
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaLoading?: boolean;
  /** Shown under the primary CTA when `onCtaClick` is set (e.g. billing portal). */
  secondaryAction?: {
    text: string;
    onClick: () => void;
    loading?: boolean;
  };
  /** When set, replaces the default CTA footer entirely. */
  footer?: React.ReactNode;
  /** Omit the footer row (e.g. feature-only column in a dialog). */
  hideFooter?: boolean;
  className?: string;
}

export const PricingCard = ({
  name,
  description,
  price,
  priceSubLabel,
  features,
  actionText,
  popular,
  ctaHref = "/signup",
  onCtaClick,
  ctaLoading,
  secondaryAction,
  footer: footerOverride,
  hideFooter,
  className,
}: PricingCardProps) => {
  const busy = Boolean(ctaLoading || secondaryAction?.loading);

  const defaultFooter = onCtaClick ? (
    <Button
      variant={popular ? "default" : "outline"}
      size="lg"
      className="w-full"
      onClick={onCtaClick}
      disabled={busy}
    >
      {actionText}
    </Button>
  ) : (
    <Button variant={popular ? "default" : "outline"} size="lg" className="w-full" asChild>
      <Link href={ctaHref}>{actionText}</Link>
    </Button>
  );

  const footerInner =
    footerOverride !== undefined ? (
      footerOverride
    ) : (
      <div className="flex w-full flex-col gap-2">
        {defaultFooter}
        {secondaryAction && onCtaClick ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={secondaryAction.onClick}
            disabled={busy}
          >
            {secondaryAction.loading ? "Opening…" : secondaryAction.text}
          </Button>
        ) : null}
      </div>
    );

  return (
    <Card
      className={cn(
        "min-h-[544px] w-full border-none bg-transparent px-8 py-9 md:w-[352px]",
        className,
      )}
    >
      <CardHeader className="p-0">
        <Typography
          component="span"
          size="mini"
          className="text-muted-foreground uppercase font-medium mb-5"
        >
          {name}
        </Typography>
        <CardTitle>
          <Typography
            component="h3"
            variant="h2"
            className="text-5xl mb-2 inline-flex items-baseline gap-2 flex-wrap"
          >
            {price}
            {priceSubLabel ? (
              <Typography
                component="span"
                size="small"
                className="text-muted-foreground font-sans font-normal !text-base"
              >
                {priceSubLabel}
              </Typography>
            ) : null}
          </Typography>
        </CardTitle>
        <CardDescription className="line-clamp-2">
          <Typography size="small" className="text-muted-foreground">
            {description}
          </Typography>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <Separator className="mb-6" />
        <ul className="text-muted-foreground flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      {hideFooter ? null : <CardFooter className="p-0">{footerInner}</CardFooter>}
    </Card>
  );
};
