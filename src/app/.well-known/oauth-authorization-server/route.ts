import { auth } from "@/lib/auth";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

export const GET = oAuthDiscoveryMetadata(auth);
