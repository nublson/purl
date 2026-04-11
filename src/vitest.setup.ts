import { vi } from "vitest";

/** Lets tests import modules that transitively pull in `server-only` (e.g. ingest → notify → realtime-broadcast). */
vi.mock("server-only", () => ({}));

/**
 * RFC 5737 TEST-NET-2 — treated as public by SSRF guards.
 * Module mock survives `vi.restoreAllMocks()` in individual test files (unlike `spyOn`).
 */
vi.mock("node:dns/promises", () => {
  const MOCK_PUBLIC_LOOKUP = { address: "198.51.100.10", family: 4 as const };
  return {
    default: {
      lookup: vi.fn(
        (_hostname: string, options?: { all?: boolean }) =>
          options?.all
            ? Promise.resolve([MOCK_PUBLIC_LOOKUP])
            : Promise.resolve(MOCK_PUBLIC_LOOKUP),
      ),
    },
  };
});
