import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) {
    return redisSingleton;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production.",
      );
    }
    redisSingleton = null;
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

const v1Limiter = () => makeLimiter("v1", 120, "1 m");
const v1PostLimiter = () => makeLimiter("v1_post", 60, "1 m");

let cachedAuth: Ratelimit | null | undefined;
let cachedChat: Ratelimit | null | undefined;
let cachedLinksPost: Ratelimit | null | undefined;
let cachedUploadPost: Ratelimit | null | undefined;
let cachedV1: Ratelimit | null | undefined;
let cachedV1Post: Ratelimit | null | undefined;
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

export function getV1RateLimiter(): Ratelimit | null {
  if (cachedV1 === undefined) cachedV1 = v1Limiter();
  return cachedV1;
}

export function getV1PostRateLimiter(): Ratelimit | null {
  if (cachedV1Post === undefined) cachedV1Post = v1PostLimiter();
  return cachedV1Post;
}

export function getFeedbackPostRateLimiter(): Ratelimit | null {
  if (cachedFeedbackPost === undefined) {
    cachedFeedbackPost = feedbackPostLimiter();
  }
  return cachedFeedbackPost;
}
