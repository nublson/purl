import { beforeEach, describe, expect, it, vi } from "vitest";

type ToastOptions = {
  duration?: number;
  action?: { label: string; onClick: () => void };
  onAutoClose?: () => void;
  onDismiss?: () => void;
};

const successMock = vi.fn<(message: string, options?: ToastOptions) => void>();
const errorMock = vi.fn();
const dismissMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: successMock, error: errorMock, dismiss: dismissMock },
}));

const {
  cancelPendingLinkDelete,
  deleteLinkWithUndo,
  getLinkDeletePhase,
  isLinkDeletePending,
  LINK_DELETE_FADE_MS,
  LINK_DELETE_UNDO_MS,
} = await import("./pending-link-deletes");

function lastToastOptions(): ToastOptions {
  const call = successMock.mock.calls.at(-1);
  if (!call?.[1]) throw new Error("no toast options");
  return call[1];
}

describe("deleteLinkWithUndo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    successMock.mockReset();
    errorMock.mockReset();
    dismissMock.mockReset();
  });

  it("hides the link and shows 'Link deleted' with Undo, without deleting yet", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    deleteLinkWithUndo("link-a", { onDeleted: vi.fn() });

    expect(isLinkDeletePending("link-a")).toBe(true);
    expect(successMock).toHaveBeenCalledWith("Link deleted", expect.anything());
    const options = lastToastOptions();
    expect(options.duration).toBe(LINK_DELETE_UNDO_MS);
    expect(options.action?.label).toBe("Undo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Undo brings the link back and never sends the delete", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDeleted = vi.fn();
    deleteLinkWithUndo("link-b", { onDeleted });
    const options = lastToastOptions();

    options.action?.onClick();
    // Sonner may still report the toast closing after the action.
    options.onDismiss?.();

    expect(isLinkDeletePending("link-b")).toBe(false);
    expect(dismissMock).toHaveBeenCalledWith("link-delete-link-b");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("registers the delete immediately, fading then hidden on its own timer", () => {
    vi.useFakeTimers();
    deleteLinkWithUndo("link-f", { onDeleted: vi.fn() });

    // The toast and pending delete exist before any row animation ends, so
    // the row unmounting (e.g. navigation) can't lose the delete.
    expect(successMock).toHaveBeenCalledTimes(1);
    expect(getLinkDeletePhase("link-f")).toBe("fading");

    vi.advanceTimersByTime(LINK_DELETE_FADE_MS);
    expect(getLinkDeletePhase("link-f")).toBe("hidden");
  });

  it("saving the same link again cancels its pending delete", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    deleteLinkWithUndo("link-g", { onDeleted: vi.fn() });
    const options = lastToastOptions();

    cancelPendingLinkDelete("link-g");
    options.onDismiss?.();

    expect(isLinkDeletePending("link-g")).toBe(false);
    expect(dismissMock).toHaveBeenCalledWith("link-delete-link-g");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cancelPendingLinkDelete is a no-op for links not being deleted", () => {
    expect(() => cancelPendingLinkDelete("unknown")).not.toThrow();
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("deletes once when the toast closes, then calls onDeleted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const onDeleted = vi.fn();
    deleteLinkWithUndo("link-c", { onDeleted });
    const options = lastToastOptions();

    options.onAutoClose?.();
    options.onDismiss?.();
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // keepalive so a reload or navigation right after can't cancel it.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/links/link-c",
      expect.objectContaining({ method: "DELETE", keepalive: true }),
    );
    // Stays hidden until the list reload drops the row.
    expect(isLinkDeletePending("link-c")).toBe(true);
  });

  it("brings the link back with an error toast when the delete fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    const onDeleted = vi.fn();
    deleteLinkWithUndo("link-d", { onDeleted });

    lastToastOptions().onAutoClose?.();
    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith(
        "Unable to delete the link. Try again.",
      ),
    );

    expect(isLinkDeletePending("link-d")).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("asks to check the connection when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    deleteLinkWithUndo("link-e", { onDeleted: vi.fn() });

    lastToastOptions().onDismiss?.();
    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith(
        "Unable to delete the link. Check your connection and try again.",
      ),
    );
    expect(isLinkDeletePending("link-e")).toBe(false);
  });
});
