import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: vi.fn(),
}));

import { getAdminSupabase } from "@/lib/supabase-admin";
import { broadcastLinksChanged } from "./realtime-broadcast";

describe("broadcastLinksChanged", () => {
  beforeEach(() => {
    vi.mocked(getAdminSupabase).mockReset();
  });

  it("resolves immediately when admin client is unavailable", async () => {
    vi.mocked(getAdminSupabase).mockReturnValue(null);

    await expect(broadcastLinksChanged("user-1")).resolves.toBeUndefined();
  });

  it("subscribes, sends broadcast on links:userId channel, then removes channel", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn((cb: (status: string) => void) => {
      queueMicrotask(() => {
        cb("SUBSCRIBED");
      });
    });
    const channelMock = { subscribe, send };
    const removeChannel = vi.fn();
    const channel = vi.fn(() => channelMock);
    vi.mocked(getAdminSupabase).mockReturnValue({
      channel,
      removeChannel,
    } as never);

    await broadcastLinksChanged("user-abc");

    expect(channel).toHaveBeenCalledWith("links:user-abc");
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: LINKS_CHANGED_EVENT,
      payload: {},
    });
    expect(removeChannel).toHaveBeenCalledWith(channelMock);
  });

  it("resolves without sending when subscribe reports CHANNEL_ERROR", async () => {
    const send = vi.fn();
    const subscribe = vi.fn((cb: (status: string) => void) => {
      queueMicrotask(() => {
        cb("CHANNEL_ERROR");
      });
    });
    const channelMock = { subscribe, send };
    const removeChannel = vi.fn();
    vi.mocked(getAdminSupabase).mockReturnValue({
      channel: vi.fn(() => channelMock),
      removeChannel,
    } as never);

    await broadcastLinksChanged("user-1");

    expect(send).not.toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalledWith(channelMock);
  });
});
