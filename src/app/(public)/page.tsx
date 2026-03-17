import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-4 min-h-screen items-center justify-center">
      <h1>Hello Purl!</h1>

      <p className="text-sm text-muted-foreground">
        <Link href="/signup">Start for free</Link> or{" "}
        <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
