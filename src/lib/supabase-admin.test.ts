import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { getAdminSupabase } = await import("./supabase-admin");

describe("getAdminSupabase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createClient.mockClear();
  });

  it("uses the Supabase integration's URL and secret key", () => {
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role");

    expect(getAdminSupabase()).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      "sb_secret_x",
      expect.any(Object),
    );
  });

  it("falls back to the legacy service role key", () => {
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role");

    getAdminSupabase();
    expect(createClient).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      "legacy-service-role",
      expect.any(Object),
    );
  });

  it("is off without a URL (the old NEXT_PUBLIC_ name no longer counts)", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role");

    expect(getAdminSupabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
