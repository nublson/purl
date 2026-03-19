import { describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (
      globalThis as unknown as {
        navigator: { clipboard: { writeText: typeof writeText } };
      }
    ).navigator.clipboard = { writeText };

    await expect(copyToClipboard("hello")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to document.execCommand(\"copy\") when navigator clipboard is missing", async () => {
    const textarea = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      select: vi.fn(),
    };

    const body = {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    const execCommand = vi.fn().mockReturnValue(true);

    (
      globalThis as unknown as {
        navigator: { clipboard: Record<string, unknown> };
        document: {
          createElement: (tagName: string) => typeof textarea;
          body: {
            appendChild: (node: typeof textarea) => void;
            removeChild: (node: typeof textarea) => void;
          };
          execCommand: (commandId: string) => boolean;
        };
      }
    ).navigator.clipboard = {};
    (
      globalThis as unknown as {
        document: {
          createElement: (tagName: string) => typeof textarea;
          body: {
            appendChild: (node: typeof textarea) => void;
            removeChild: (node: typeof textarea) => void;
          };
          execCommand: (commandId: string) => boolean;
        };
      }
    ).document = {
      createElement: vi.fn().mockReturnValue(textarea),
      body,
      execCommand,
    };

    await expect(copyToClipboard("fallback")).resolves.toBeUndefined();

    expect(body.appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
    expect(textarea.value).toBe("fallback");
  });

  it("throws when fallback execCommand(\"copy\") fails", async () => {
    const textarea = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      select: vi.fn(),
    };

    const body = {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    const execCommand = vi.fn().mockReturnValue(false);

    (
      globalThis as unknown as {
        navigator: { clipboard: Record<string, unknown> };
        document: {
          createElement: (tagName: string) => typeof textarea;
          body: {
            appendChild: (node: typeof textarea) => void;
            removeChild: (node: typeof textarea) => void;
          };
          execCommand: (commandId: string) => boolean;
        };
      }
    ).navigator.clipboard = {};
    (
      globalThis as unknown as {
        document: {
          createElement: (tagName: string) => typeof textarea;
          body: {
            appendChild: (node: typeof textarea) => void;
            removeChild: (node: typeof textarea) => void;
          };
          execCommand: (commandId: string) => boolean;
        };
      }
    ).document = {
      createElement: vi.fn().mockReturnValue(textarea),
      body,
      execCommand,
    };

    await expect(copyToClipboard("fail")).rejects.toThrow(
      "execCommand copy failed",
    );
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });
});

