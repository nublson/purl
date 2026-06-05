import Image from "next/image";
import Link from "next/link";

export function Logo({
  size,
  pathname,
}: {
  size: number;
  pathname?: string;
}) {
  const image = (
    <Image src="/logo.svg" alt="Purl" width={size} height={size} priority />
  );

  if (pathname === undefined) {
    return image;
  }

  return <Link href={pathname}>{image}</Link>;
}
