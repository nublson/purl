import { SelectDefaultPage } from "./select-default-page";
import { SettingsItem } from "./settings-item";

export function SettingsPreferences() {
  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="Default page"
        description="Choose what page opens when you launch the app"
        actions={<SelectDefaultPage />}
      />
    </div>
  );
}
