import { SelectChatWidget } from "./select-chat-widget";
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
      <SettingsItem
        title="Chat Widget"
        description="Enable chat widget in the home page"
        actions={<SelectChatWidget />}
      />
    </div>
  );
}
