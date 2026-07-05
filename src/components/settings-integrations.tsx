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

type ConnectedApp = {
  clientId: string;
  name: string;
  createdAt: string;
};

export function SettingsIntegrations() {
  const [keys, setKeys] = React.useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [nameInput, setNameInput] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    fetch("/api/v1/keys")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: ApiKeyItem[]) => setKeys(Array.isArray(data) ? data : []))
      .catch(() => {
        toast.error("Failed to load API keys");
        setKeys([]);
      })
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
      if (!res.ok) {
        toast.error("Failed to create API key");
        return;
      }
      const data = (await res.json()) as CreatedApiKey;
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
      setNewlyCreatedKey(null);
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  const [connectedApps, setConnectedApps] = React.useState<ConnectedApp[]>([]);
  const [connectedAppsLoading, setConnectedAppsLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/user/connected-apps")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: ConnectedApp[]) =>
        setConnectedApps(Array.isArray(data) ? data : []),
      )
      .catch(() => {
        toast.error("Failed to load connected apps");
        setConnectedApps([]);
      })
      .finally(() => setConnectedAppsLoading(false));
  }, []);

  const handleRevokeConnectedApp = async (clientId: string) => {
    try {
      const res = await fetch(`/api/user/connected-apps/${clientId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to revoke app");
        return;
      }
      setConnectedApps((prev) => prev.filter((a) => a.clientId !== clientId));
      toast.success("App disconnected");
    } catch {
      toast.error("Failed to revoke app");
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
          <Typography
            size="small"
            className="font-medium text-amber-600 dark:text-amber-400"
          >
            Copy your key now — it won&apos;t be shown again.
          </Typography>
          <div className="flex gap-2 items-center">
            <Input
              readOnly
              value={newlyCreatedKey}
              className="flex-1 font-mono text-xs"
              onFocus={(e) => e.target.select()}
              aria-label="New API key"
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
              onRevoke={() => handleRevoke(apiKey.id)}
            />
          ))}
        </div>
      )}

      <SettingsItem
        title="Connected Apps"
        description="Apps you've authorized to access Purl on your behalf via OAuth."
        actions={null}
      />

      {connectedAppsLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ) : connectedApps.length === 0 ? (
        <Typography size="small" className="text-muted-foreground">
          No connected apps yet.
        </Typography>
      ) : (
        <div className="flex flex-col gap-2">
          {connectedApps.map((app) => (
            <ConnectedAppRow
              key={app.clientId}
              app={app}
              onRevoke={() => handleRevokeConnectedApp(app.clientId)}
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
  onRevoke: () => Promise<void>;
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
      <AlertDialog
        open={alertOpen}
        onOpenChange={(v) => !revoking && setAlertOpen(v)}
      >
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

function ConnectedAppRow({
  app,
  onRevoke,
}: {
  app: ConnectedApp;
  onRevoke: () => Promise<void>;
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

  const connectedDate = new Date(app.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5 min-w-0">
        <Typography size="small" className="font-medium truncate">
          {app.name}
        </Typography>
        <Typography size="mini" className="text-muted-foreground">
          Connected {connectedDate}
        </Typography>
      </div>
      <AlertDialog
        open={alertOpen}
        onOpenChange={(v) => !revoking && setAlertOpen(v)}
      >
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
            <AlertDialogTitle>Disconnect app?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{app.name}</span> will
              immediately lose access to your Purl account. This cannot be
              undone — you&apos;d need to reconnect and re-authorize it.
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
              {revoking ? "Revoking…" : "Revoke access"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
