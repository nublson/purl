import { describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).navigator.clipboard = { writeText };

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

    (globalThis as any).navigator.clipboard = {};
    (globalThis as any).document = {
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

    (globalThis as any).navigator.clipboard = {};
    (globalThis as any).document = {
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

