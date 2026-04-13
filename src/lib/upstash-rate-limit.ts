import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redisSingleton: Redis | null | undefined;
let warnedMissingCredentials = false;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) {
    return redisSingleton;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisSingleton = null;
    if (process.env.NODE_ENV === "production" && !warnedMissingCredentials) {
      warnedMissingCredentials = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set; rate limiting is disabled.",
      );
    }
    return null;
  }
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

function makeLimiter(
  name: string,
  max: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    prefix: `purl:rl:${name}`,
    analytics: false,
  });
}

const authLimiter = () => makeLimiter("auth", 30, "1 m");
const chatPostLimiter = () => makeLimiter("chat_post", 30, "1 m");
const linksPostLimiter = () => makeLimiter("links_post", 30, "1 m");
const uploadPostLimiter = () => makeLimiter("upload_post", 20, "1 m");
const feedbackPostLimiter = () => makeLimiter("feedback_post", 10, "1 m");

let cachedAuth: Ratelimit | null | undefined;
let cachedChat: Ratelimit | null | undefined;
let cachedLinksPost: Ratelimit | null | undefined;
let cachedUploadPost: Ratelimit | null | undefined;
let cachedFeedbackPost: Ratelimit | null | undefined;

export function getAuthRateLimiter(): Ratelimit | null {
  if (cachedAuth === undefined) cachedAuth = authLimiter();
  return cachedAuth;
}

export function getChatPostRateLimiter(): Ratelimit | null {
  if (cachedChat === undefined) cachedChat = chatPostLimiter();
  return cachedChat;
}

export function getLinksPostRateLimiter(): Ratelimit | null {
  if (cachedLinksPost === undefined) cachedLinksPost = linksPostLimiter();
  return cachedLinksPost;
}

export function getUploadPostRateLimiter(): Ratelimit | null {
  if (cachedUploadPost === undefined) cachedUploadPost = uploadPostLimiter();
  return cachedUploadPost;
}

export function getFeedbackPostRateLimiter(): Ratelimit | null {
  if (cachedFeedbackPost === undefined) {
    cachedFeedbackPost = feedbackPostLimiter();
  }
  return cachedFeedbackPost;
}
