import Image from "next/image";
import Link from "next/link";

export function Logo({
  size,
  pathname = "/",
}: {
  size: number;
  pathname?: string;
}) {
  return (
    <Link href={pathname}>
      <Image src="/logo.svg" alt="Purl" width={size} height={size} priority />
    </Link>
  );
}
