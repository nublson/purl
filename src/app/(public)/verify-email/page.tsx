"use client";

import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function VerifyEmail() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <Typography className="text-foreground">
              Check your email
            </Typography>
          </CardTitle>
          <CardDescription>
            <Typography size="small" className="text-muted-foreground">
              We&apos;ve sent you a verification link. Click the link in the
              email to verify your account and sign in.
            </Typography>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Typography size="small" className="text-muted-foreground">
            If you don&apos;t see the email, check your spam folder or try
            signing up again.
          </Typography>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to log in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
