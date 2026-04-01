import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_ERROR_EVENT,
  UPLOAD_START_EVENT,
  UPLOAD_SUCCESS_EVENT,
} from "@/utils/upload-events";
import { AUDIO_MAX_UPLOAD_BYTES } from "@/utils/upload-limits";
import { toast } from "sonner";
import { uploadFileAsLink } from "./upload-file-client";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("uploadFileAsLink", () => {
  const dispatchEvent = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    dispatchEvent.mockReset();
    fetchMock.mockReset();
    vi.mocked(toast.error).mockReset();

    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "CustomEvent",
      class CustomEvent<T = unknown> extends Event {
        detail?: T;
        constructor(type: string, params?: CustomEventInit<T>) {
          super(type);
          this.detail = params?.detail;
        }
      },
    );
  });

  it("returns early and shows toast for oversized audio without calling fetch", async () => {
    const buf = new Uint8Array(AUDIO_MAX_UPLOAD_BYTES + 1);
    const file = new File([buf], "big.mp3", { type: "audio/mpeg" });

    const result = await uploadFileAsLink(file);

    expect(result).toEqual({});
    expect(toast.error).toHaveBeenCalledWith("Audio files must be under 5 MB");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("dispatches start and success events on successful upload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "link-123" }),
    });
    const file = new File(["pdf"], "resume.pdf", { type: "application/pdf" });

    const result = await uploadFileAsLink(file);

    expect(result).toEqual({ id: "link-123" });
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    const [startEvent] = dispatchEvent.mock.calls[0];
    const [successEvent] = dispatchEvent.mock.calls[1];
    expect(startEvent.type).toBe(UPLOAD_START_EVENT);
    expect((startEvent as Event & { detail?: { label: string } }).detail).toEqual(
      { label: "resume.pdf" },
    );
    expect(successEvent.type).toBe(UPLOAD_SUCCESS_EVENT);
    expect(
      (successEvent as Event & { detail?: { id?: string } }).detail,
    ).toEqual({ id: "link-123" });
  });

  it("dispatches error event and throws API error message on non-OK response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Bad upload" }),
    });
    const file = new File(["pdf"], "resume.pdf", { type: "application/pdf" });

    await expect(uploadFileAsLink(file)).rejects.toThrow("Bad upload");
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    const [startEvent] = dispatchEvent.mock.calls[0];
    const [errorEvent] = dispatchEvent.mock.calls[1];
    expect(startEvent.type).toBe(UPLOAD_START_EVENT);
    expect(errorEvent.type).toBe(UPLOAD_ERROR_EVENT);
  });

  it("dispatches error event and rethrows on network failures", async () => {
    fetchMock.mockRejectedValue(new Error("network failed"));
    const file = new File(["pdf"], "resume.pdf", { type: "application/pdf" });

    await expect(uploadFileAsLink(file)).rejects.toThrow("network failed");
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    const [startEvent] = dispatchEvent.mock.calls[0];
    const [errorEvent] = dispatchEvent.mock.calls[1];
    expect(startEvent.type).toBe(UPLOAD_START_EVENT);
    expect(errorEvent.type).toBe(UPLOAD_ERROR_EVENT);
  });
});
