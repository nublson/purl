import SectionSeparator from "./section-separator";

interface SectionWrapperProps {
  children: React.ReactNode;
  id?: string;
}

export default function SectionWrapper({ children, id }: SectionWrapperProps) {
  return (
    <section
      id={id}
      className="w-full flex flex-col items-center justify-start gap-20 pt-[100px]"
    >
      {children}
      <SectionSeparator />
    </section>
  );
}
