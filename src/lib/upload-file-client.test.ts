import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_ERROR_EVENT,
  UPLOAD_START_EVENT,
  UPLOAD_SUCCESS_EVENT,
} from "@/utils/upload-events";
import { uploadFileAsLink } from "./upload-file-client";

describe("uploadFileAsLink", () => {
  const dispatchEvent = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    dispatchEvent.mockReset();
    fetchMock.mockReset();

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
