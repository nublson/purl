import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import type { auth } from "./auth";

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  sendVerificationEmail,
  deleteUser,
  updateUser,
} = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), apiKeyClient()],
});
