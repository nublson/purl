import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Purl — Save to Read Later",
    description: "Save any page to your Purl library with one click.",
    permissions: ["activeTab", "storage"],
    host_permissions: [
      "https://purl.nublson.com/*",
      "http://localhost:3000/*",
    ],
    commands: {
      "save-current-page": {
        suggested_key: { default: "Ctrl+Shift+S", mac: "Command+Shift+S" },
        description: "Save current page to Purl",
      },
    },
  },
});
