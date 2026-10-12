/**
 * A signal that aborts after `ms`, or sooner when `outer` aborts (a caller
 * giving up on the whole operation). Every request in a lookup chain gets its
 * own timeout this way and is still cancelled together with the lookup.
 */
export function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return outer ? AbortSignal.any([outer, timeout]) : timeout;
}
