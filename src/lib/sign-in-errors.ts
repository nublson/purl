/**
 * Maps a Better Auth `error` query-param code (from `errorCallbackURL`) to a
 * human-readable message for the sign-in error toast. Returns `null` when
 * there is no code to report.
 */
export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;

  switch (code) {
    case "account_not_linked":
      return "This email is already linked to another sign-in method. Use the one you signed up with.";
    case "access_denied":
      return "Sign-in was cancelled.";
    default:
      return "We couldn't sign you in. Try again.";
  }
}
