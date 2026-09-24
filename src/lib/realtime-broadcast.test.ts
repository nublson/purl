import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: vi.fn(),
}));

import { after } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  broadcastLinksChanged,
  sendLinksChangedBroadcast,
} from "./realtime-broadcast";

function mockAdminClient(httpSend: ReturnType<typeof vi.fn>) {
  const channelMock = { httpSend };
  const channel = vi.fn(() => channelMock);
  const removeChannel = vi.fn();
  vi.mocked(getAdminSupabase).mockReturnValue({
    channel,
    removeChannel,
  } as never);
  return { channel, channelMock, removeChannel };
}

describe("broadcastLinksChanged", () => {
  beforeEach(() => {
    vi.mocked(getAdminSupabase).mockReset();
    vi.mocked(after).mockReset();
  });

  it("defers the send with after() instead of blocking the caller", async () => {
    const httpSend = vi.fn().mockResolvedValue({ success: true });
    const { channel } = mockAdminClient(httpSend);

    broadcastLinksChanged("user-abc");

    expect(after).toHaveBeenCalledTimes(1);
    expect(httpSend).not.toHaveBeenCalled();

    const task = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await task();

    expect(channel).toHaveBeenCalledWith("links:user-abc");
    expect(httpSend).toHaveBeenCalledTimes(1);
  });
});

describe("sendLinksChangedBroadcast", () => {
  beforeEach(() => {
    vi.mocked(getAdminSupabase).mockReset();
  });

  it("resolves immediately when admin client is unavailable", async () => {
    vi.mocked(getAdminSupabase).mockReturnValue(null);

    await expect(sendLinksChangedBroadcast("user-1")).resolves.toBeUndefined();
  });

  it("sends over HTTP on links:userId channel, then removes channel", async () => {
    const httpSend = vi.fn().mockResolvedValue({ success: true });
    const { channel, channelMock, removeChannel } = mockAdminClient(httpSend);

    await sendLinksChangedBroadcast("user-abc");

    expect(channel).toHaveBeenCalledWith("links:user-abc");
    expect(httpSend).toHaveBeenCalledWith(
      LINKS_CHANGED_EVENT,
      {},
      { timeout: 5000 },
    );
    expect(removeChannel).toHaveBeenCalledWith(channelMock);
  });

  it("includes the origin tab id in the payload when given", async () => {
    const httpSend = vi.fn().mockResolvedValue({ success: true });
    mockAdminClient(httpSend);

    await sendLinksChangedBroadcast("user-abc", "tab-1");

    expect(httpSend).toHaveBeenCalledWith(
      LINKS_CHANGED_EVENT,
      { origin: "tab-1" },
      { timeout: 5000 },
    );
  });

  it("swallows httpSend errors and still removes the channel", async () => {
    const httpSend = vi.fn().mockRejectedValue(new Error("boom"));
    const { channelMock, removeChannel } = mockAdminClient(httpSend);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendLinksChangedBroadcast("user-1")).resolves.toBeUndefined();

    expect(removeChannel).toHaveBeenCalledWith(channelMock);
    errorSpy.mockRestore();
  });
});
