import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-[88px] leading-[92.4px] font-normal font-serif text-foreground",
      h2: "text-[54px] font-normal font-serif text-foreground",
      h3: "text-2xl font-normal font-serif text-foreground",
      h4: "text-xl font-normal font-serif text-foreground",
      monospaced: "text-base font-normal font-serif",
    },
    size: {
      regular: "text-base leading-6 tracking-normal text-muted-foreground",
      small: "text-sm leading-[21px] tracking-[0.07px] text-muted-foreground",
      mini: "text-xs leading-4 tracking-[0.18px] text-muted-foreground",
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
type TypographyVariant = "h1" | "h2" | "h3" | "h4" | "monospaced";
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
