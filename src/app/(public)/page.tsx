import { Suspense } from "react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingIntro } from "@/components/landing/landing-intro";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { Logo } from "@/components/logo";
import { SignInErrorToast } from "@/components/sign-in-error-toast";
import { Typography } from "@/components/typography";
import { getSignInButtonProviders } from "@/lib/auth-providers";
import { LANDING_SEEN_SCRIPT } from "@/lib/landing-intro";

export default function Home() {
  const providers = getSignInButtonProviders();

  return (
    <div className="wrapper-public flex w-full flex-1 flex-col overflow-x-clip px-4 md:px-6 lg:px-12">
      <script dangerouslySetInnerHTML={{ __html: LANDING_SEEN_SCRIPT }} />
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
        <ProductPreview className="mt-12 sm:mt-16" />
      </main>
      <LandingFooter />
    </div>
  );
}
