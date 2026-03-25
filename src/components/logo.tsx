import Image from "next/image";

export function Logo({ size }: { size: number }) {
  return (
    <Image src="/logo.svg" alt="Purl" width={size} height={size} priority />
  );
}
