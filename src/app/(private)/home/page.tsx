import { HomeSkeleton } from "@/components/skeletons/home";

import { Suspense } from "react";
import { ApiKeyLoader } from "./api-key-loader";

export default function Home() {
  return (
    <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-32">
      <Suspense fallback={<HomeSkeleton />}>
        <ApiKeyLoader />
      </Suspense>
    </div>
  );
}
