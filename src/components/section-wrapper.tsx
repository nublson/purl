import SectionSeparator from "./section-separator";

export default function SectionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="w-full flex flex-col items-center justify-start gap-20 pt-[100px]">
      {children}
      <SectionSeparator />
    </section>
  );
}
