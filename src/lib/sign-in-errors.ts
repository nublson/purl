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

/**
 * Maps a Better Auth `error` query-param code from a failed Settings →
 * Connect (`linkSocial` with `errorCallbackURL: "/home?settings=account"`) to
 * a message for the connect-error toast. Returns `null` when there is no code.
 */
export function connectErrorMessage(code: string | null): string | null {
  if (!code) return null;

  switch (code) {
    case "account_already_linked_to_different_user":
      return "That account is already used by another Purl account.";
    case "unable_to_link_account":
      return "We couldn't connect that account. Make sure its email is verified.";
    case "access_denied":
      return "Connection was cancelled.";
    default:
      return "We couldn't connect that account. Try again.";
  }
}
