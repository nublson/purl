"use client";

import * as React from "react";
import { toast } from "sonner";
import { SettingsItem } from "./settings-item";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type KeyState =
  | { status: "loading" }
  | { status: "no_key" }
  | { status: "has_key"; maskedKey: string };

export function ByokKeyItem() {
  const [keyState, setKeyState] = React.useState<KeyState>({ status: "loading" });
  const [showInput, setShowInput] = React.useState(false);
  const [keyInput, setKeyInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/user/byok")
      .then((r) => r.json())
      .then((data: { hasKey: boolean; maskedKey: string | null }) => {
        if (data.hasKey && data.maskedKey) {
          setKeyState({ status: "has_key", maskedKey: data.maskedKey });
        } else {
          setKeyState({ status: "no_key" });
        }
      })
      .catch(() => setKeyState({ status: "no_key" }));
  }, []);

  const handleSave = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      toast.error("Key must start with sk-ant-");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save key");
        return;
      }
      setKeyState({ status: "has_key", maskedKey: data.maskedKey });
      setShowInput(false);
      setKeyInput("");
      toast.success("Anthropic API key saved");
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/user/byok", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove key");
        return;
      }
      setKeyState({ status: "no_key" });
      toast.success("API key removed");
    } catch {
      toast.error("Failed to remove key");
    } finally {
      setRemoving(false);
    }
  };

  const description =
    keyState.status === "has_key"
      ? keyState.maskedKey
      : "Add your Anthropic API key to use AI features for free";

  const actions =
    keyState.status === "loading" ? null : keyState.status === "has_key" ? (
      <Button
        variant="secondary"
        size="sm"
        className="cursor-pointer"
        onClick={handleRemove}
        disabled={removing}
      >
        {removing ? "Removing…" : "Remove"}
      </Button>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        className="cursor-pointer"
        onClick={() => setShowInput((v) => !v)}
        disabled={saving}
      >
        Add key
      </Button>
    );

  return (
    <div className="flex flex-col gap-3">
      <SettingsItem
        title="Anthropic API Key"
        description={description}
        actions={actions}
      />
      {keyState.status === "no_key" && showInput && (
        <div className="flex gap-2 items-center">
          <Input
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            disabled={saving}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={() => void handleSave()}
            disabled={saving || !keyInput.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              setShowInput(false);
              setKeyInput("");
            }}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
