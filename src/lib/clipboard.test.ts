import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  function setNavigatorClipboard(
    clipboard: { writeText?: (value: string) => Promise<void> } | Record<string, never>,
  ) {
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard },
      configurable: true,
      writable: true,
    });
  }

  function setDocumentMock(documentMock: {
    createElement: (tagName: string) => unknown;
    body: {
      appendChild: (node: unknown) => void;
      removeChild: (node: unknown) => void;
    };
    execCommand: (commandId: string) => boolean;
  }) {
    Object.defineProperty(globalThis, "document", {
      value: documentMock,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorClipboard({ writeText });

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

    setNavigatorClipboard({});
    setDocumentMock({
      createElement: vi.fn().mockReturnValue(textarea),
      body,
      execCommand,
    });

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

    setNavigatorClipboard({});
    setDocumentMock({
      createElement: vi.fn().mockReturnValue(textarea),
      body,
      execCommand,
    });

    await expect(copyToClipboard("fail")).rejects.toThrow(
      "execCommand copy failed",
    );
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });
});

