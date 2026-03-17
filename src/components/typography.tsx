import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-2xl md:text-3xl lg:text-5xl leading-[48px] tracking-[-1.5px] font-semibold text-foreground",
      h2: "text-xl md:text-2xl lg:text-3xl leading-[30px] tracking-[-1px] font-semibold text-foreground",
      h3: "text-lg md:text-xl lg:text-2xl leading-[28.8px] tracking-[-1px] font-semibold text-foreground",
      h4: "text-base md:text-lg lg:text-xl leading-6 tracking-normal font-semibold text-foreground",
      monospaced:
        "text-xs md:text-sm lg:font-mono text-base leading-6 tracking-normal font-normal",
    },
    size: {
      regular:
        "text-xs md:text-sm lg:text-base leading-6 tracking-normal text-muted-foreground",
      small:
        "text-[10px] md:text-xs lg:text-sm leading-[21px] tracking-[0.07px] text-muted-foreground",
      mini: "text-[8px] md:text-[10px] lg:text-xs leading-4 tracking-[0.18px] text-muted-foreground",
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
