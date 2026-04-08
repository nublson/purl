import { vi } from "vitest";

/** Lets tests import modules that transitively pull in `server-only` (e.g. ingest → notify → realtime-broadcast). */
vi.mock("server-only", () => ({}));
