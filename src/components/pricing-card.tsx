import { Check } from "lucide-react";
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
  features: string[];
  actionText: string;
  popular?: boolean;
}

export const PricingCard = ({
  name,
  description,
  price,
  features,
  actionText,
  popular,
}: PricingCardProps) => {
  return (
    <Card className="w-full md:w-[352px] h-[544px] border-none bg-transparent px-8 py-9">
      <CardHeader className="p-0">
        <Typography
          component="span"
          size="mini"
          className="text-neutral-600 uppercase font-medium mb-5"
        >
          {name}
        </Typography>
        <CardTitle>
          <Typography component="h3" variant="h2" className="text-5xl mb-2">
            ${price}{" "}
            <Typography
              component="span"
              size="small"
              className="text-neutral-600 font-sans"
            >
              /month
            </Typography>
          </Typography>
        </CardTitle>
        <CardDescription className="line-clamp-2">
          <Typography size="small" className="text-neutral-600">
            {description}
          </Typography>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <Separator className="mb-6" />
        <ul className="text-muted-foreground flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-4" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="p-0">
        <Button
          variant={popular ? "default" : "outline"}
          size={"lg"}
          className="w-full"
        >
          {actionText}
        </Button>
      </CardFooter>
    </Card>
  );
};
