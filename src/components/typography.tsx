import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-6xl sm:text-7xl md:text-display font-normal font-serif tracking-[-0.01em] text-balance text-foreground",
      h2: "text-4xl leading-[1.1] md:text-title font-normal font-serif tracking-[-0.02em] text-balance text-foreground",
      h3: "text-2xl leading-tight font-normal font-serif text-balance text-foreground",
      h4: "text-xl leading-tight font-normal font-serif text-balance text-foreground",
    },
    size: {
      regular: "text-base leading-normal text-muted-foreground",
      small: "text-sm leading-normal text-muted-foreground",
      mini: "text-xs leading-snug tracking-[0.015em] text-muted-foreground",
    },
  },
});

type TypographyComponent =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "span"
  | "a"
  | "li";
type TypographyVariant = "h1" | "h2" | "h3" | "h4";
type TypographySize = "regular" | "small" | "mini";

interface BaseTypographyProps extends React.HTMLAttributes<HTMLElement> {
  component?: TypographyComponent;
}

// Props when using variant (variant has priority, size is not allowed)
interface VariantTypographyProps extends BaseTypographyProps {
  variant: TypographyVariant;
  size?: never;
  component?: TypographyComponent;
}

// Props when using size or neither (no variant allowed, defaults to size="regular")
interface SizeTypographyProps extends BaseTypographyProps {
  variant?: never;
  size?: TypographySize;
  component?: TypographyComponent;
}

type TypographyProps = VariantTypographyProps | SizeTypographyProps;

function Typography({
  className,
  component = "p",
  variant,
  size,
  children,
  ...props
}: TypographyProps) {
  const Component: React.ElementType = component;

  // Variant has priority over size - if variant exists, size is not applied
  // Default size is "regular" when no variant and no size is provided
  const finalSize = variant ? undefined : (size ?? "regular");

  return (
    <Component
      className={cn(
        typographyVariants({
          variant,
          size: finalSize,
          className,
        }),
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export { Typography, typographyVariants };
export type { TypographyComponent, TypographySize, TypographyVariant };
