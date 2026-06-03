import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  sendVerificationEmail,
  deleteUser,
  updateUser,
} = createAuthClient({
  plugins: [apiKeyClient()],
});
