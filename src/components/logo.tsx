import Image from "next/image";
import Link from "next/link";

export function Logo({ size }: { size: number }) {
  return (
    <Link href="/">
      <Image src="/logo.svg" alt="Purl" width={size} height={size} priority />
    </Link>
  );
}
