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
import { sendVerificationEmail, signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function VerifyEmail() {
  const { data: session, refetch } = useSession();
  const router = useRouter();

  async function handleResendEmail() {
    const email = session?.user?.email;
    if (!email) return;
    const res = await sendVerificationEmail({
      email,
      callbackURL: "/home",
    });
    if (res.error) {
      toast.error(res.error.message ?? "Failed to resend email.");
    } else {
      toast.success("Verification email resent. Please check your inbox.");
    }
  }

  async function handleVerified() {
    await refetch();
    const res = await fetch("/api/auth/get-session");
    const data = (await res.json()) as { user?: { emailVerified?: boolean } };
    if (data?.user?.emailVerified) {
      router.push("/home");
      router.refresh();
    } else {
      toast.error(
        "Email not verified yet. Please check your inbox and try again.",
      );
    }
  }

  return (
    <div className="wrapper-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <Typography component="h1" className="text-foreground">
              Check your email
            </Typography>
          </CardTitle>
          <CardDescription>
            <Typography size="small" className="text-muted-foreground">
              We&apos;ve sent a verification link to{" "}
              <span className="font-medium text-foreground">
                {session?.user?.email}
              </span>
              . Click the link to verify your account.
            </Typography>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Typography size="small" className="text-muted-foreground">
            If you don&apos;t see the email, check your spam folder or{" "}
            <Button
              variant="link"
              className="h-auto p-0 text-muted-foreground cursor-pointer underline underline-offset-4 hover:text-foreground"
              onClick={handleResendEmail}
            >
              resend the verification email
            </Button>
            .
          </Typography>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={handleVerified} className="w-full">
            I&apos;ve verified my email
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signOut()}
          >
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
