import { vi } from "vitest";

/** Lets tests import modules that transitively pull in `server-only` (e.g. ingest → notify → realtime-broadcast). */
vi.mock("server-only", () => ({}));

function globalFetchLooksMocked(g: typeof globalThis.fetch): boolean {
  return (
    typeof g === "function" &&
    "mock" in g &&
    typeof (g as { mock: unknown }).mock === "object"
  );
}

/**
 * `safeFetch` uses Undici's `fetch` (not `globalThis.fetch`). Tests that stub or spy
 * on `globalThis.fetch` should still intercept outbound requests in unit tests.
 */
vi.mock("undici", async (importOriginal) => {
  const mod = await importOriginal<typeof import("undici")>();
  const realFetch = mod.fetch;
  return {
    ...mod,
    fetch: (
      input: Parameters<typeof mod.fetch>[0],
      init?: Parameters<typeof mod.fetch>[1],
    ) => {
      const g = globalThis.fetch;
      if (globalFetchLooksMocked(g)) {
        return g(input as RequestInfo, init as RequestInit) as unknown as ReturnType<
          typeof realFetch
        >;
      }
      return realFetch(input, init);
    },
  };
});

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
