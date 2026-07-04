import { auth } from "@/lib/auth";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

export const GET = oAuthProtectedResourceMetadata(auth);
