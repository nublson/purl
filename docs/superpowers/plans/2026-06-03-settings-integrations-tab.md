# Settings Integrations Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Integrations" tab to the Settings dialog where users can create, view, and revoke their public API keys.

**Architecture:** A new `SettingsIntegrations` client component handles all API key operations via `fetch` calls to the existing `/api/v1/keys` and `/api/v1/keys/:id` endpoints (session-cookie auth). It follows the same patterns as `byok-key-item.tsx` (local state, fetch, sonner toasts). The tab is wired in `dialog-settings.tsx` alongside the existing Usage and Account tabs. No new API routes, no new tests — this is pure UI.

**Tech Stack:** React (client component), shadcn/ui (Button, Input, AlertDialog), sonner toasts, existing `SettingsItem` + `SettingsTabs` components.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `src/components/settings-integrations.tsx` | API key list, create form, revoke flow |
| Modify | `src/components/dialog-settings.tsx` | Add Integrations tab |

---

## Codebase Context

Read these files before implementing to understand patterns:

- `src/components/byok-key-item.tsx` — pattern for fetch-based settings items with local state
- `src/components/settings-item.tsx` — `SettingsItem` component (title + description + actions slot)
- `src/components/delete-account-item.tsx` — AlertDialog confirmation pattern
- `src/components/settings-account.tsx` — simple settings tab structure
- `src/components/dialog-settings.tsx` — how tabs are wired

Key existing UI components available (all from `@/components/ui/`):
- `Button` — `variant="secondary"`, `variant="destructive"`, `variant="ghost"`, `size="sm"`
- `Input` — standard text input
- `Skeleton` — loading placeholder
- `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel` — confirmation dialog
- `Badge` — small label chips
- `Separator` — horizontal rule

Key existing components available directly from `@/components/`:
- `SettingsItem` — renders `ItemTitle + ItemDescription + ItemActions` row
- `Typography` — text with `size` prop (`"small"`, `"mini"`, `"base"`)

---

## API Shape

**`GET /api/v1/keys`** — returns array of key objects:
```typescript
type ApiKeyItem = {
  id: string;
  name: string | null;
  start: string | null;    // displayable prefix, e.g. "purl_abc"
  createdAt: string;       // ISO date string
};
```

**`POST /api/v1/keys`** body `{ name: string }` — returns created key object including:
```typescript
type CreatedApiKey = ApiKeyItem & {
  key: string;   // the full token like "purl_sk_abc123..." — shown ONCE, then gone
};
```

**`DELETE /api/v1/keys/:id`** — returns `204 No Content` on success.

---

## Task 1: Create `SettingsIntegrations` component

**Files:**
- Create: `src/components/settings-integrations.tsx`

This component manages the full lifecycle: load keys on mount, create key with name, display the raw token once, revoke with confirmation.

- [ ] **Step 1: Create the file**

Create `src/components/settings-integrations.tsx` with the following content:

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";
import { SettingsItem } from "./settings-item";
import { Typography } from "./typography";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

type ApiKeyItem = {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
};

type CreatedApiKey = ApiKeyItem & { key: string };

export function SettingsIntegrations() {
  const [keys, setKeys] = React.useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [nameInput, setNameInput] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/v1/keys")
      .then((r) => r.json())
      .then((data: ApiKeyItem[]) => setKeys(Array.isArray(data) ? data : []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const name = nameInput.trim() || "API Key";
    setCreating(true);
    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as CreatedApiKey;
      if (!res.ok) {
        toast.error("Failed to create API key");
        return;
      }
      setKeys((prev) => [data, ...prev]);
      setNewlyCreatedKey(data.key);
      setShowCreateForm(false);
      setNameInput("");
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to revoke key");
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (newlyCreatedKey) setNewlyCreatedKey(null);
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col gap-4">
      <SettingsItem
        title="API Keys"
        description="Use API keys to access Purl from external apps and scripts."
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              setShowCreateForm((v) => !v);
              setNewlyCreatedKey(null);
            }}
          >
            {showCreateForm ? "Cancel" : "Create key"}
          </Button>
        }
      />

      {showCreateForm && (
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Key name (optional)"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            disabled={creating}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") {
                setShowCreateForm(false);
                setNameInput("");
              }
            }}
          />
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      )}

      {newlyCreatedKey && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <Typography size="small" className="font-medium text-amber-600 dark:text-amber-400">
            Copy your key now — it won&apos;t be shown again.
          </Typography>
          <div className="flex gap-2 items-center">
            <Input
              readOnly
              value={newlyCreatedKey}
              className="flex-1 font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              size="sm"
              className="cursor-pointer shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(newlyCreatedKey);
                toast.success("Copied to clipboard");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ) : keys.length === 0 ? (
        <Typography size="small" className="text-muted-foreground">
          No API keys yet.
        </Typography>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((apiKey) => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              onRevoke={() => void handleRevoke(apiKey.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKeyItem;
  onRevoke: () => void;
}) {
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
      setAlertOpen(false);
    }
  };

  const createdDate = new Date(apiKey.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5 min-w-0">
        <Typography size="small" className="font-medium truncate">
          {apiKey.name ?? "API Key"}
        </Typography>
        <Typography size="mini" className="text-muted-foreground font-mono">
          {apiKey.start ?? "purl_…"} · Created {createdDate}
        </Typography>
      </div>
      <AlertDialog open={alertOpen} onOpenChange={(v) => !revoking && setAlertOpen(v)}>
        <AlertDialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer shrink-0"
          >
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="default" className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any apps or scripts using{" "}
              <span className="font-medium">{apiKey.name ?? "this key"}</span>{" "}
              will stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revoking}
              className="cursor-pointer"
              onClick={() => void handleRevoke()}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings-integrations.tsx
git commit -m "feat(settings): add SettingsIntegrations component for API key management"
```

---

## Task 2: Wire the Integrations tab into the Settings dialog

**Files:**
- Modify: `src/components/dialog-settings.tsx`

The current file has Usage and Account tabs. Add Integrations as the third tab.

- [ ] **Step 1: Update `dialog-settings.tsx`**

The current file content:

```tsx
"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";
import { Badge } from "./ui/badge";
import type { UsageMeterData } from "./usage-item";

interface SettingsDialogProps {
  children: React.ReactNode;
  usageSummary?: UsageMeterData | null;
}

export function SettingsDialog({
  children,
  usageSummary = null,
}: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      className="md:min-w-xl"
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      description="Manage your settings"
      content={
        <SettingsContent
          closeDialog={() => setOpen(false)}
          usageSummary={usageSummary}
        />
      }
    >
      {children}
    </DialogWrapper>
  );
}

function SettingsContent({
  closeDialog,
  usageSummary,
}: {
  closeDialog: () => void;
  usageSummary: UsageMeterData | null;
}) {
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";

  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          badge: isTrial ? (
            <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">
              Trial
            </Badge>
          ) : undefined,
          content: <SettingsUsage data={usageSummary} />,
        },
        {
          label: "Account",
          value: "account",
          content: <SettingsAccount closeDialog={closeDialog} />,
        },
      ]}
    />
  );
}
```

Replace it entirely with:

```tsx
"use client";

import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { SettingsAccount } from "./settings-account";
import { SettingsIntegrations } from "./settings-integrations";
import { SettingsTabs } from "./settings-tabs";
import { SettingsUsage } from "./settings-usage";
import { Badge } from "./ui/badge";
import type { UsageMeterData } from "./usage-item";

interface SettingsDialogProps {
  children: React.ReactNode;
  usageSummary?: UsageMeterData | null;
}

export function SettingsDialog({
  children,
  usageSummary = null,
}: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DialogWrapper
      className="md:min-w-xl"
      open={open}
      onOpenChange={setOpen}
      title="Settings"
      description="Manage your settings"
      content={
        <SettingsContent
          closeDialog={() => setOpen(false)}
          usageSummary={usageSummary}
        />
      }
    >
      {children}
    </DialogWrapper>
  );
}

function SettingsContent({
  closeDialog,
  usageSummary,
}: {
  closeDialog: () => void;
  usageSummary: UsageMeterData | null;
}) {
  const isTrial = usageSummary?.effectivePlanKey === "PRO_TRIAL";

  return (
    <SettingsTabs
      tabs={[
        {
          label: "Usage",
          value: "usage",
          badge: isTrial ? (
            <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">
              Trial
            </Badge>
          ) : undefined,
          content: <SettingsUsage data={usageSummary} />,
        },
        {
          label: "Account",
          value: "account",
          content: <SettingsAccount closeDialog={closeDialog} />,
        },
        {
          label: "Integrations",
          value: "integrations",
          content: <SettingsIntegrations />,
        },
      ]}
    />
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors (6 pre-existing lint warnings are fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/dialog-settings.tsx
git commit -m "feat(settings): add Integrations tab for API key management"
```

---

## Manual Verification

1. Run `pnpm dev`
2. Sign in to the app
3. Open Settings (any trigger in the nav)
4. Confirm three tabs: **Usage**, **Account**, **Integrations**
5. On the Integrations tab:
   - Confirm empty state shows "No API keys yet."
   - Click **Create key** → an inline name input appears
   - Type a name, press Enter or click Create
   - Confirm the amber banner appears with the full `purl_...` token and a Copy button
   - Click Copy → toast "Copied to clipboard"
   - Confirm the key row appears in the list with name + prefix + created date
   - Click **Revoke** on a key → AlertDialog appears with key name
   - Confirm revoke → key disappears from list, toast "API key revoked"
   - Refresh page → list reloads from the server correctly
