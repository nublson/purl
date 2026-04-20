import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "./ui/separator";

interface SettingsTab {
  label: string;
  value: string;
  content?: React.ReactNode;
}

interface SettingsTabsProps {
  tabs: SettingsTab[];
}

export function SettingsTabs({ tabs }: SettingsTabsProps) {
  return (
    <Tabs defaultValue={tabs[0].value} className="w-full gap-0">
      <TabsList variant="line" className="px-6">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <Separator />
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="p-6 pb-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
