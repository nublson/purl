import { Suspense } from "react";
import { DemoProvider } from "@/components/landing/demo-provider";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingIntro } from "@/components/landing/landing-intro";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { SignInErrorToast } from "@/components/sign-in-error-toast";
import { getSignInButtonProviders } from "@/lib/auth-providers";
import { getDemoFolders } from "@/lib/demo-folders";

// Static (also set by the (public) layout; stated here so the page keeps it).
// The demo reads the `purl` account's public folders; refresh hourly.
export const dynamic = "force-static";
export const revalidate = 3600;

export default async function Home() {
  const providers = getSignInButtonProviders();
  // At build time (CI has no database) a failed read shows the still panel.
  // At runtime it throws, so a failed revalidation keeps serving the last
  // good page instead of caching the still one for an hour.
  const data = await getDemoFolders().catch((error: unknown) => {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error;
    console.error("Landing demo: could not read the demo folders", error);
    return null;
  });
  // Fixed here so the cached HTML and hydration label days the same way.
  const now = new Date().toISOString();

  return (
    <div className="wrapper-public flex w-full flex-1 flex-col overflow-x-clip px-4 md:px-6 lg:px-12">
      <LandingIntro />
      <Suspense fallback={null}>
        <SignInErrorToast />
      </Suspense>
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
