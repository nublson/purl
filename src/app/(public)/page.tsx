import { Suspense } from "react";
import { DemoProvider } from "@/components/landing/demo-provider";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingIntro } from "@/components/landing/landing-intro";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { Logo } from "@/components/logo";
import { SignInErrorToast } from "@/components/sign-in-error-toast";
import { Typography } from "@/components/typography";
import { getSignInButtonProviders } from "@/lib/auth-providers";
import { getDemoFolders } from "@/lib/demo-folders";

// The demo reads the `purl` account's public folders; refresh hourly.
export const revalidate = 3600;

export default async function Home() {
  const providers = getSignInButtonProviders();
  const data = await getDemoFolders();
  // Fixed here so the cached HTML and hydration label days the same way.
  const now = new Date().toISOString();

  return (
    <div className="wrapper-public flex w-full flex-1 flex-col overflow-x-clip px-4 md:px-6 lg:px-12">
      <LandingIntro />
      <Suspense fallback={null}>
        <SignInErrorToast />
      </Suspense>
      <header className="flex items-center gap-2.5 py-5">
        <Logo size={28} />
        <Typography
          component="span"
          aria-hidden="true"
          className="text-lg font-semibold text-foreground"
        >
          Purl
        </Typography>
      </header>
      <main className="flex w-full flex-1 flex-col items-center">
        <LandingHero providers={providers} />
        {data ? (
          <DemoProvider data={data}>
            <LandingDemo
              data={data}
              now={now}
              className="mt-12 sm:mt-16"
            />
          </DemoProvider>
        ) : (
          <ProductPreview className="mt-12 sm:mt-16" />
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
