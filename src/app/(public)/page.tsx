import { Suspense } from "react";
import HeroSection from "@/sections/hero";
import { SignInErrorToast } from "@/components/sign-in-error-toast";
import { getSignInButtonProviders } from "@/lib/auth-providers";

export default function Home() {
  const providers = getSignInButtonProviders();

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center">
      <Suspense fallback={null}>
        <SignInErrorToast />
      </Suspense>
      <HeroSection providers={providers} />
    </div>
  );
}
