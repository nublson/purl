import type { ProviderId } from "@/lib/auth-providers";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.27-2.09 3.58-5.17 3.58-8.84Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.94H1.27v3.11C3.25 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a11.99 11.99 0 0 0 0 10.8l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.6l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.29 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.13 3.02-.83.96-2.13 1.7-3.28 1.62-.15-1.1.44-2.26 1.13-3.02.83-.94 2.28-1.65 3.28-1.62ZM20.6 17.14c-.5 1.16-.74 1.68-1.38 2.72-.9 1.45-2.16 3.26-3.74 3.28-1.4.02-1.76-.9-3.66-.9-1.9 0-2.3.88-3.7.92-1.58.05-2.78-1.57-3.68-3.02-2.02-3.27-2.24-7.12-.99-9.16.9-1.47 2.3-2.33 3.62-2.33 1.35 0 2.2.93 3.32.93 1.09 0 1.75-.94 3.31-.94 1.18 0 2.43.65 3.32 1.76-2.92 1.6-2.44 5.76.58 6.74Z" />
    </svg>
  );
}

/** Provider "brand" icon, sized by `className`. Used by sign-in buttons and Task 7's account UI. */
export function ProviderIcon({
  provider,
  className,
}: {
  provider: ProviderId;
  className?: string;
}) {
  switch (provider) {
    case "google":
      return <GoogleIcon className={className} />;
    case "github":
      return <GithubIcon className={className} />;
    case "apple":
      return <AppleIcon className={className} />;
  }
}
