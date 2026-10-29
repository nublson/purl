import { expect, test } from "./fixtures";

// The hourly cron that deletes uploaded blobs no row references. The local
// Blob store is fake, so the run's numbers aren't meaningful here: this
// checks the route's guard and the shape of its answer.

test.use({ signedIn: false });

test("the sweep cron answers 401 with a wrong secret and its counts with the right one", async ({
  request,
}) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set");

  const wrong = await request.get("/api/cron/sweep-uploads", {
    headers: { authorization: "Bearer not-the-secret" },
  });
  expect(wrong.status()).toBe(401);

  const right = await request.get("/api/cron/sweep-uploads", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(right.status()).toBe(200);
  expect(await right.json()).toEqual({
    listed: expect.any(Number),
    deleted: expect.any(Number),
    stopped: expect.any(Boolean),
  });
});
