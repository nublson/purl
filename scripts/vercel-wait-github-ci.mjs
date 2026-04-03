#!/usr/bin/env node
/**
 * Vercel ignoreCommand hook (see vercel.json).
 * Exit 0  -> skip/cancel this deployment (build does not run).
 * Exit 1+ -> continue with the Vercel build.
 *
 * Waits for GitHub Actions check suites on the relevant commit to finish,
 * then proceeds only if all GitHub Actions suites succeeded (or neutral/skipped).
 *
 * Only runs for deployments tied to an open PR (VERCEL_GIT_PULL_REQUEST_ID).
 * Merges to develop/main build immediately without waiting.
 *
 * Requires env GITHUB_WAIT_TOKEN on Vercel (classic PAT: repo scope, or
 * fine-grained: Contents read + Checks read). Preview is enough if only PR
 * previews are gated.
 */

const POLL_MS = 15_000;
const MAX_WAIT_MS = 40 * 60 * 1000;

function exit(code) {
  process.exit(code);
}

const token = process.env.GITHUB_WAIT_TOKEN?.trim();
const owner = process.env.VERCEL_GIT_REPO_OWNER;
const repo = process.env.VERCEL_GIT_REPO_SLUG;
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const prId = process.env.VERCEL_GIT_PULL_REQUEST_ID?.trim() ?? "";

if (!token) {
  console.warn(
    "[vercel-wait-github-ci] GITHUB_WAIT_TOKEN is not set; allowing build. Add the token in Vercel env vars to gate on GitHub Actions.",
  );
  exit(1);
}

if (!owner || !repo || !commitSha) {
  console.warn(
    "[vercel-wait-github-ci] Missing VERCEL_GIT_REPO_OWNER / VERCEL_GIT_REPO_SLUG / VERCEL_GIT_COMMIT_SHA; allowing build.",
  );
  exit(1);
}

if (!prId) {
  exit(1);
}

async function githubJson(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${path} -> ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function resolveSha() {
  const pr = await githubJson(`/repos/${owner}/${repo}/pulls/${prId}`);
  return pr.head?.sha ?? commitSha;
}

function isBadConclusion(c) {
  return ["failure", "cancelled", "timed_out", "action_required"].includes(c);
}

function isOkConclusion(c) {
  return ["success", "neutral", "skipped"].includes(c);
}

const start = Date.now();

const sha = await resolveSha();
console.log(`[vercel-wait-github-ci] Waiting for GitHub Actions on ${sha.slice(0, 7)}…`);

while (Date.now() - start < MAX_WAIT_MS) {
  const data = await githubJson(
    `/repos/${owner}/${repo}/commits/${sha}/check-suites?per_page=100`,
  );
  const suites = (data.check_suites ?? []).filter((s) => s.app?.slug === "github-actions");

  if (suites.length === 0) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue;
  }

  const pending = suites.filter((s) => s.status !== "completed");
  if (pending.length > 0) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue;
  }

  const failed = suites.filter((s) => isBadConclusion(s.conclusion));
  if (failed.length > 0) {
    console.error(
      `[vercel-wait-github-ci] GitHub Actions failed (${failed.map((s) => s.conclusion).join(", ")}); canceling deployment.`,
    );
    exit(0);
  }

  const unknown = suites.filter((s) => !isOkConclusion(s.conclusion));
  if (unknown.length > 0) {
    console.error(
      `[vercel-wait-github-ci] Unexpected check suite conclusion(s): ${unknown.map((s) => s.conclusion).join(", ")}; canceling deployment.`,
    );
    exit(0);
  }

  console.log("[vercel-wait-github-ci] All GitHub Actions check suites passed; proceeding with Vercel build.");
  exit(1);
}

console.error("[vercel-wait-github-ci] Timed out waiting for GitHub Actions; canceling deployment.");
exit(0);
